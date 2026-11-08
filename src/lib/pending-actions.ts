/** Domain owner for undoable optimistic operations. No React, DOM, or toast dependency. */
export type PendingOperationPhase = "queued" | "paused" | "waiting" | "running" | "complete" | "undone" | "cancelled" | "failed" | "needs-attention";
export type PendingActionOutcome = {
  status: "complete" | "needs-attention" | "failed" | "cancelled";
  succeededResourceIds: readonly string[];
  failedResourceIds: readonly string[];
  resources?: readonly Readonly<{ id: string; status: "complete" | "failed" | "cancelled" | "needs-attention"; code?: string }>[];
  message?: string;
};
export type PendingOperationSnapshot = {
  readonly id: string;
  readonly message: string;
  readonly phase: PendingOperationPhase;
  readonly revision: number;
  readonly resourceIds: readonly string[];
  readonly createdResourceIds: readonly string[];
  readonly dependencyIds: readonly string[];
  readonly blockers: readonly ("resource-held" | "creation-dependency")[];
  readonly allowedCommands: readonly ("undo" | "submit" | "cancel")[];
  readonly undoUntil?: number;
  readonly progressMessage?: string;
  readonly submittingMessage?: string;
  readonly error?: string;
  readonly errorHandled: boolean;
  readonly outcome?: PendingActionOutcome;
};
export type PendingActionController = {
  id: string;
  cancel: () => boolean;
  submit: () => boolean;
  undo: () => boolean;
  /** Provider callback completion, distinct from accepting the optimistic action. */
  completion: Promise<boolean>;
};
export type PendingActionOptions = {
  coalesceKey?: string;
  createsResourceIds?: Iterable<string>;
  duration: number;
  submitImmediately?: boolean;
  onSettled?: () => void;
  resourceScoped?: boolean;
  onUndo: (resourceIds: ReadonlySet<string>) => void;
  onSubmit: (reportProgress: (message: string) => void, resourceIds: ReadonlySet<string>) => Promise<void | PendingActionOutcome> | void | PendingActionOutcome;
  onError?: (error: unknown) => void;
  resourceIds?: Iterable<string>;
  submittingMessage?: string;
};
export type PendingActionSyncSnapshot = {
  pausedResourceIds: readonly string[];
  pendingResourceIds: readonly string[];
};
type OperationId = string;
type PendingAction = {
  supersede: (ids: ReadonlySet<string>) => ((restoreIds?: ReadonlySet<string>) => void) | null;
  completion: Promise<boolean>;
  controls: PendingActionController;
  createdResourceIds: ReadonlySet<string>;
  isPaused: () => boolean;
  pause: () => void;
  refresh: (message: string, duration: number) => void;
  replace: (message: string, options: PendingActionOptions) => void;
  resourceIds: ReadonlySet<string>;
  resume: () => void;
  submit: () => boolean;
  undo: () => boolean;
  coalesceKey?: string;
};
type Scheduler = {
  now: () => number;
  schedule: (callback: () => void, delay: number) => unknown;
  cancel: (timer: unknown) => void;
};
type PendingOperationListener = (operation: PendingOperationSnapshot, controls: PendingActionController) => void;
const emptySyncSnapshot: PendingActionSyncSnapshot = { pausedResourceIds: [], pendingResourceIds: [] };
const emptyOperations: readonly PendingOperationSnapshot[] = Object.freeze([]);
const defaultScheduler: Scheduler = {
  now: Date.now,
  schedule: (callback, delay) => setTimeout(callback, delay),
  cancel: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

export function createPendingActionStore(scheduler: Scheduler = defaultScheduler) {
  const operationSnapshots = new Map<string, PendingOperationSnapshot>();
  const operationListeners = new Set<PendingOperationListener>();
  let operationsSnapshot = emptyOperations;
  const pendingActions = new Map<OperationId, PendingAction>();
  const pendingCoalescedActions = new Map<string, PendingAction>();
  const submittingActions = new Set<PendingAction>();
  const activeActions = new Set<OperationId>();
  const activeCreationActions = new Set<PendingAction>();
  const resourceHolds = new Map<string, ReadonlySet<string>>();
  const syncListeners = new Set<() => void>();
  const EMPTY_SYNC_SNAPSHOT = emptySyncSnapshot;
  let syncSnapshot = EMPTY_SYNC_SNAPSHOT;
  let nextId = 0;

  const actionIsHeld = (action: PendingAction) =>
    [...resourceHolds.values()].some((heldIds) =>
      [...action.resourceIds].some((resourceId) => heldIds.has(resourceId))
    );

  const publishSyncSnapshot = () => {
    const pendingResourceIds = new Set<string>();
    const pausedResourceIds = new Set<string>();
    pendingActions.forEach((action) => {
      action.resourceIds.forEach((resourceId) => pendingResourceIds.add(resourceId));
      if (action.isPaused()) {
        action.resourceIds.forEach((resourceId) => pausedResourceIds.add(resourceId));
      }
    });
    submittingActions.forEach((action) => {
      action.resourceIds.forEach((resourceId) => pendingResourceIds.add(resourceId));
    });
    syncSnapshot = {
      pausedResourceIds: [...pausedResourceIds],
      pendingResourceIds: [...pendingResourceIds],
    };
    syncListeners.forEach((listener) => listener());
  };

  const reconcileResourceHolds = () => {
    pendingActions.forEach((action) => {
      if (actionIsHeld(action)) action.pause();
      else action.resume();
    });
    publishSyncSnapshot();
  };

  const latestPendingAction = () => {
    let latest: PendingAction | null = null;
    for (const action of pendingActions.values()) latest = action;
    return latest;
  };

  /**
   * Registers an optimistic action while delaying its durable mutation.
   * Undo and submit are mutually exclusive. Keyboard undo targets the newest
   * action, while keyboard submit commits every queued action in insertion order.
   */
  function queuePendingAction(
    message: string,
    options: PendingActionOptions,
  ) {
    const existing = options.coalesceKey
      ? pendingCoalescedActions.get(options.coalesceKey)
      : undefined;
    if (existing) {
      existing.replace(message, options);
      return existing.controls;
    }

    let state: PendingOperationPhase = "queued";
    let timeoutId: unknown | null = null;
    let timerStartedAt = 0;
    let remainingDuration = Math.max(0, options.duration);
    let revision = 0;
    let dependencyIds: string[] = [];
    let progressMessage: string | undefined;
    let failureMessage: string | undefined;
    let outcome: PendingActionOutcome | undefined;
    let currentMessage = message;
    let currentOptions = options;
    const initialOnUndo = options.onUndo;
    const resourceIds = new Set(options.resourceIds ?? []);
    const createdResourceIds = new Set(options.createsResourceIds ?? []);
    let resolveCompletion!: (succeeded: boolean) => void;
    let completionSettled = false;
    const completion = new Promise<boolean>((resolve) => {
      resolveCompletion = resolve;
    });
    const notifyCallback = (callback: (() => void) | undefined) => {
      try { callback?.(); }
      catch (error) { console.error("[OPERATIONS:CALLBACK]", error); }
    };

    const settleCompletion = (succeeded: boolean) => {
      if (completionSettled) return;
      completionSettled = true;
      activeCreationActions.delete(action);
      resolveCompletion(succeeded);
    };

    const requiredCreations = () => [...activeCreationActions].filter(
      (candidate) => candidate !== action
        && [...candidate.createdResourceIds].some((resourceId) => resourceIds.has(resourceId)),
    );

    const clearTimer = () => {
      if (timeoutId !== null) scheduler.cancel(timeoutId);
      timeoutId = null;
    };

    const isPending = () => state === "queued" || state === "paused";
    const publishOperation = () => {
      const snapshot: PendingOperationSnapshot = Object.freeze({
        id,
        message: currentMessage,
        phase: state,
        revision: ++revision,
        resourceIds: Object.freeze([...resourceIds]),
        createdResourceIds: Object.freeze([...createdResourceIds]),
        dependencyIds: Object.freeze(dependencyIds),
        blockers: Object.freeze(state === "paused" ? ["resource-held"] as const : state === "waiting" ? ["creation-dependency"] as const : []),
        allowedCommands: Object.freeze(isPending() ? ["undo", "submit", "cancel"] as const : []),
        ...(state === "queued" ? { undoUntil: scheduler.now() + (timeoutId === null
          ? remainingDuration : Math.max(0, remainingDuration - (scheduler.now() - timerStartedAt))) } : {}),
        ...(progressMessage ? { progressMessage } : {}),
        ...(currentOptions.submittingMessage ? { submittingMessage: currentOptions.submittingMessage } : {}),
        ...(failureMessage ? { error: failureMessage } : {}),
        errorHandled: Boolean(currentOptions.onError) && !outcome,
        ...(outcome ? { outcome } : {}),
      });
      operationSnapshots.set(id, snapshot);
      // Retain a bounded terminal history for diagnostics; active operations are never evicted.
      const terminal = [...operationSnapshots.values()].filter(operation =>
        !["queued", "paused", "waiting", "running"].includes(operation.phase));
      terminal.slice(0, Math.max(0, terminal.length - 100)).forEach(operation => operationSnapshots.delete(operation.id));
      operationsSnapshot = Object.freeze([...operationSnapshots.values()]);
      operationListeners.forEach(listener => {
        try { listener(snapshot, controls); }
        catch (error) { console.error("[OPERATIONS:OBSERVER]", error); }
      });
    };

    const scheduleSubmit = () => {
      if (!isPending() || state === "paused" || timeoutId !== null) return;
      if (remainingDuration <= 0) {
        submit();
        return;
      }
      timerStartedAt = scheduler.now();
      timeoutId = scheduler.schedule(submit, remainingDuration);
    };

    const pause = () => {
      if (!isPending() || state === "paused") return;
      if (timeoutId !== null) {
        remainingDuration = Math.max(0, remainingDuration - (scheduler.now() - timerStartedAt));
        clearTimer();
      }
      state = "paused";
      publishOperation();
    };

    const resume = () => {
      if (!isPending() || state !== "paused" || actionIsHeld(action)) return;
      state = "queued";
      publishOperation();
      scheduleSubmit();
    };

    const undo = () => {
      if (!isPending()) return false;
      state = "undone";
      clearTimer();
      pendingActions.delete(id);
      if (currentOptions.coalesceKey) {
        pendingCoalescedActions.delete(currentOptions.coalesceKey);
      }
      activeActions.delete(id);
      publishSyncSnapshot();
      notifyCallback(() => initialOnUndo(new Set(resourceIds)));
      notifyCallback(currentOptions.onSettled);
      settleCompletion(false);
      publishOperation();
      return true;
    };

    const cancel = () => {
      if (!isPending()) return false;
      state = "cancelled";
      clearTimer();
      pendingActions.delete(id);
      if (currentOptions.coalesceKey) {
        pendingCoalescedActions.delete(currentOptions.coalesceKey);
      }
      activeActions.delete(id);
      publishSyncSnapshot();
      notifyCallback(currentOptions.onSettled);
      settleCompletion(false);
      publishOperation();
      return true;
    };

    const submit = () => {
      if (!isPending()) return false;
      const creationDependencies = requiredCreations();
      creationDependencies.forEach((dependency) => dependency.submit());
      state = "running";
      clearTimer();
      pendingActions.delete(id);
      if (currentOptions.coalesceKey) {
        pendingCoalescedActions.delete(currentOptions.coalesceKey);
      }
      submittingActions.add(action);
      publishSyncSnapshot();
      dependencyIds = creationDependencies.map(dependency => dependency.controls.id);
      state = creationDependencies.length ? "waiting" : "running";
      publishOperation();

      const reportProgress = (message: string) => {
        if (state !== "running") return;
        progressMessage = message;
        publishOperation();
      };

      const runSubmit = () => {
        try {
          return Promise.resolve(currentOptions.onSubmit(reportProgress, new Set(resourceIds)));
        } catch (error) {
          return Promise.reject(error);
        }
      };
      const submission = creationDependencies.length
        ? Promise.all(creationDependencies.map(({ completion }) => completion))
          .then(async (outcomes) => {
            if (outcomes.some((succeeded) => !succeeded)) {
              throw new Error("A required event creation could not be saved");
            }
            dependencyIds = [];
            state = "running";
            publishOperation();
            return await runSubmit();
          })
        : runSubmit();

      void submission
        .then((result) => {
          if (result) outcome = Object.freeze({ ...result,
            succeededResourceIds: Object.freeze([...result.succeededResourceIds]),
            failedResourceIds: Object.freeze([...result.failedResourceIds]),
            ...(result.resources ? { resources: Object.freeze(result.resources.map(resource => Object.freeze({ ...resource }))) } : {}),
          });
          state = outcome?.status ?? "complete";
          failureMessage = outcome?.message;
          submittingActions.delete(action);
          activeActions.delete(id);
          publishSyncSnapshot();
          publishOperation();
          notifyCallback(currentOptions.onSettled);
          settleCompletion(state === "complete");
        })
        .catch((error: unknown) => {
          state = "failed";
          submittingActions.delete(action);
          activeActions.delete(id);
          publishSyncSnapshot();
          failureMessage = error instanceof Error ? error.message : "The change could not be saved";
          publishOperation();
          notifyCallback(() => currentOptions.onError?.(error));
          notifyCallback(currentOptions.onSettled);
          settleCompletion(false);
        });
      return true;
    };

    const id: OperationId = `operation-${++nextId}`;
    const controls: PendingActionController = { cancel, id, submit, undo, completion };
    const refresh = (nextMessage: string, nextDuration: number) => {
      if (!isPending()) return;
      clearTimer();
      currentMessage = nextMessage;
      remainingDuration = Math.max(0, nextDuration);
      state = actionIsHeld(action) ? "paused" : "queued";
      publishOperation();
      scheduleSubmit();
      publishSyncSnapshot();
    };
    const action: PendingAction = {
      supersede: (ids) => {
        if (!isPending() || !currentOptions.resourceScoped || createdResourceIds.size) return null;
        const removed = new Set([...resourceIds].filter(id => ids.has(id)));
        if (!removed.size) return null;
        const savedOptions = { ...currentOptions, coalesceKey: undefined };
        const savedMessage = currentMessage;
        removed.forEach(id => resourceIds.delete(id));
        if (!resourceIds.size) cancel();
        else {
          currentMessage = `Saving changes to ${resourceIds.size} remaining events`;
          publishOperation();
          publishSyncSnapshot();
        }
        const alreadyRestored = new Set<string>();
        return (restoreIds = removed) => {
          const restored = [...removed].filter(id => restoreIds.has(id) && !alreadyRestored.has(id));
          restored.forEach(id => alreadyRestored.add(id));
          if (restored.length) queuePendingAction(savedMessage, { ...savedOptions, resourceIds: restored });
        };
      },
      coalesceKey: options.coalesceKey,
      completion,
      controls,
      createdResourceIds,
      isPaused: () => state === "paused",
      pause,
      refresh,
      replace: (nextMessage, nextOptions) => {
        if (!isPending()) return;
        currentOptions = nextOptions;
        createdResourceIds.clear();
        for (const resourceId of nextOptions.createsResourceIds ?? []) {
          createdResourceIds.add(resourceId);
        }
        if (createdResourceIds.size) activeCreationActions.add(action);
        else activeCreationActions.delete(action);
        resourceIds.clear();
        for (const resourceId of nextOptions.resourceIds ?? []) {
          resourceIds.add(resourceId);
        }
        refresh(nextMessage, nextOptions.duration);
      },
      resourceIds,
      resume,
      submit,
      undo,
    };
    pendingActions.set(id, action);
    if (options.coalesceKey) pendingCoalescedActions.set(options.coalesceKey, action);
    activeActions.add(id);
    if (createdResourceIds.size) activeCreationActions.add(action);
    if (options.submitImmediately) {
      submit();
    } else if (actionIsHeld(action)) {
      state = "paused";
      publishOperation();
    } else {
      publishOperation();
      scheduleSubmit();
    }
    publishSyncSnapshot();

    return controls;
  }

  const refreshPendingAction = (
    coalesceKey: string,
    message: string,
    duration: number,
  ) => {
    const action = pendingCoalescedActions.get(coalesceKey);
    if (!action) return false;
    action.refresh(message, duration);
    return true;
  };

  const undoLatest = () => latestPendingAction()?.undo() ?? false;

  const submitAll = () => {
    let submitted = false;
    [...pendingActions.values()].forEach((action) => {
      submitted = action.submit() || submitted;
    });
    return submitted;
  };

  const hasPending = () => pendingActions.size > 0;

  /** True for both the undo window and the durable mutation that follows it. */
  const hasActive = () => activeActions.size > 0;

  /** True while a queued or submitting action is creating this resource. */
  const hasActiveResourceCreation = (resourceId: string) =>
    [...activeCreationActions].some((action) =>
      action.createdResourceIds.has(resourceId)
    );

  /**
   * Holds pending mutations that touch the supplied resources. Reusing a scope
   * replaces its previous resource set, which lets UI surfaces model editing as
   * a stable hold rather than balancing pause/resume calls.
   */
  const setPendingActionResourceHold = (
    scope: string,
    resourceIds: Iterable<string>,
  ) => {
    const next = new Set(resourceIds);
    if (next.size) resourceHolds.set(scope, next);
    else resourceHolds.delete(scope);
    reconcileResourceHolds();
  };

  const clearPendingActionResourceHold = (scope: string) => {
    if (!resourceHolds.delete(scope)) return;
    reconcileResourceHolds();
  };

  const subscribePendingActionSync = (listener: () => void) => {
    syncListeners.add(listener);
    return () => {
      syncListeners.delete(listener);
    };
  };

  const getPendingActionSyncSnapshot = () => syncSnapshot;
  const getPendingActionServerSyncSnapshot = () => EMPTY_SYNC_SNAPSHOT;

  /**
   * Resources whose local representation must win over an in-flight provider
   * snapshot. This includes active pointer/editor holds before an action toast
   * exists, closing the gap between starting an interaction and queueing its
   * eventual mutation.
   */
  const getPendingActionSyncProtectedResourceIds = () => {
    const resourceIds = new Set(syncSnapshot.pendingResourceIds);
    resourceHolds.forEach((heldIds) => {
      heldIds.forEach((resourceId) => resourceIds.add(resourceId));
    });
    return [...resourceIds];
  };

  /** A removal supersedes pending edits, while unrelated resources remain queued. */
  const supersedePendingResourceUpdates = (ids: ReadonlySet<string>) => {
    const restorers = [...pendingActions.values()].flatMap(action => {
      const restore = action.supersede(ids);
      return restore ? [restore] : [];
    });
    return (restoreIds: ReadonlySet<string> = ids) => restorers.forEach(restore => restore(restoreIds));
  };
  return {
    queue: queuePendingAction,
    refresh: refreshPendingAction,
    undoLatest,
    submitAll,
    hasPending,
    hasActive,
    hasActiveResourceCreation,
    hold: setPendingActionResourceHold,
    release: clearPendingActionResourceHold,
    subscribeSync: subscribePendingActionSync,
    getSyncSnapshot: getPendingActionSyncSnapshot,
    getServerSyncSnapshot: getPendingActionServerSyncSnapshot,
    protectedResourceIds: getPendingActionSyncProtectedResourceIds,
    supersede: supersedePendingResourceUpdates,
    getSnapshot: () => operationsSnapshot,
    getServerSnapshot: () => emptyOperations,
    getOperation: (id: string) => operationSnapshots.get(id),
    command: (id: string, command: "undo" | "submit" | "cancel", expectedRevision: number) => {
      const snapshot = operationSnapshots.get(id);
      if (!snapshot || snapshot.revision !== expectedRevision || !snapshot.allowedCommands.includes(command)) return false;
      return pendingActions.get(id)?.controls[command]() ?? false;
    },
    subscribe: (listener: PendingOperationListener) => {
      operationListeners.add(listener);
      return () => { operationListeners.delete(listener); };
    },
  };
}

export const pendingOperations = createPendingActionStore();

export const pendingActionSyncIntersectsResources = (
  snapshot: PendingActionSyncSnapshot,
  resourceIds: ReadonlySet<string>,
) => snapshot.pendingResourceIds.some((resourceId) => resourceIds.has(resourceId));

/**
 * Latches selected pending resources until their mutation settles. This keeps
 * sync protected when an optimistic mutation moves selection to another task.
 */
export const reconcilePendingActionSyncProtection = (
  snapshot: PendingActionSyncSnapshot,
  selectedResourceIds: ReadonlySet<string>,
  protectedResourceIds: ReadonlySet<string>,
) => {
  const pendingResourceIds = new Set(snapshot.pendingResourceIds);
  const nextProtectedResourceIds = new Set(
    [...protectedResourceIds].filter((resourceId) => pendingResourceIds.has(resourceId)),
  );
  snapshot.pendingResourceIds.forEach((resourceId) => {
    if (selectedResourceIds.has(resourceId)) nextProtectedResourceIds.add(resourceId);
  });
  return nextProtectedResourceIds;
};

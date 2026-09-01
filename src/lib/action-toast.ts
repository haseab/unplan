import { Check, CirclePause, Clock3, LoaderCircle } from "lucide-react";
import { createElement } from "react";
import { toast } from "sonner";

type ToastId = string | number;

type ActionToastController = {
  cancel: () => boolean;
  submit: () => boolean;
  toastId: ToastId;
  undo: () => boolean;
};

type PendingAction = {
  coalesceKey?: string;
  completion: Promise<boolean>;
  controls: ActionToastController;
  createdResourceIds: ReadonlySet<string>;
  isPaused: () => boolean;
  pause: () => void;
  refresh: (message: string, duration: number) => void;
  replace: (message: string, options: ActionToastOptions) => void;
  resourceIds: ReadonlySet<string>;
  resume: () => void;
  submit: () => boolean;
  undo: () => boolean;
};

type ActionToastOptions = {
  coalesceKey?: string;
  createsResourceIds?: Iterable<string>;
  duration: number;
  submitImmediately?: boolean;
  onSettled?: () => void;
  onUndo: () => void;
  onSubmit: (reportProgress: (message: string) => void) => Promise<void> | void;
  onError?: (error: unknown) => void;
  resourceIds?: Iterable<string>;
  submittingMessage?: string;
};

export type ActionToastSyncSnapshot = {
  pausedResourceIds: readonly string[];
  pendingResourceIds: readonly string[];
};

const pendingActions = new Map<ToastId, PendingAction>();
const pendingCoalescedActions = new Map<string, PendingAction>();
const activeActions = new Set<ToastId>();
const activeCreationActions = new Set<PendingAction>();
const resourceHolds = new Map<string, ReadonlySet<string>>();
const syncListeners = new Set<() => void>();
const EMPTY_SYNC_SNAPSHOT: ActionToastSyncSnapshot = {
  pausedResourceIds: [],
  pendingResourceIds: [],
};
let syncSnapshot = EMPTY_SYNC_SNAPSHOT;

type ActionToastVisualState = "paused" | "queued" | "updated" | "updating";

const actionToastIcon = (state: ActionToastVisualState) => {
  const Icon = state === "paused"
    ? CirclePause
    : state === "queued"
      ? Clock3
      : state === "updated"
        ? Check
        : LoaderCircle;
  return createElement(Icon, {
    "aria-hidden": true,
    className: `action-toast-icon action-toast-icon-${state}${state === "updating" ? " spin" : ""}`,
    size: 16,
  });
};

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

const oldestPendingAction = () => pendingActions.values().next().value ?? null;

/**
 * Shows an optimistic action immediately while delaying its durable mutation.
 * Undo and submit are mutually exclusive. Keyboard undo targets the newest
 * action, while keyboard submit targets the oldest so dependent mutations are
 * committed in the same order they were queued.
 */
export function queueActionToast(
  message: string,
  options: ActionToastOptions,
) {
  const existing = options.coalesceKey
    ? pendingCoalescedActions.get(options.coalesceKey)
    : undefined;
  if (existing) {
    existing.replace(message, options);
    return existing.controls;
  }

  let state: "cancelled" | "pending" | "submitting" | "complete" | "undone" | "failed" =
    "pending";
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timerStartedAt = 0;
  let remainingDuration = Math.max(0, options.duration);
  let paused = false;
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
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = null;
  };

  const renderPendingToast = () => {
    toast(currentMessage, {
      id: toastId,
      action: { label: "Undo (⌘Z)", onClick: undo },
      closeButton: true,
      description: paused ? "Unsynced while this event is being edited" : undefined,
      duration: Infinity,
      icon: actionToastIcon(paused ? "paused" : "queued"),
      onDismiss: () => {
        // Closing an actionable toast means “keep it”, so commit immediately.
        submit();
      },
    });
  };

  const scheduleSubmit = () => {
    if (state !== "pending" || paused || timeoutId !== null) return;
    if (remainingDuration <= 0) {
      submit();
      return;
    }
    timerStartedAt = Date.now();
    timeoutId = setTimeout(submit, remainingDuration);
  };

  const pause = () => {
    if (state !== "pending" || paused) return;
    if (timeoutId !== null) {
      remainingDuration = Math.max(0, remainingDuration - (Date.now() - timerStartedAt));
      clearTimer();
    }
    paused = true;
    renderPendingToast();
  };

  const resume = () => {
    if (state !== "pending" || !paused || actionIsHeld(action)) return;
    paused = false;
    renderPendingToast();
    scheduleSubmit();
  };

  const undo = () => {
    if (state !== "pending") return false;
    state = "undone";
    clearTimer();
    pendingActions.delete(toastId);
    if (currentOptions.coalesceKey) {
      pendingCoalescedActions.delete(currentOptions.coalesceKey);
    }
    activeActions.delete(toastId);
    publishSyncSnapshot();
    initialOnUndo();
    currentOptions.onSettled?.();
    settleCompletion(false);
    toast.dismiss(toastId);
    return true;
  };

  const cancel = () => {
    if (state !== "pending") return false;
    state = "cancelled";
    clearTimer();
    pendingActions.delete(toastId);
    if (currentOptions.coalesceKey) {
      pendingCoalescedActions.delete(currentOptions.coalesceKey);
    }
    activeActions.delete(toastId);
    publishSyncSnapshot();
    currentOptions.onSettled?.();
    settleCompletion(false);
    toast.dismiss(toastId);
    return true;
  };

  const submit = () => {
    if (state !== "pending") return false;
    const creationDependencies = requiredCreations();
    creationDependencies.forEach((dependency) => dependency.submit());
    state = "submitting";
    clearTimer();
    pendingActions.delete(toastId);
    if (currentOptions.coalesceKey) {
      pendingCoalescedActions.delete(currentOptions.coalesceKey);
    }
    publishSyncSnapshot();
    toast.loading(currentOptions.submittingMessage ?? "Saving to Google…", {
      action: undefined,
      closeButton: false,
      description: undefined,
      id: toastId,
      duration: Infinity,
      icon: actionToastIcon("updating"),
      onDismiss: undefined,
    });

    const reportProgress = (progressMessage: string) => {
      if (state !== "submitting") return;
      toast.loading(progressMessage, {
        action: undefined,
        closeButton: false,
        description: undefined,
        duration: Infinity,
        icon: actionToastIcon("updating"),
        id: toastId,
        onDismiss: undefined,
      });
    };

    const runSubmit = () => {
      try {
        return Promise.resolve(currentOptions.onSubmit(reportProgress));
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
          await runSubmit();
        })
      : runSubmit();

    void submission
      .then(() => {
        state = "complete";
        activeActions.delete(toastId);
        toast.success(currentMessage, {
          action: undefined,
          closeButton: false,
          description: undefined,
          duration: 1_800,
          icon: actionToastIcon("updated"),
          id: toastId,
          onDismiss: undefined,
        });
        currentOptions.onSettled?.();
        settleCompletion(true);
      })
      .catch((error: unknown) => {
        state = "failed";
        activeActions.delete(toastId);
        toast.dismiss(toastId);
        if (currentOptions.onError) currentOptions.onError(error);
        else
          toast.error(
            error instanceof Error ? error.message : "The change could not be saved",
          );
        currentOptions.onSettled?.();
        settleCompletion(false);
      });
    return true;
  };

  const toastId: ToastId = options.submitImmediately
    ? toast.loading(options.submittingMessage ?? "Saving to Google…", {
        action: undefined,
        closeButton: false,
        description: undefined,
        duration: Infinity,
        icon: actionToastIcon("updating"),
        onDismiss: undefined,
      })
    : toast(message, {
        action: { label: "Undo (⌘Z)", onClick: undo },
        closeButton: true,
        duration: Infinity,
        icon: actionToastIcon("queued"),
        onDismiss: () => {
          // Closing an actionable toast means “keep it”, so commit immediately.
          submit();
        },
      });
  const controls: ActionToastController = { cancel, toastId, submit, undo };
  const refresh = (nextMessage: string, nextDuration: number) => {
    if (state !== "pending") return;
    clearTimer();
    currentMessage = nextMessage;
    remainingDuration = Math.max(0, nextDuration);
    paused = actionIsHeld(action);
    renderPendingToast();
    scheduleSubmit();
    publishSyncSnapshot();
  };
  const action: PendingAction = {
    coalesceKey: options.coalesceKey,
    completion,
    controls,
    createdResourceIds,
    isPaused: () => paused,
    pause,
    refresh,
    replace: (nextMessage, nextOptions) => {
      if (state !== "pending") return;
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
  pendingActions.set(toastId, action);
  if (options.coalesceKey) pendingCoalescedActions.set(options.coalesceKey, action);
  activeActions.add(toastId);
  if (createdResourceIds.size) activeCreationActions.add(action);
  if (options.submitImmediately) {
    submit();
  } else if (actionIsHeld(action)) {
    paused = true;
    renderPendingToast();
  } else {
    scheduleSubmit();
  }
  publishSyncSnapshot();

  return controls;
}

export const refreshActionToast = (
  coalesceKey: string,
  message: string,
  duration: number,
) => {
  const action = pendingCoalescedActions.get(coalesceKey);
  if (!action) return false;
  action.refresh(message, duration);
  return true;
};

export const triggerToastUndo = () => latestPendingAction()?.undo() ?? false;

export const triggerToastSubmit = () =>
  oldestPendingAction()?.submit() ?? false;

export const hasPendingActionToast = () => pendingActions.size > 0;

/** True for both the undo window and the durable mutation that follows it. */
export const hasActiveActionToast = () => activeActions.size > 0;

/**
 * Holds pending mutations that touch the supplied resources. Reusing a scope
 * replaces its previous resource set, which lets UI surfaces model editing as
 * a stable hold rather than balancing pause/resume calls.
 */
export const setActionToastResourceHold = (
  scope: string,
  resourceIds: Iterable<string>,
) => {
  const next = new Set(resourceIds);
  if (next.size) resourceHolds.set(scope, next);
  else resourceHolds.delete(scope);
  reconcileResourceHolds();
};

export const clearActionToastResourceHold = (scope: string) => {
  if (!resourceHolds.delete(scope)) return;
  reconcileResourceHolds();
};

export const subscribeActionToastSync = (listener: () => void) => {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
};

export const getActionToastSyncSnapshot = () => syncSnapshot;
export const getActionToastServerSyncSnapshot = () => EMPTY_SYNC_SNAPSHOT;

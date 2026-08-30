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
  controls: ActionToastController;
  isPaused: () => boolean;
  pause: () => void;
  replace: (message: string, options: ActionToastOptions) => void;
  resourceIds: ReadonlySet<string>;
  resume: () => void;
  submit: () => boolean;
  undo: () => boolean;
};

type ActionToastOptions = {
  coalesceKey?: string;
  duration: number;
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
const resourceHolds = new Map<string, ReadonlySet<string>>();
const syncListeners = new Set<() => void>();
const EMPTY_SYNC_SNAPSHOT: ActionToastSyncSnapshot = {
  pausedResourceIds: [],
  pendingResourceIds: [],
};
let syncSnapshot = EMPTY_SYNC_SNAPSHOT;

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

/**
 * Shows an optimistic action immediately while delaying its durable mutation.
 * Undo and submit are mutually exclusive, and keyboard commands target the
 * most recently queued action.
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
    toast.dismiss(toastId);
    return true;
  };

  const submit = () => {
    if (state !== "pending") return false;
    state = "submitting";
    clearTimer();
    pendingActions.delete(toastId);
    if (currentOptions.coalesceKey) {
      pendingCoalescedActions.delete(currentOptions.coalesceKey);
    }
    publishSyncSnapshot();
    toast.loading(currentOptions.submittingMessage ?? "Saving to Google…", {
      id: toastId,
      duration: Infinity,
    });

    const reportProgress = (progressMessage: string) => {
      if (state !== "submitting") return;
      toast.loading(progressMessage, { id: toastId, duration: Infinity });
    };

    void Promise.resolve(currentOptions.onSubmit(reportProgress))
      .then(() => {
        state = "complete";
        activeActions.delete(toastId);
        toast.dismiss(toastId);
        currentOptions.onSettled?.();
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
      });
    return true;
  };

  const toastId: ToastId = toast(message, {
    action: { label: "Undo (⌘Z)", onClick: undo },
    closeButton: true,
    duration: Infinity,
    onDismiss: () => {
      // Closing an actionable toast means “keep it”, so commit immediately.
      submit();
    },
  });
  const controls: ActionToastController = { cancel, toastId, submit, undo };
  const action: PendingAction = {
    coalesceKey: options.coalesceKey,
    controls,
    isPaused: () => paused,
    pause,
    replace: (nextMessage, nextOptions) => {
      if (state !== "pending") return;
      clearTimer();
      currentMessage = nextMessage;
      currentOptions = nextOptions;
      remainingDuration = Math.max(0, nextOptions.duration);
      resourceIds.clear();
      for (const resourceId of nextOptions.resourceIds ?? []) {
        resourceIds.add(resourceId);
      }
      paused = actionIsHeld(action);
      renderPendingToast();
      scheduleSubmit();
      publishSyncSnapshot();
    },
    resourceIds,
    resume,
    submit,
    undo,
  };
  pendingActions.set(toastId, action);
  if (options.coalesceKey) pendingCoalescedActions.set(options.coalesceKey, action);
  activeActions.add(toastId);
  if (actionIsHeld(action)) {
    paused = true;
    renderPendingToast();
  } else {
    scheduleSubmit();
  }
  publishSyncSnapshot();

  return controls;
}

export const triggerToastUndo = () => latestPendingAction()?.undo() ?? false;

export const triggerToastSubmit = () =>
  latestPendingAction()?.submit() ?? false;

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

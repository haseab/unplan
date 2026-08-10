import { toast } from "sonner";

type ToastId = string | number;

type PendingAction = {
  submit: () => boolean;
  undo: () => boolean;
};

type ActionToastOptions = {
  duration: number;
  onUndo: () => void;
  onSubmit: () => Promise<void> | void;
  onError?: (error: unknown) => void;
  submittingMessage?: string;
};

const pendingActions = new Map<ToastId, PendingAction>();

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
  let state: "pending" | "submitting" | "complete" | "undone" | "failed" =
    "pending";
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = null;
  };

  const undo = () => {
    if (state !== "pending") return false;
    state = "undone";
    clearTimer();
    pendingActions.delete(toastId);
    options.onUndo();
    toast.dismiss(toastId);
    return true;
  };

  const submit = () => {
    if (state !== "pending") return false;
    state = "submitting";
    clearTimer();
    pendingActions.delete(toastId);
    toast.loading(options.submittingMessage ?? "Saving to Google…", {
      id: toastId,
      duration: Infinity,
    });

    void Promise.resolve(options.onSubmit())
      .then(() => {
        state = "complete";
        toast.dismiss(toastId);
      })
      .catch((error: unknown) => {
        state = "failed";
        toast.dismiss(toastId);
        if (options.onError) options.onError(error);
        else
          toast.error(
            error instanceof Error ? error.message : "The change could not be saved",
          );
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
  pendingActions.set(toastId, { submit, undo });
  timeoutId = setTimeout(submit, Math.max(0, options.duration));

  return { toastId, submit, undo };
}

export const triggerToastUndo = () => latestPendingAction()?.undo() ?? false;

export const triggerToastSubmit = () =>
  latestPendingAction()?.submit() ?? false;

export const hasPendingActionToast = () => pendingActions.size > 0;

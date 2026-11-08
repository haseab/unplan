import { AlertTriangle, Check, CirclePause, Clock3, LoaderCircle } from "lucide-react";
import { createElement } from "react";
import { toast } from "sonner";
import {
  pendingOperations,
  pendingActionSyncIntersectsResources,
  reconcilePendingActionSyncProtection,
  type PendingActionController,
  type PendingActionOptions,
  type PendingActionSyncSnapshot,
  type PendingOperationSnapshot,
} from "./pending-actions";

type ActionToastVisualState = "paused" | "queued" | "updated" | "updating";

const actionToastIcon = (state: ActionToastVisualState) => {
  const Icon = state === "paused" ? CirclePause : state === "queued" ? Clock3 : state === "updated" ? Check : LoaderCircle;
  return createElement(Icon, {
    "aria-hidden": true,
    className: `action-toast-icon action-toast-icon-${state}${state === "updating" ? " spin" : ""}`,
    size: 16,
  });
};

/** Presentation adapter; deadlines, dependencies and settlement belong to the domain store. */
function presentOperation(operation: PendingOperationSnapshot, controls: PendingActionController) {
  const { id, phase } = operation;
  if (phase === "queued" || phase === "paused") {
    const paused = phase === "paused";
    toast(operation.message, {
      id,
      action: { label: "Undo (⌘Z)", onClick: controls.undo },
      className: paused ? "action-toast-hidden" : "",
      closeButton: true,
      description: paused ? "Unsynced while this event is being edited" : undefined,
      duration: Infinity,
      icon: actionToastIcon(paused ? "paused" : "queued"),
      // Dismissing means keep the optimistic action and submit it now.
      onDismiss: () => { controls.submit(); },
    });
  } else if (phase === "waiting" || phase === "running") {
    toast.loading(operation.progressMessage ?? operation.submittingMessage ?? "Saving to Google…", {
      id, action: undefined, className: "", closeButton: false, description: undefined,
      duration: Infinity, icon: actionToastIcon("updating"), onDismiss: undefined,
    });
  } else if (phase === "complete") {
    toast.success(operation.message, {
      id, action: undefined, className: "", closeButton: false, description: undefined,
      duration: 1_800, icon: actionToastIcon("updated"), onDismiss: undefined,
    });
  } else if (phase === "needs-attention") {
    toast.warning(operation.outcome?.message ?? "Some changes need attention", {
      id, action: undefined, className: "", closeButton: true, description: undefined,
      duration: 6_000, icon: createElement(AlertTriangle, { size: 16, "aria-hidden": true }), onDismiss: undefined,
    });
  } else {
    toast.dismiss(id);
    if (phase === "failed" && !operation.errorHandled) {
      toast.error(operation.error ?? "The change could not be saved");
    }
  }
}

pendingOperations.subscribe(presentOperation);

const controllers = new WeakMap<PendingActionController, PendingActionController & { toastId: string }>();

/** Compatibility facade for UI callers; completion is distinct from queue acceptance. */
export function queueActionToast(message: string, options: PendingActionOptions) {
  const controls = pendingOperations.queue(message, options);
  let controller = controllers.get(controls);
  if (!controller) {
    controller = { ...controls, toastId: controls.id };
    controllers.set(controls, controller);
  }
  return controller;
}

export type ActionToastSyncSnapshot = PendingActionSyncSnapshot;
export const refreshActionToast = pendingOperations.refresh;
export const triggerToastUndo = pendingOperations.undoLatest;
export const triggerToastSubmit = pendingOperations.submitAll;
export const hasPendingActionToast = pendingOperations.hasPending;
export const hasActiveActionToast = pendingOperations.hasActive;
export const hasActiveResourceCreation = pendingOperations.hasActiveResourceCreation;
export const setActionToastResourceHold = pendingOperations.hold;
export const clearActionToastResourceHold = pendingOperations.release;
export const subscribeActionToastSync = pendingOperations.subscribeSync;
export const getActionToastSyncSnapshot = pendingOperations.getSyncSnapshot;
export const getActionToastServerSyncSnapshot = pendingOperations.getServerSyncSnapshot;
export const getActionToastSyncProtectedResourceIds = pendingOperations.protectedResourceIds;
export const actionToastSyncIntersectsResources = pendingActionSyncIntersectsResources;
export const reconcileActionToastSyncProtection = reconcilePendingActionSyncProtection;
export const supersedePendingResourceUpdates = pendingOperations.supersede;

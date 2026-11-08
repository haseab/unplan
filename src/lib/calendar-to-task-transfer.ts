import type { CalendarEvent } from "./calendar-types";
import type { CreateTodoistTaskInput, TodoistTask } from "./todoist";
import type { PendingActionOutcome } from "./pending-actions";

export type CalendarToTaskMove = { event: CalendarEvent; input: CreateTodoistTaskInput; task: TodoistTask };
export type CalendarToTaskPhase = "staged" | "creating-task" | "task-saved" | "removing-event" | "complete" | "cancelled" | "create-failed" | "cleanup-failed";
export type CalendarToTaskItem = {
  move: CalendarToTaskMove;
  phase: CalendarToTaskPhase;
  savedTask?: TodoistTask;
  error?: unknown;
};
export type CalendarToTaskResult = { items: readonly CalendarToTaskItem[]; orderFailed: boolean };
type TransferSnapshot = readonly Readonly<{ eventId: string; taskId: string; savedTaskId?: string; phase: CalendarToTaskPhase }>[];
type Provider = {
  commitTask: (id: string, input: CreateTodoistTaskInput) => Promise<TodoistTask | null>;
  deleteEvent: (event: CalendarEvent) => Promise<void>;
  persistOrder?: () => Promise<void>;
};

/**
 * Destination creation precedes source deletion. Every item retains its own outcome;
 * a failure must never discard another item's confirmed destination or source.
 */
export function createCalendarToTaskTransfer(moves: readonly CalendarToTaskMove[], provider: Provider) {
  let items: readonly CalendarToTaskItem[] = moves.map(move => ({ move, phase: "staged" }));
  const readSnapshot = (): TransferSnapshot => Object.freeze(items.map(({ move, phase, savedTask }) =>
    Object.freeze({ eventId: move.event.id, taskId: move.task.id, phase, ...(savedTask ? { savedTaskId: savedTask.id } : {}) })));
  let snapshot = readSnapshot();
  let commitPromise: Promise<CalendarToTaskResult> | undefined;
  const listeners = new Set<() => void>();
  const transition = (id: string, phase: CalendarToTaskPhase, extra: Partial<CalendarToTaskItem> = {}) => {
    items = items.map(item => item.move.task.id === id ? { ...item, ...extra, phase } : item);
    snapshot = readSnapshot();
    listeners.forEach(listener => {
      try { listener(); }
      catch (error) { console.error("[CALENDAR:TO-TASK:OBSERVER]", error); }
    });
  };
  const commit = (progress: (message: string) => void = () => {}) => {
    if (commitPromise) return commitPromise;
    commitPromise = Promise.resolve().then(async () => {
      progress(moves.length === 1 ? "Creating Todoist task…" : `Creating ${moves.length} Todoist tasks…`);
      await Promise.all(moves.map(async move => {
        transition(move.task.id, "creating-task");
        try {
          const savedTask = await provider.commitTask(move.task.id, move.input);
          transition(move.task.id, savedTask ? "task-saved" : "cancelled", savedTask ? { savedTask } : {});
        } catch (error) {
          transition(move.task.id, "create-failed", { error });
        }
      }));
      const saved = items.filter(item => item.phase === "task-saved");
      let orderFailed = false;
      if (saved.length && provider.persistOrder) {
        progress("Saving task position…");
        try { await provider.persistOrder(); }
        catch { orderFailed = true; }
      }
      if (saved.some(({ move }) => move.event.provider === "google")) progress("Removing synced events from Google…");
      await Promise.all(saved.map(async ({ move }) => {
        if (move.event.provider !== "google") { transition(move.task.id, "complete"); return; }
        transition(move.task.id, "removing-event");
        try {
          await provider.deleteEvent(move.event);
          transition(move.task.id, "complete");
        } catch (error) {
          // The Todoist task is already durable. Retain it and restore the calendar source.
          transition(move.task.id, "cleanup-failed", { error });
        }
      }));
      return { items, orderFailed };
    });
    return commitPromise;
  };
  return {
    commit,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export function calendarToTaskOutcome({ items, orderFailed }: CalendarToTaskResult): PendingActionOutcome {
  const completed = items.filter(item => item.phase === "complete");
  const cleanupFailures = items.filter(item => item.phase === "cleanup-failed");
  const createFailures = items.filter(item => item.phase === "create-failed");
  const cancelled = items.filter(item => item.phase === "cancelled");
  const succeededResourceIds = completed.map(({ move }) => move.event.id);
  const failedResourceIds = items.filter(item => item.phase !== "complete").map(({ move }) => move.event.id);
  const resources: NonNullable<PendingActionOutcome["resources"]> = items.map(({ move, phase }) => ({
    id: move.event.id,
    status: phase === "complete" ? "complete" : phase === "cancelled" ? "cancelled" : phase === "cleanup-failed" ? "needs-attention" : "failed",
    ...(phase === "cleanup-failed" ? { code: "source-cleanup-failed" } : phase === "create-failed" ? { code: "destination-create-failed" } : {}),
  }));
  const messages = [
    ...(cleanupFailures.length ? [`${cleanupFailures.length} ${cleanupFailures.length === 1 ? "event was" : "events were"} saved to Todoist but could not be removed from the calendar`] : []),
    ...(createFailures.length ? [`${createFailures.length} ${createFailures.length === 1 ? "event" : "events"} could not be saved to Todoist`] : []),
    ...(cancelled.length ? [`${cancelled.length} ${cancelled.length === 1 ? "move was" : "moves were"} cancelled`] : []),
    ...(orderFailed ? ["Tasks were created, but their position could not be saved"] : []),
  ];
  const needsAttention = cleanupFailures.length > 0 || orderFailed || (completed.length > 0 && failedResourceIds.length > 0);
  return {
    status: needsAttention ? "needs-attention" : createFailures.length ? "failed" : cancelled.length ? "cancelled" : "complete",
    succeededResourceIds, failedResourceIds, resources,
    ...(messages.length ? { message: messages.join("; ") } : {}),
  };
}

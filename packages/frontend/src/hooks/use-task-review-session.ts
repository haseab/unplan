"use client";


import * as React from "react";
import type { TodoistTask } from "../lib/todoist.js";
import { queueActionToast } from "../lib/action-toast.js";
import { calendarEventDetailsFromTodoistContent } from "../lib/todoist-calendar.js";
import {
  emptyTaskReviewSession,
  pendingTaskReviews,
  previousSkippedTaskId,
  skipTaskReview,
} from "../lib/task-review-session.js";

/** Skips and their Undo affect only this open review, never the provider. */
export function useTaskReviewSession(tasks: TodoistTask[], open: boolean, onRestore?: () => void) {
  const [session, setSession] = React.useState(() => ({ open, generation: 0, review: emptyTaskReviewSession() }));
  const latest = React.useRef({ tasks, onRestore, generation: session.generation });
  React.useLayoutEffect(() => { latest.current = { tasks, onRestore, generation: session.generation }; }, [tasks, onRestore, session.generation]);
  const toasts = React.useRef(new Map<string, ReturnType<typeof queueActionToast>>());
  if (session.open !== open) {
    setSession({ open, generation: session.generation + 1, review: emptyTaskReviewSession() });
  }
  React.useEffect(
    () => () => {
      for (const controller of toasts.current.values()) controller.cancel();
      toasts.current.clear();
    },
    [open],
  );
  const pendingTasks = React.useMemo(
    () => (session.open === open ? pendingTaskReviews(tasks, session.review) : tasks),
    [tasks, session, open],
  );
  const restoreTask = React.useCallback((id: string) => {
    if (!latest.current.tasks.some((task) => task.id === id)) return;
    setSession((current) =>
      current.open
        ? {
            ...current,
            review: {
              skippedIds: current.review.skippedIds.filter((skipped) => skipped !== id),
              restoredTaskId: id,
            },
          }
        : current,
    );
    latest.current.onRestore?.();
  }, []);
  const skipTask = React.useCallback(
    (task: TodoistTask) => {
      if (!open || toasts.current.has(task.id)) return;
      const atGeneration = session.generation;
      setSession((current) =>
        current.open ? { ...current, review: skipTaskReview(current.review, task.id) } : current,
      );
      const title = calendarEventDetailsFromTodoistContent(task.content).title || task.content;
      const controller = queueActionToast(`Skipped ${title}`, {
        duration: 5000,
        submittingMessage: "Skipped for this review session",
        onSubmit: () => {},
        onUndo: () => {
          if (atGeneration === latest.current.generation) restoreTask(task.id);
        },
        onSettled: () => {
          if (toasts.current.get(task.id) === controller) toasts.current.delete(task.id);
        },
      });
      toasts.current.set(task.id, controller);
    },
    [open, session.generation, restoreTask],
  );
  const previousTask = React.useCallback(() => {
    const id = previousSkippedTaskId(session.review, tasks);
    if (!id) return;
    const controller = toasts.current.get(id);
    if (!controller?.undo()) restoreTask(id);
  }, [session.review, tasks, restoreTask]);
  const canGoBack =
    open && session.open === open && previousSkippedTaskId(session.review, tasks) !== null;
  return { pendingTasks, skipTask, previousTask, canGoBack };
}

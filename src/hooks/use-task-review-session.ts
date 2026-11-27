"use client";

import * as React from "react";
import type { TodoistTask } from "@/lib/todoist";
import {
  emptyTaskReviewSession,
  pendingTaskReviews,
  previousSkippedTaskId,
  previousTaskReview,
  skipTaskReview,
} from "@/lib/task-review-session";

/** Skipping only defers review for this open session; provider tasks stay untouched. */
export function useTaskReviewSession(tasks: TodoistTask[], open: boolean) {
  const [session, setSession] = React.useState(() => ({ open, review: emptyTaskReviewSession() }));
  if (session.open !== open) {
    setSession({ open, review: emptyTaskReviewSession() });
  }
  const pendingTasks = React.useMemo(
    () => session.open === open ? pendingTaskReviews(tasks, session.review) : tasks,
    [tasks, session, open],
  );
  const skipTask = React.useCallback((task: TodoistTask) => {
    setSession((current) => current.open
      ? { ...current, review: skipTaskReview(current.review, task.id) }
      : current);
  }, []);
  const previousTask = React.useCallback(() => {
    setSession((current) => current.open
      ? { ...current, review: previousTaskReview(current.review, tasks) }
      : current);
  }, [tasks]);
  const canGoBack = open && session.open === open && previousSkippedTaskId(session.review, tasks) !== null;
  return { pendingTasks, skipTask, previousTask, canGoBack };
}

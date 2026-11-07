"use client";

import * as React from "react";
import type { TodoistTask } from "@/lib/todoist";

/** Skipping only defers review for this open session; provider tasks stay untouched. */
export function useExtractedTaskReview(tasks: TodoistTask[], open: boolean) {
  const [session, setSession] = React.useState({ open, skippedIds: new Set<string>() });
  if (session.open !== open) {
    setSession({ open, skippedIds: new Set() });
  }
  const pendingTasks = React.useMemo(
    () => session.open === open ? tasks.filter(({ id }) => !session.skippedIds.has(id)) : tasks,
    [tasks, session, open],
  );
  const skipTask = React.useCallback((task: TodoistTask) => {
    setSession((current) => current.open
      ? { ...current, skippedIds: new Set([...current.skippedIds, task.id]) }
      : current);
  }, []);
  return { pendingTasks, skipTask };
}

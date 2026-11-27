export type TaskReviewSession = {
  skippedIds: readonly string[];
  restoredTaskId: string | null;
};

export const emptyTaskReviewSession = (): TaskReviewSession => ({
  skippedIds: [], restoredTaskId: null,
});

export function skipTaskReview(session: TaskReviewSession, id: string): TaskReviewSession {
  return {
    skippedIds: [...session.skippedIds.filter((skippedId) => skippedId !== id), id],
    restoredTaskId: null,
  };
}

export function previousSkippedTaskId(session: TaskReviewSession, tasks: readonly { id: string }[]) {
  const available = new Set(tasks.map(({ id }) => id));
  for (let index = session.skippedIds.length - 1; index >= 0; index--) {
    const id = session.skippedIds[index];
    if (available.has(id)) return id;
  }
  return null;
}

export function previousTaskReview(session: TaskReviewSession, tasks: readonly { id: string }[]): TaskReviewSession {
  const id = previousSkippedTaskId(session, tasks);
  return id ? {
    skippedIds: session.skippedIds.filter((skippedId) => skippedId !== id),
    restoredTaskId: id,
  } : session;
}

export function pendingTaskReviews<T extends { id: string }>(tasks: readonly T[], session: TaskReviewSession): T[] {
  const skipped = new Set(session.skippedIds);
  const pending = tasks.filter(({ id }) => !skipped.has(id));
  const restored = pending.find(({ id }) => id === session.restoredTaskId);
  return restored ? [restored, ...pending.filter(({ id }) => id !== restored.id)] : pending;
}

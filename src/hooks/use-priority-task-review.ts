"use client";

import type { TaskReviewPeriod } from "@/lib/task-review-period";

import * as React from "react";
import type { TodoistTask } from "@/lib/todoist";
import {
  createPriorityReviewState,
  PRIORITY_REVIEW_ANIMATION_MS,
  priorityReviewReducer,
  remainingPriorityReviewTasks,
  type PriorityReviewCard,
} from "@/lib/priority-task-review";

export function usePriorityTaskReview(
  tasks: TodoistTask[],
  onRestore: (card: PriorityReviewCard) => void,
  initialReturning: PriorityReviewCard | null,
  onFollowUp: (task: TodoistTask, date: Date, onRestore: () => void, period?: TaskReviewPeriod) => Promise<void>,
) {
  const [state, dispatch] = React.useReducer(priorityReviewReducer, initialReturning, createPriorityReviewState);
  const [error, setError] = React.useState<string | null>(null);
  const locked = React.useRef(false);
  const remaining = remainingPriorityReviewTasks(tasks, state);
  const current = remaining[0];

  const resolve = React.useCallback((reviewAt: Date, task?: TodoistTask, period?: TaskReviewPeriod) => {
    const target = task ?? current;
    if (!target || locked.current) return;
    locked.current = true;
    setError(null);
    const card: PriorityReviewCard = { task: target, direction: "right" };
    dispatch({ type: "resolve", card });
    const restore = () => {
      dispatch({ type: "restore", card });
      locked.current = false;
      onRestore(card);
    };
    void onFollowUp(target, reviewAt, restore, period).catch((caught) => {
      restore();
      setError(caught instanceof Error ? caught.message : "Could not save follow-up");
    });
  }, [current, onFollowUp, onRestore]);

  React.useEffect(() => {
    const card = state.departure ?? state.returning;
    if (!card) return;
    const timer = window.setTimeout(() => {
      dispatch({ type: "animation-end", card });
      locked.current = false;
    }, PRIORITY_REVIEW_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [state.departure, state.returning]);

  return { remaining, departure: state.departure, returning: state.returning, restoredAtFront: state.restoredIds.includes(state.departure?.task.id ?? current?.id ?? ""), error, resolve, finished: !remaining.length && !state.departure };
}

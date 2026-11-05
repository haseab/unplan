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

type ReviewDecision =
  | { kind: "follow-up"; date: Date; period?: TaskReviewPeriod }
  | { kind: "delete" | "schedule" };

export function usePriorityTaskReview(
  tasks: TodoistTask[],
  onRestore: (card: PriorityReviewCard) => void,
  initialReturning: PriorityReviewCard | null,
  onSchedule: (task: TodoistTask, onRestore?: () => void) => Promise<void>,
  onDelete: (task: TodoistTask, onRestore?: () => void) => Promise<void>,
  onFollowUp: (task: TodoistTask, date: Date, onRestore: () => void, period?: TaskReviewPeriod) => Promise<void>,
) {
  const [state, dispatch] = React.useReducer(priorityReviewReducer, initialReturning, createPriorityReviewState);
  const [error, setError] = React.useState<string | null>(null);
  const locked = React.useRef(false);
  const remaining = remainingPriorityReviewTasks(tasks, state);
  const current = remaining[0];

  const decide = React.useCallback((decision: ReviewDecision, task?: TodoistTask) => {
    const target = task ?? current;
    if (!target || locked.current) return;
    locked.current = true;
    setError(null);
    const card: PriorityReviewCard = { task: target, direction: decision.kind === "follow-up" ? "right" : decision.kind === "delete" ? "up" : "left" };
    dispatch({ type: "resolve", card });
    const restore = () => {
      dispatch({ type: "restore", card });
      locked.current = false;
      onRestore(card);
    };
    const mutation = decision.kind === "follow-up" ? onFollowUp(target, decision.date, restore, decision.period)
      : decision.kind === "delete" ? onDelete(target, restore) : onSchedule(target, restore);
    void mutation.catch((caught) => {
      restore();
      setError(caught instanceof Error ? caught.message : "Could not update task");
    });
  }, [current, onFollowUp, onDelete, onSchedule, onRestore]);

  const resolve = React.useCallback((date: Date, task?: TodoistTask, period?: TaskReviewPeriod) => decide({ kind: "follow-up", date, period }, task), [decide]);
  const removeTask = React.useCallback((task?: TodoistTask) => decide({ kind: "delete" }, task), [decide]);
  const scheduleTask = React.useCallback((task?: TodoistTask) => decide({ kind: "schedule" }, task), [decide]);

  React.useEffect(() => {
    const card = state.departure ?? state.returning;
    if (!card) return;
    const timer = window.setTimeout(() => {
      dispatch({ type: "animation-end", card });
      locked.current = false;
    }, PRIORITY_REVIEW_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [state.departure, state.returning]);

  return { remaining, departure: state.departure, returning: state.returning, restoredAtFront: state.restoredIds.includes(state.departure?.task.id ?? current?.id ?? ""), error, resolve, removeTask, scheduleTask, finished: !remaining.length && !state.departure };
}

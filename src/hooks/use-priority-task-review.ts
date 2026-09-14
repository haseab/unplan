"use client";

import * as React from "react";
import type { TodoistTask } from "@/lib/todoist";
import { todoistTaskDisplayTitle } from "@/lib/todoist-calendar";
import {
  createPriorityReviewState,
  PRIORITY_REVIEW_ANIMATION_MS,
  priorityReviewReducer,
  remainingPriorityReviewTasks,
  type PriorityReviewCard,
  type PriorityReviewDirection,
} from "@/lib/priority-task-review";
import { queueActionToast } from "@/lib/action-toast";
import { useToastSettings } from "@/hooks/use-toast-settings";

export function usePriorityTaskReview(
  tasks: TodoistTask[],
  onSchedule: (task: TodoistTask, onRestore?: () => void) => Promise<void>,
  onDelete: (task: TodoistTask, onRestore?: () => void) => Promise<void>,
  onRestore: (card: PriorityReviewCard) => void,
  initialReturning: PriorityReviewCard | null,
) {
  const [state, dispatch] = React.useReducer(priorityReviewReducer, initialReturning, createPriorityReviewState);
  const [error, setError] = React.useState<string | null>(null);
  const locked = React.useRef(false);
  const { duration } = useToastSettings();
  const remaining = remainingPriorityReviewTasks(tasks, state);
  const current = remaining[0];

  const resolve = React.useCallback((action: PriorityReviewDirection | "delete") => {
    if (!current || locked.current) return;
    locked.current = true;
    setError(null);
    const card: PriorityReviewCard = { task: current, direction: action === "delete" ? "up" : action };
    dispatch({ type: "resolve", card });
    const restore = () => {
      dispatch({ type: "restore", card });
      locked.current = false;
      onRestore(card);
    };
    // Queue the mutation immediately so Undo also works during the exit animation.
    if (action !== "right") {
      const mutate = action === "delete" ? onDelete : onSchedule;
      void mutate(current, restore).catch((caught) => {
        restore();
        setError(caught instanceof Error ? caught.message : `That task could not be ${action === "delete" ? "deleted" : "scheduled"}`);
      });
    } else {
      queueActionToast(`Kept ${todoistTaskDisplayTitle(current.content)} in folder`, {
        duration,
        onUndo: restore,
        onSubmit: () => {},
      });
    }
  }, [current, duration, onDelete, onRestore, onSchedule]);

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

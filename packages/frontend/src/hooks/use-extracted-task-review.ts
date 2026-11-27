"use client";

import type { TodoistTask } from "../lib/todoist.js";
import { useTaskReviewSession } from "./use-task-review-session.js";

export function useExtractedTaskReview(
  tasks: TodoistTask[],
  open: boolean,
  onRestore?: () => void,
) {
  return useTaskReviewSession(tasks, open, onRestore);
}

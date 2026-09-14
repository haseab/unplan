import type { TodoistTask } from "./todoist";
import {
  calendarEventDetailsFromTodoistContent,
  isImmediatePriorityTodoistGroup,
  todoistGroupAncestors,
  type TodoistGroupParents,
} from "./todoist-calendar";

export type PriorityReviewDirection = "left" | "right";

export function priorityReviewTasks(tasks: TodoistTask[], parents: TodoistGroupParents) {
  return tasks.filter((task) => {
    const group = calendarEventDetailsFromTodoistContent(task.content).group;
    return group && [group, ...todoistGroupAncestors(group, parents)].some(isImmediatePriorityTodoistGroup);
  });
}

export function prioritySwipeDirection(deltaX: number, deltaY: number): PriorityReviewDirection | null {
  if (Math.abs(deltaX) < 60 || Math.abs(deltaX) <= Math.abs(deltaY)) return null;
  return deltaX < 0 ? "left" : "right";
}


export const PRIORITY_REVIEW_ANIMATION_MS = 130;
export type PriorityReviewCard = { task: TodoistTask; direction: PriorityReviewDirection | "up" };
export type PriorityReviewState = {
  reviewed: Set<string>;
  restoredIds: string[];
  departure: PriorityReviewCard | null;
  returning: PriorityReviewCard | null;
};
export type PriorityReviewAction =
  | { type: "resolve" | "restore"; card: PriorityReviewCard }
  | { type: "animation-end"; card: PriorityReviewCard };

export function createPriorityReviewState(returning: PriorityReviewCard | null = null): PriorityReviewState {
  return { reviewed: new Set(), restoredIds: returning ? [returning.task.id] : [], departure: null, returning };
}

export function priorityReviewReducer(state: PriorityReviewState, action: PriorityReviewAction): PriorityReviewState {
  if (action.type === "animation-end") {
    return {
      ...state,
      departure: state.departure === action.card ? null : state.departure,
      returning: state.returning === action.card ? null : state.returning,
    };
  }
  const id = action.card.task.id;
  const reviewed = new Set(state.reviewed);
  if (action.type === "resolve") {
    reviewed.add(id);
    return { ...state, reviewed, departure: action.card, returning: null };
  }
  reviewed.delete(id);
  return { ...state, reviewed, departure: null, returning: action.card, restoredIds: [id, ...state.restoredIds.filter((value) => value !== id)] };
}

export function remainingPriorityReviewTasks(tasks: TodoistTask[], state: PriorityReviewState) {
  const available = new Map(tasks.map((task) => [task.id, task]));
  if (state.returning) available.set(state.returning.task.id, state.returning.task);
  const restored = state.restoredIds.flatMap((id) => available.has(id) ? [available.get(id)!] : []);
  const restoredIds = new Set(state.restoredIds);
  return [...restored, ...tasks.filter((task) => !restoredIds.has(task.id))]
    .filter((task) => !state.reviewed.has(task.id));
}

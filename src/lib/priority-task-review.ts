import type { TodoistTask } from "./todoist";
import {
  calendarEventDetailsFromTodoistContent,
  isImmediatePriorityTodoistGroup,
  todoistGroupAncestors,
  type TodoistGroupParents,
} from "./todoist-calendar";

export type PriorityReviewDirection = "left" | "right";

export const PRIORITY_REVIEW_SECTIONS = ["Priority Right Now", "Priority Today"] as const;
export type PriorityReviewSection = typeof PRIORITY_REVIEW_SECTIONS[number];

export function priorityReviewSection(task: TodoistTask, parents: TodoistGroupParents): PriorityReviewSection | null {
  const { group } = calendarEventDetailsFromTodoistContent(task.content);
  if (!group) return null;
  const priorityGroup = [group, ...todoistGroupAncestors(group, parents)].find(isImmediatePriorityTodoistGroup);
  if (!priorityGroup) return null;
  return priorityGroup.split("/").at(-1)?.trim().toLocaleLowerCase() === "priority today"
    ? "Priority Today" : "Priority Right Now";
}

export function priorityReviewTasks(tasks: TodoistTask[], parents: TodoistGroupParents) {
  return tasks.flatMap((task) => {
    const section = priorityReviewSection(task, parents);
    if (!section) return [];
    const { groupChangedAt } = calendarEventDetailsFromTodoistContent(task.content);
    const filedAt = Date.parse(groupChangedAt ?? "");
    return [{ task, section, filedAt: Number.isFinite(filedAt) ? filedAt : 0 }];
  })
    .sort((first, second) => PRIORITY_REVIEW_SECTIONS.indexOf(first.section) - PRIORITY_REVIEW_SECTIONS.indexOf(second.section)
      || second.filedAt - first.filedAt)
    .map(({ task }) => task);
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

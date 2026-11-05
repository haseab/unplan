import type { TaskReviewPeriod } from "./task-review-period";
import type { TodoistTask } from "./todoist";
import {
  calendarEventDetailsFromTodoistContent,
  isTodoistTriageGroup,
  todoistContentWithGroupChange,
  todoistContentWithReviewAt,
  todoistContentReturnedToTriage,
  todoistGroupAncestors,
  type TodoistGroupParents,
} from "./todoist-calendar";

export type PriorityReviewDirection = "left" | "right";

export const PRIORITY_REVIEW_SECTIONS = ["Priority Today", "Priority Tomorrow", "Priority Later"] as const;
export type PriorityReviewSection = string;

export function priorityReviewSection(task: TodoistTask, parents: TodoistGroupParents): PriorityReviewSection | null {
  const details = calendarEventDetailsFromTodoistContent(task.content);
  const group = isTodoistTriageGroup(details.group) ? details.triageSourceGroup : details.group;
  if (!group) return null;
  // Choose the nearest priority ancestor; Now must not inherit another priority category.
  const priorityGroup = [group, ...todoistGroupAncestors(group, parents).reverse()]
    .find((candidate) => /^priority(?: |$)/i.test(candidate.split("/").at(-1)?.trim() ?? ""));
  const leaf = priorityGroup?.split("/").at(-1)?.trim().toLocaleLowerCase();
  return PRIORITY_REVIEW_SECTIONS.find((section) => section.toLocaleLowerCase() === leaf) ?? null;
}

export function priorityReviewDefaultDays(task: TodoistTask, parents: TodoistGroupParents) {
  return priorityReviewSection(task, parents) === "Priority Later" ? 7 : 3;
}

export function isDefaultRefreshedPriorityReviewTask(task: TodoistTask, parents: TodoistGroupParents) {
  const details = calendarEventDetailsFromTodoistContent(task.content);
  return isTodoistTriageGroup(details.group) && !!details.triageSourceGroup
    && !Number.isFinite(Date.parse(details.reviewAt ?? ""))
    && priorityReviewSection(task, parents) !== null;
}

export function priorityTaskContentWithReviewAt(task: TodoistTask, date: Date, now = new Date(), period?: TaskReviewPeriod) {
  const details = calendarEventDetailsFromTodoistContent(task.content);
  const content = isTodoistTriageGroup(details.group) && details.triageSourceGroup
    ? todoistContentWithGroupChange(task.content, details.triageSourceGroup)
    : task.content;
  return todoistContentWithReviewAt(content, date, now, period);
}

export function priorityTaskContentRefreshedNow(task: TodoistTask, parents: TodoistGroupParents, now = new Date()) {
  const details = calendarEventDetailsFromTodoistContent(task.content);
  const period = details.reviewPeriod ?? {
    amount: priorityReviewDefaultDays(task, parents), unit: "day" as const,
    dayOfMonth: now.getDate(), monthOfYear: now.getMonth(),
  };
  const content = priorityTaskContentWithReviewAt(task, now, now, period);
  const group = calendarEventDetailsFromTodoistContent(content).group ?? "Ungrouped";
  return todoistContentReturnedToTriage(content, group, now);
}

const prioritySectionOrder = (section: string) => {
  const index = (PRIORITY_REVIEW_SECTIONS as readonly string[]).indexOf(section);
  return index < 0 ? PRIORITY_REVIEW_SECTIONS.length : index;
};

export function priorityReviewTasks(tasks: TodoistTask[], parents: TodoistGroupParents) {
  return tasks.flatMap((task) => {
    const section = priorityReviewSection(task, parents);
    if (!section) return [];
    const { groupChangedAt, reviewAt } = calendarEventDetailsFromTodoistContent(task.content);
    // Assigned follow-ups return to task triage when due; only defaults need a date decision here.
    if (Number.isFinite(Date.parse(reviewAt ?? ""))) return [];
    const filedAt = Date.parse(groupChangedAt ?? "");
    return [{ task, section, filedAt: Number.isFinite(filedAt) ? filedAt : 0 }];
  })
    .sort((first, second) => prioritySectionOrder(first.section) - prioritySectionOrder(second.section)
      || second.filedAt - first.filedAt)
    .map(({ task }) => task);
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

import { nextTaskReviewDate } from "./task-review-period";
import { isDefaultRefreshedPriorityReviewTask, priorityTaskContentWithReviewAt } from "./priority-task-review";
import {
  calendarEventDetailsFromTodoistContent,
  flattenTodoistGroupTree,
  isTodoistTriageGroup,
  priorityTodoistGroupRefreshDays,
  todoistGroupAncestors,
  todoistContentWithGroupChange,
  type TodoistGroupParents,
} from "./todoist-calendar";
import type { TodoistTask } from "./todoist";

export const isNormalTaskTriageTask = (task: TodoistTask, parents: TodoistGroupParents, now = new Date()) => {
  const details = calendarEventDetailsFromTodoistContent(task.content);
  return isTodoistTriageGroup(details.group)
    && !(Date.parse(details.reviewAt ?? "") > now.getTime())
    && !isDefaultRefreshedPriorityReviewTask(task, parents);
};

export function taskFollowUpIntervalMs(task: TodoistTask) {
  const details = calendarEventDetailsFromTodoistContent(task.content);
  // Older records did not save their chosen interval. Use the original folder's default.
  return Number.isFinite(details.reviewIntervalMs) && details.reviewIntervalMs! > 0
    ? details.reviewIntervalMs!
    : (priorityTodoistGroupRefreshDays(details.triageSourceGroup ?? details.group ?? "") ?? 7) * 86_400_000;
}

export function describeTaskFollowUpInterval(task: TodoistTask) {
  const period = calendarEventDetailsFromTodoistContent(task.content).reviewPeriod;
  if (period && period.unit !== "minute" && period.unit !== "hour") {
    const suffix = { day: "d", week: "w", month: "mo", year: "y" }[period.unit];
    return `${period.amount}${suffix}`;
  }
  const intervalMs = period
    ? period.amount * (period.unit === "hour" ? 3_600_000 : 60_000)
    : taskFollowUpIntervalMs(task);
  const minutes = Math.max(1, Math.round(intervalMs / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;
  return [
    days ? `${days}d` : null,
    hours ? `${hours}h` : null,
    !days && remainingMinutes ? `${remainingMinutes} min` : null,
  ].filter(Boolean).join(" ");
}

/** Explicit folder choices clear the follow-up; Keep alone repeats its interval. */
export function taskTriageKeepContent(task: TodoistTask, group: string, now = new Date()) {
  const details = calendarEventDetailsFromTodoistContent(task.content);
  if (details.triageSourceGroup && Number.isFinite(Date.parse(details.reviewAt ?? ""))) {
    const period = details.reviewPeriod;
    const date = period ? nextTaskReviewDate(period, now) : new Date(now.getTime() + taskFollowUpIntervalMs(task));
    return priorityTaskContentWithReviewAt(task, date, now, period);
  }
  return todoistContentWithGroupChange(task.content, group, now);
}

export const taskTriagePreviousFolder = (task: TodoistTask | null, groups: readonly string[]): string | null => {
  if (!task) return null;
  const { triageSourceGroup } = calendarEventDetailsFromTodoistContent(task.content);
  return triageSourceGroup && groups.includes(triageSourceGroup) ? triageSourceGroup : null;
};

/** Fresh tasks first, then refreshed categories: Tomorrow, Later, and the rest. */
export const orderTaskTriageTasks = (tasks: readonly TodoistTask[]): TodoistTask[] => {
  const fresh: TodoistTask[] = [];
  const returned = new Map<string, { tasks: TodoistTask[]; priority: number }>();
  for (const task of tasks) {
    const { triageSourceGroup } = calendarEventDetailsFromTodoistContent(task.content);
    if (!triageSourceGroup) {
      fresh.push(task);
      continue;
    }
    const category = triageSourceGroup.trim().toLocaleLowerCase();
    let bucket = returned.get(category);
    if (!bucket) {
      bucket = {
        tasks: [],
        priority: priorityTodoistGroupRefreshDays(triageSourceGroup) ?? Number.MAX_SAFE_INTEGER,
      };
      returned.set(category, bucket);
    }
    bucket.tasks.push(task);
  }
  return [
    ...fresh,
    ...[...returned.values()]
      .sort((left, right) => left.priority - right.priority)
      .flatMap(({ tasks }) => tasks),
  ];
};

export type TaskTriageFolder = {
  depth: number;
  label: string;
  name: string;
  path: string;
};

export type TaskTriageMode = "extracted" | "normal" | "priority" | "follow-up";

export const taskTriagePhase = (
  initialMode: TaskTriageMode,
  extractedTaskCount: number,
  normalTaskCount: number,
  activePhase: TaskTriageMode | null = null,
): TaskTriageMode => {
  if (activePhase === "priority") return "priority";
  if (initialMode === "follow-up") return "priority";
  if (initialMode !== "normal" && extractedTaskCount > 0) return "extracted";
  if (normalTaskCount > 0) return "normal";
  return "priority";
};

export const taskTriageShortcutMode = ({
  altKey,
  extractedTaskCount,
  key,
  modalOpen,
  modifier,
  normalTaskCount,
  repeat,
  shiftKey,
}: {
  altKey: boolean;
  extractedTaskCount: number;
  key: string;
  modalOpen: boolean;
  modifier: boolean;
  normalTaskCount: number;
  repeat: boolean;
  shiftKey: boolean;
}): TaskTriageMode | null => {
  const isShortcut = modifier
    && !altKey
    && key.toLowerCase() === "e"
    && !modalOpen
    && !repeat
    && !shiftKey;
  if (!isShortcut) return null;
  return taskTriagePhase("extracted", extractedTaskCount, normalTaskCount);
};

const folderLabel = (group: string) =>
  group.split("/").map((part) => part.trim()).filter(Boolean).at(-1) ?? group;

export const taskTriageFolders = ({
  groups,
  order,
  parents,
  query = "",
}: {
  groups: string[];
  order: string[];
  parents: TodoistGroupParents;
  query?: string;
}) => {
  const uniqueGroups = [...new Map(groups.map((group) => [
    group.trim().toLocaleLowerCase(),
    group.trim(),
  ])).values()].filter(Boolean);
  const availableGroups = new Set(uniqueGroups);
  const orderedGroups = flattenTodoistGroupTree(
    uniqueGroups.map((group) => [group, group] as [string, string]),
    order,
    parents,
  ).map(([, group]) => group);
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return orderedGroups.flatMap((group) => {
    const ancestors = todoistGroupAncestors(group, parents).filter((ancestor) =>
      availableGroups.has(ancestor)
    );
    const labels = [...ancestors, group].map(folderLabel);
    const folder = {
      depth: ancestors.length,
      label: folderLabel(group),
      name: group,
      path: labels.join(" / "),
    };
    return !normalizedQuery
      || folder.label.toLocaleLowerCase().includes(normalizedQuery)
      || folder.path.toLocaleLowerCase().includes(normalizedQuery)
      ? [folder]
      : [];
  });
};

export function isTaskTriageCalendarShortcut(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat" | "isComposing">, phase: TaskTriageMode, titleEditing: boolean) {
  if (titleEditing || event.altKey || event.repeat || event.isComposing || event.key !== "ArrowLeft") return false;
  return (phase === "extracted" || phase === "normal")
    && (event.metaKey || event.ctrlKey) && event.shiftKey;
}

import {
  calendarEventDetailsFromTodoistContent,
  flattenTodoistGroupTree,
  priorityTodoistGroupRefreshDays,
  todoistGroupAncestors,
  type TodoistGroupParents,
} from "./todoist-calendar";
import type { TodoistTask } from "./todoist";

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

export type TaskTriageMode = "extracted" | "normal" | "priority";

export const taskTriagePhase = (
  initialMode: TaskTriageMode,
  extractedTaskCount: number,
  normalTaskCount: number,
): TaskTriageMode => {
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

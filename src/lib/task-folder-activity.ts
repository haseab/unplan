import { todoistGroupAncestors, type TodoistGroupParents } from "./todoist-calendar";

export const TASK_FOLDER_ACTIVITY_STORAGE_KEY = "unplan:task-folder-activity:v1";

export type TaskFolderActivity = Record<string, { active: boolean; changedAt: string }>;

export function parseTaskFolderActivity(serialized: string | null): TaskFolderActivity {
  try {
    const value: unknown = JSON.parse(serialized ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry) => {
      const setting = entry[1];
      return setting && typeof setting === "object"
        && typeof setting.active === "boolean"
        && typeof setting.changedAt === "string"
        && Number.isFinite(Date.parse(setting.changedAt));
    }));
  } catch {
    return {};
  }
}

export function taskFolderActivityState(
  group: string,
  activity: TaskFolderActivity,
  parents: TodoistGroupParents,
) {
  const lineage = [...todoistGroupAncestors(group, parents), group];
  const sources = lineage.filter((source) => activity[source]?.active);
  if (sources.length) {
    const source = sources.reduce((earliest, candidate) =>
      Date.parse(activity[candidate].changedAt) < Date.parse(activity[earliest].changedAt)
        ? candidate : earliest);
    return {
      active: true,
      changedAt: activity[source].changedAt,
      source,
      inherited: sources.some((candidate) => candidate !== group),
    };
  }
  return { active: false, changedAt: "", source: null, inherited: false };
}

/** Most recent month-end day, at midnight in the user's local timezone. */
export function latestMonthEnd(now: Date) {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return now.getTime() >= end.getTime()
    ? end
    : new Date(now.getFullYear(), now.getMonth(), 0);
}

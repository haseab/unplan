import type { TriagePreferences } from "./triage-contract";
import { parseTaskFolderActivity, type TaskFolderActivity } from "./task-folder-activity";
import type { TodoistGroupParents } from "./todoist-calendar";
import type { TodoistTask } from "./todoist";

export const TASK_REFRESH_SETTINGS_PREFIX = "unplan:task-refresh-settings:v1\n";
export const TASK_REFRESH_SETTINGS_UPDATED_AT = "unplan:task-refresh-settings:updated-at:v1";
export type TaskRefreshSettings = { activity: TaskFolderActivity; parents: TodoistGroupParents; timeZone: string; updatedAt: string; triage?: TriagePreferences };
export const isTaskRefreshSettingsTask = (task: TodoistTask) => task.description.startsWith(TASK_REFRESH_SETTINGS_PREFIX);

export function parseTaskRefreshSettings(value: unknown): TaskRefreshSettings | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<TaskRefreshSettings>;
  if (typeof input.updatedAt !== "string" || !Number.isFinite(Date.parse(input.updatedAt)) || typeof input.timeZone !== "string") return null;
  try { new Intl.DateTimeFormat("en-US", { timeZone: input.timeZone }).format(); } catch { return null; }
  const parents = input.parents;
  if (!parents || typeof parents !== "object" || Array.isArray(parents)) return null;
  const entries = Object.entries(parents);
  if (entries.some(([key, parent]) => !key || (parent !== null && typeof parent !== "string"))) return null;
  const triage = input.triage;
  if (triage && (!Array.isArray(triage.customGroups) || !Array.isArray(triage.groupOrder) || [...triage.customGroups, ...triage.groupOrder].some((g) => typeof g !== "string" || g.length > 200) || (triage.defaultCalendarId !== null && typeof triage.defaultCalendarId !== "string") || (triage.preferredProjectId !== null && typeof triage.preferredProjectId !== "string"))) return null;
  return { ...(triage ? { triage } : {}), activity: parseTaskFolderActivity(JSON.stringify(input.activity ?? {})), parents: Object.fromEntries(entries), timeZone: input.timeZone, updatedAt: input.updatedAt };
}

export function taskRefreshSettingsFromTask(task: TodoistTask): TaskRefreshSettings | null {
  if (!isTaskRefreshSettingsTask(task)) return null;
  try { return parseTaskRefreshSettings(JSON.parse(task.description.slice(TASK_REFRESH_SETTINGS_PREFIX.length))); } catch { return null; }
}

export function latestTaskRefreshSettings(tasks: TodoistTask[]) {
  return tasks.flatMap((task) => { const settings = taskRefreshSettingsFromTask(task); return settings ? [{ task, settings }] : []; })
    .sort((a, b) => Date.parse(b.settings.updatedAt) - Date.parse(a.settings.updatedAt))[0] ?? null;
}

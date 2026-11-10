import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { collectTodoistPages, normalizeTodoistTask, type TodoistTaskPayload, type TodoistPage } from "./todoist";
import { todoistTokenFetch, readTodoistProviderResponse } from "./todoist-server";
import { findTaskExtractionProject } from "./task-extraction";
import { isFollowUpTask } from "./todoist-follow-ups";
import { refreshTasks } from "./task-refresh";
import { isTaskRefreshSettingsTask, latestTaskRefreshSettings, TASK_REFRESH_SETTINGS_PREFIX, type TaskRefreshSettings } from "./task-refresh-settings";

export function secretMatches(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(actual), digest(expected));
}

async function requestTodoist<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  return await readTodoistProviderResponse(await todoistTokenFetch(token, path, { ...init, signal: AbortSignal.timeout(20_000) })) as T;
}

export async function readTaskRefreshState(token: string) {
  const [tasks, projects] = await Promise.all([
    collectTodoistPages(async (cursor) => requestTodoist<TodoistPage<TodoistTaskPayload>>(token, `/tasks?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)),
    collectTodoistPages(async (cursor) => requestTodoist<TodoistPage<{ id: string; name: string; inbox_project?: boolean; parent_id?: string }>>(token, `/projects?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)),
  ]);
  const normalized = tasks.map(normalizeTodoistTask);
  return { tasks: normalized, projects: projects.map((p) => ({ id: String(p.id), name: p.name, inbox: !!p.inbox_project, parentId: p.parent_id ?? null })), record: latestTaskRefreshSettings(normalized) };
}

export async function saveTaskRefreshSettings(token: string, settings: TaskRefreshSettings) {
  const state = await readTaskRefreshState(token);
  if (state.record && Date.parse(state.record.settings.updatedAt) > Date.parse(settings.updatedAt)) return state.record.settings;
  settings = { ...settings, ...(settings.triage ? {} : state.record?.settings.triage ? { triage: state.record.settings.triage } : {}) };
  const payload = { content: "Unplan refresh settings", description: TASK_REFRESH_SETTINGS_PREFIX + JSON.stringify(settings) };
  if (state.record) {
    await requestTodoist(token, `/tasks/${encodeURIComponent(state.record.task.id)}`, { method: "POST", body: JSON.stringify(payload) });
  } else {
    const inbox = state.projects.find((p) => p.inbox);
    if (!inbox) throw new Error("Todoist Inbox is unavailable");
    await requestTodoist(token, "/tasks", { method: "POST", body: JSON.stringify({ ...payload, project_id: inbox.id }) });
  }
  return settings;
}

export async function runTaskRefresh(token: string, now = new Date()) {
  const state = await readTaskRefreshState(token);
  const extractionId = findTaskExtractionProject(state.projects)?.id;
  const tasks = state.tasks.filter((task) => task.projectId !== extractionId && !isTaskRefreshSettingsTask(task) && !isFollowUpTask(task) && task.content.includes("[[unplan:v1;"));
  const folders = state.record?.settings ?? { activity: {}, parents: {}, timeZone: "America/Los_Angeles" };
  return refreshTasks(tasks, folders, now, {
    readTask: async (id) => normalizeTodoistTask(await requestTodoist<TodoistTaskPayload>(token, `/tasks/${encodeURIComponent(id)}`)),
    updateTask: (id, content) => requestTodoist(token, `/tasks/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ content }) }),
  });
}

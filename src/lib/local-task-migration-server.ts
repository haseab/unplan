import { createHash } from "node:crypto";
import { collectTodoistPages, type TodoistPage, type TodoistTaskPayload } from "./todoist";
import { localTaskMigrationContent, localTaskMigrationRevision, migratedLocalTaskId } from "./local-task-migration";

type MigrationInput = { localId: string; content: string; description: string; priority: number; projectId: string; sectionId?: string; dueDatetime?: string; dueDate?: string };
type RequestTodoist = <T>(path: string, init?: RequestInit) => Promise<T>;
const stableUuid = (value: string) => {
  const hash = createHash("sha256").update(value).digest("hex");
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
};

/** Stable Sync command IDs prevent duplicate uploads after retries or a lost response. */
export async function migrateLocalTask(input: MigrationInput, request: RequestTodoist): Promise<TodoistTaskPayload> {
  const uuid = stableUuid(`unplan:local-migration:${input.localId}`);
  const tempId = stableUuid(`unplan:local-migration:temp:${input.localId}`);
  const revision = createHash("sha256").update(JSON.stringify([input.content, input.description, input.priority, input.dueDatetime ?? input.dueDate ?? null])).digest("hex");
  const content = localTaskMigrationContent(input.content, input.localId, revision);
  const reconcile = (saved: TodoistTaskPayload) => localTaskMigrationRevision(saved.content) === revision
    ? Promise.resolve(saved)
    : request<TodoistTaskPayload>(`/tasks/${encodeURIComponent(saved.id)}`, {
      method: "POST", body: JSON.stringify({ content, description: input.description, priority: input.priority,
        ...(input.dueDatetime ? { due_datetime: input.dueDatetime } : input.dueDate ? { due_date: input.dueDate } : {}),
      }),
    });
  const commands = [{ type: "item_add", uuid, temp_id: tempId, args: {
    content, description: input.description,
    priority: input.priority, project_id: input.projectId,
    ...(input.sectionId ? { section_id: input.sectionId } : {}),
    ...((input.dueDatetime || input.dueDate) ? { due: { date: input.dueDatetime ?? input.dueDate } } : {}),
  } }];
  const result = await request<{ sync_status?: Record<string, "ok" | { error?: string; http_code?: number }>; temp_id_mapping?: Record<string,string> }>("/sync", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ commands: JSON.stringify(commands) }),
  });
  const status = result.sync_status?.[uuid];
  if (status !== "ok") throw Object.assign(new Error(typeof status === "object" ? status.error : "Todoist did not confirm the task upload"), { status: typeof status === "object" ? status.http_code ?? 502 : 502 });
  const id = result.temp_id_mapping?.[tempId];
  if (id) {
    let saved = await request<TodoistTaskPayload & { checked?: boolean; is_completed?: boolean }>(`/tasks/${encodeURIComponent(id)}`);
    if (saved.checked || saved.is_completed) {
      await request(`/tasks/${encodeURIComponent(id)}/reopen`, { method: "POST" });
      saved = await request<TodoistTaskPayload>(`/tasks/${encodeURIComponent(id)}`);
    }
    return reconcile(saved);
  }
  // A replay may omit the temporary mapping. Recover the original task by its hidden marker.
  const tasks = await collectTodoistPages((cursor) => request<TodoistPage<TodoistTaskPayload>>(`/tasks?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`));
  const existing = tasks.find((task) => migratedLocalTaskId(task.content) === input.localId);
  if (!existing) throw new Error("Todoist accepted the upload but its task could not be recovered; the local copy is retained");
  return reconcile(existing);
}

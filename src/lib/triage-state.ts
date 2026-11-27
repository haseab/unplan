import { collectTodoistPages, normalizeTodoistTask, type TodoistPage, type TodoistProject, type TodoistTaskPayload } from "./todoist";
import { attentionTaskProjects } from "./attention-triage-counts";
import { latestTaskRefreshSettings } from "./task-refresh-settings";

type ProjectPayload = { id: string; name: string; inbox_project?: boolean; parent_id?: string };
type Request = <T>(path: string) => Promise<T>;

/** Read only the configured task projects. Settings are stored in Inbox. */
export async function readTriageState(request: Request, extraBucketIds: string[] = []) {
  const rawProjects = await collectTodoistPages((cursor) => request<TodoistPage<ProjectPayload>>(
    `/projects?${new URLSearchParams({ limit: "200", ...(cursor ? { cursor } : {}) })}`,
  ));
  const projects: TodoistProject[] = rawProjects.map((p) => ({ id: String(p.id), name: p.name, inbox: !!p.inbox_project, parentId: p.parent_id ?? null }));
  const { bucketIds, extractionId } = attentionTaskProjects(projects, extraBucketIds);
  const projectIds = new Set([...bucketIds, ...(extractionId ? [extractionId] : [])]);
  const lists = await Promise.all([...projectIds].map((projectId) => collectTodoistPages((cursor) => request<TodoistPage<TodoistTaskPayload>>(
    `/tasks?${new URLSearchParams({ limit: "200", project_id: projectId, ...(cursor ? { cursor } : {}) })}`,
  ))));
  const tasks = [...new Map(lists.flat().map(normalizeTodoistTask)
    .filter((t) => projectIds.has(t.projectId)).map((t) => [t.id, t])).values()];
  return { tasks, projects, record: latestTaskRefreshSettings(tasks) };
}

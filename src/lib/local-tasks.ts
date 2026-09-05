import type { TodoistTask } from "./todoist";

export const LOCAL_TASKS_STORAGE_KEY = "unplan:local-tasks:v1";
export const LOCAL_TASK_ID_PREFIX = "local-";
export const LOCAL_TASK_PROJECT_ID = "__unplan_local__";

export const isLocalTaskId = (taskId: string) =>
  taskId.startsWith(LOCAL_TASK_ID_PREFIX);

export const isLocalTask = (task: TodoistTask) =>
  task.source === "local" || isLocalTaskId(task.id);

export const parseLocalTasks = (value: string | null): TodoistTask[] => {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((candidate): TodoistTask[] => {
      if (
        typeof candidate !== "object"
        || candidate === null
        || !("id" in candidate)
        || typeof candidate.id !== "string"
        || !("content" in candidate)
        || typeof candidate.content !== "string"
      ) return [];
      const id = candidate.id;
      const content = candidate.content;
      const task = candidate as Partial<TodoistTask>;
      return [{
        id,
        content,
        description: typeof task.description === "string" ? task.description : "",
        priority: typeof task.priority === "number" ? task.priority : 1,
        projectId: LOCAL_TASK_PROJECT_ID,
        due: task.due ?? null,
        source: "local",
      }];
    });
  } catch {
    return [];
  }
};

export const serializeLocalTasks = (tasks: TodoistTask[]) =>
  JSON.stringify(tasks.filter(isLocalTask));

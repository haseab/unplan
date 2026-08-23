export const TODOIST_TOKEN_STORAGE_KEY = "todoist_api_key";
export const TODOIST_PROJECT_STORAGE_KEY = "todoist_project_id";
export const TODOIST_SECTION_STORAGE_KEY = "todoist_section_id";
export const TODOIST_TOKEN_HEADER = "x-todoist-api-key";

export type TodoistProject = {
  id: string;
  inbox: boolean;
  name: string;
  parentId: string | null;
};

export type TodoistSection = {
  id: string;
  name: string;
  projectId: string;
};

export const resolveTodoistDestination = (
  projects: TodoistProject[],
  sections: TodoistSection[],
  requestedProjectId: string,
  requestedSectionId: string,
) => {
  const projectId = projects.some(({ id }) => id === requestedProjectId)
    ? requestedProjectId
    : projects.find(({ inbox }) => inbox)?.id ?? projects[0]?.id ?? "";
  const sectionId = sections.some(
    ({ id, projectId: sectionProjectId }) =>
      id === requestedSectionId && sectionProjectId === projectId,
  ) ? requestedSectionId : "";
  return { projectId, sectionId };
};

export type TodoistTask = {
  id: string;
  content: string;
  description: string;
  priority: number;
  projectId: string;
  due: {
    date: string;
    datetime?: string;
    recurring: boolean;
    string: string;
  } | null;
};

type TodoistTaskPayload = {
  id: string;
  content: string;
  description?: string | null;
  priority?: number | null;
  project_id: string;
  due?: {
    date: string;
    datetime?: string | null;
    is_recurring?: boolean;
    recurring?: boolean;
    string: string;
  } | null;
};

type TodoistProjectPayload = {
  id: string;
  inbox_project?: boolean;
  name: string;
  parent_id?: string | null;
};

type TodoistSectionPayload = {
  id: string;
  name: string;
  project_id: string;
};

export const normalizeTodoistTask = (task: TodoistTaskPayload): TodoistTask => ({
  id: String(task.id),
  content: task.content,
  description: task.description ?? "",
  priority: task.priority ?? 1,
  projectId: String(task.project_id),
  due: task.due
    ? {
        date: task.due.date,
        datetime: task.due.datetime ?? undefined,
        recurring: task.due.is_recurring ?? task.due.recurring ?? false,
        string: task.due.string,
      }
    : null,
});

type TodoistErrorPayload = { error?: string; message?: string };

const todoistRequest = async <Result>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<Result> => {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...init?.headers,
      [TODOIST_TOKEN_HEADER]: token,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) as Result & TodoistErrorPayload : null;
  if (!response.ok) {
    throw new Error(data?.error ?? data?.message ?? "Todoist rejected the request");
  }
  return data as Result;
};

export const loadTodoistTasks = async (token: string) => {
  const data = await todoistRequest<{ tasks: TodoistTaskPayload[] }>("/api/todoist/tasks", token);
  return data.tasks.map(normalizeTodoistTask);
};

export const loadTodoistDestinations = async (token: string) => {
  const data = await todoistRequest<{
    projects: TodoistProjectPayload[];
    sections: TodoistSectionPayload[];
  }>("/api/todoist/destinations", token);
  return {
    projects: data.projects.map((project) => ({
      id: String(project.id),
      inbox: project.inbox_project ?? false,
      name: project.name,
      parentId: project.parent_id ? String(project.parent_id) : null,
    })),
    sections: data.sections.map((section) => ({
      id: String(section.id),
      name: section.name,
      projectId: String(section.project_id),
    })),
  };
};

export const createTodoistTask = async (
  token: string,
  input: {
    content: string;
    description?: string;
    dueDatetime?: string;
    projectId?: string;
    sectionId?: string;
  },
) => {
  const data = await todoistRequest<{ task: TodoistTaskPayload }>("/api/todoist/tasks", token, {
    method: "POST",
    body: JSON.stringify({ action: "create", ...input }),
  });
  return normalizeTodoistTask(data.task);
};

export const closeTodoistTask = async (token: string, taskId: string) => {
  await todoistRequest<{ ok: true }>("/api/todoist/tasks", token, {
    method: "POST",
    body: JSON.stringify({ action: "close", taskId }),
  });
};

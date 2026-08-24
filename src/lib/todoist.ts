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
  optimistic?: boolean;
  priority: number;
  projectId: string;
  due: {
    date: string;
    datetime?: string;
    recurring: boolean;
    string: string;
  } | null;
};

export type CreateTodoistTaskInput = {
  content: string;
  description?: string;
  dueDatetime?: string;
  projectId?: string;
  sectionId?: string;
};

export type UpdateTodoistTaskInput = {
  content: string;
  description?: string;
};

export type TodoistTaskDropEdge = "after" | "before";

export type TodoistTaskDropTarget = {
  edge: TodoistTaskDropEdge;
  taskId: string;
};

export const todoistTaskDropTargetAtPointer = (
  slots: Array<{ center: number; taskId: string }>,
  pointerPosition: number,
): TodoistTaskDropTarget | null => {
  const targetBefore = slots.find(({ center }) => pointerPosition < center);
  const target = targetBefore ?? slots.at(-1);
  return target
    ? {
        edge: targetBefore ? "before" : "after",
        taskId: target.taskId,
      }
    : null;
};

export const insertTodoistTasksAtTarget = (
  tasks: TodoistTask[],
  insertedTasks: TodoistTask[],
  target?: TodoistTaskDropTarget,
) => {
  const targetIndex = target
    ? tasks.findIndex(({ id }) => id === target.taskId)
    : -1;
  const insertionIndex = targetIndex < 0
    ? 0
    : targetIndex + (target?.edge === "after" ? 1 : 0);
  return [
    ...tasks.slice(0, insertionIndex),
    ...insertedTasks,
    ...tasks.slice(insertionIndex),
  ];
};

export const insertTodoistTaskAtIndex = (
  tasks: TodoistTask[],
  task: TodoistTask,
  index: number,
) => {
  const withoutTask = tasks.filter(({ id }) => id !== task.id);
  const insertionIndex = Math.max(0, Math.min(index, withoutTask.length));
  return [
    ...withoutTask.slice(0, insertionIndex),
    task,
    ...withoutTask.slice(insertionIndex),
  ];
};

export const reorderTodoistTaskIds = (
  taskIds: string[],
  draggedTaskId: string,
  targetTaskId: string,
  edge: TodoistTaskDropEdge,
) => {
  if (draggedTaskId === targetTaskId) return taskIds;
  const withoutDragged = taskIds.filter((taskId) => taskId !== draggedTaskId);
  const targetIndex = withoutDragged.indexOf(targetTaskId);
  if (targetIndex < 0 || withoutDragged.length === taskIds.length) return taskIds;
  const insertionIndex = targetIndex + (edge === "after" ? 1 : 0);
  return [
    ...withoutDragged.slice(0, insertionIndex),
    draggedTaskId,
    ...withoutDragged.slice(insertionIndex),
  ];
};

export const applyTodoistTaskOrder = (
  tasks: TodoistTask[],
  orderedTaskIds: string[],
) => {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const orderedTasks = orderedTaskIds.flatMap((taskId) => {
    const task = tasksById.get(taskId);
    return task ? [task] : [];
  });
  const orderedIds = new Set(orderedTasks.map((task) => task.id));
  let orderedIndex = 0;
  return tasks.map((task) =>
    orderedIds.has(task.id) ? orderedTasks[orderedIndex++] : task,
  );
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

export type TodoistPage<Result> =
  | Result[]
  | {
      next_cursor?: string | null;
      results?: Result[];
    };

export const todoistPageResults = <Result>(page: TodoistPage<Result>) =>
  Array.isArray(page) ? page : page.results ?? [];

export const todoistNextCursor = <Result>(page: TodoistPage<Result>) =>
  Array.isArray(page) ? null : page.next_cursor?.trim() || null;

export const collectTodoistPages = async <Result>(
  loadPage: (cursor: string | null) => Promise<TodoistPage<Result>>,
) => {
  const results: Result[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  do {
    const page = await loadPage(cursor);
    results.push(...todoistPageResults(page));
    const nextCursor = todoistNextCursor(page);
    if (nextCursor && seenCursors.has(nextCursor)) {
      throw new Error("Todoist returned a repeated pagination cursor");
    }
    if (nextCursor) seenCursors.add(nextCursor);
    cursor = nextCursor;
  } while (cursor);

  return results;
};

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

export const loadTodoistTasks = async (token: string, projectId: string) => {
  if (!projectId) return [];
  const params = new URLSearchParams({ projectId });
  const data = await todoistRequest<{ tasks: TodoistTaskPayload[] }>(
    `/api/todoist/tasks?${params}`,
    token,
  );
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

export const createTodoistProject = async (token: string, name: string) => {
  const data = await todoistRequest<{ project: TodoistProjectPayload }>(
    "/api/todoist/destinations",
    token,
    {
      method: "POST",
      body: JSON.stringify({ name }),
    },
  );
  return {
    id: String(data.project.id),
    inbox: data.project.inbox_project ?? false,
    name: data.project.name,
    parentId: data.project.parent_id ? String(data.project.parent_id) : null,
  } satisfies TodoistProject;
};

export const createTodoistTask = async (
  token: string,
  input: CreateTodoistTaskInput,
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

export const deleteTodoistTask = async (token: string, taskId: string) => {
  await todoistRequest<{ ok: true }>("/api/todoist/tasks", token, {
    method: "POST",
    body: JSON.stringify({ action: "delete", taskId }),
  });
};

export const moveTodoistTask = async (
  token: string,
  taskId: string,
  projectId: string,
) => {
  const data = await todoistRequest<{ task: TodoistTaskPayload }>("/api/todoist/tasks", token, {
    method: "POST",
    body: JSON.stringify({ action: "move", taskId, projectId }),
  });
  return normalizeTodoistTask(data.task);
};

export const saveTodoistTaskOrder = async (
  token: string,
  taskIds: string[],
) => {
  await todoistRequest<{ ok: true }>("/api/todoist/tasks", token, {
    method: "POST",
    body: JSON.stringify({ action: "reorder", taskIds }),
  });
};

export const updateTodoistTask = async (
  token: string,
  taskId: string,
  input: UpdateTodoistTaskInput,
) => {
  const data = await todoistRequest<{ task: TodoistTaskPayload }>("/api/todoist/tasks", token, {
    method: "POST",
    body: JSON.stringify({ action: "update", taskId, ...input }),
  });
  return normalizeTodoistTask(data.task);
};

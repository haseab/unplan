import type { TodoistProject, TodoistTask } from "./todoist";

export const TODOIST_BUCKET_PROJECT_IDS_STORAGE_KEY = "unplan:todoist-bucket-project-ids:v1";
export const TODOIST_PROJECT_ACTIVE_TASK_LIMIT = 300;
export const TODOIST_BUCKET_PROJECT_BASE_NAME = "unplan-calendar";

const normalizedBucketName = (name: string) => name.trim().toLocaleLowerCase();

export const parseTodoistBucketProjectIds = (value: string | null) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
      : [];
  } catch {
    return [];
  }
};

export const resolveTodoistBucketProjectIds = ({
  preferredProjectId,
  projects,
  storedProjectIds,
}: {
  preferredProjectId: string;
  projects: TodoistProject[];
  storedProjectIds: string[];
}) => {
  const validIds = new Set(projects.map(({ id }) => id));
  const inboxId = projects.find(({ inbox }) => inbox)?.id;
  return Array.from(new Set([
    ...(inboxId ? [inboxId] : []),
    ...storedProjectIds.filter((id) => validIds.has(id)),
    ...(validIds.has(preferredProjectId) ? [preferredProjectId] : []),
  ]));
};

export const todoistProjectActiveTaskCount = (
  tasks: TodoistTask[],
  projectId: string,
) => tasks.filter((task) => task.projectId === projectId && !task.optimistic).length;

export const isTodoistProjectAtCapacity = (
  tasks: TodoistTask[],
  projectId: string,
  pendingCreates = 0,
) => todoistProjectActiveTaskCount(tasks, projectId) + pendingCreates
  >= TODOIST_PROJECT_ACTIVE_TASK_LIMIT;

export const todoistManagedBucketNumber = (name: string) => {
  const normalized = normalizedBucketName(name);
  if (normalized === TODOIST_BUCKET_PROJECT_BASE_NAME) return 1;
  const match = normalized.match(/^unplan-calendar-(\d+)$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value >= 2 ? value : null;
};

export const todoistManagedBucketProjects = (projects: TodoistProject[]) =>
  projects
    .flatMap((project) => {
      const bucketNumber = todoistManagedBucketNumber(project.name);
      return bucketNumber === null ? [] : [{ bucketNumber, project }];
    })
    .sort((left, right) => left.bucketNumber - right.bucketNumber);

export const nextTodoistManagedBucketName = (projects: TodoistProject[]) => {
  const usedNumbers = new Set(
    todoistManagedBucketProjects(projects).map(({ bucketNumber }) => bucketNumber),
  );
  let bucketNumber = 1;
  while (usedNumbers.has(bucketNumber)) bucketNumber += 1;
  return bucketNumber === 1
    ? TODOIST_BUCKET_PROJECT_BASE_NAME
    : `${TODOIST_BUCKET_PROJECT_BASE_NAME}-${bucketNumber}`;
};

export const isTodoistProjectCapacityError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:300|maximum|max).*task|task.*(?:limit|maximum|max|capacity)|too many.*task/i.test(message);
};

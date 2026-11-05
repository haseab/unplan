import type { CalendarSource } from "./calendar-types";
import type { TodoistProject, TodoistTask } from "./todoist";

export const TASK_EXTRACTION_PROJECT_NAME = "task-extraction";
export const TECHNICALITIES_CALENDAR_NAME = "Technicalities";

const normalizedName = (name: string) => name.trim().toLocaleLowerCase();

export const findTaskExtractionProject = (projects: TodoistProject[]) =>
  projects.find(({ name }) =>
    normalizedName(name) === normalizedName(TASK_EXTRACTION_PROJECT_NAME)
  ) ?? null;

export const findTechnicalitiesCalendar = (calendars: CalendarSource[]) =>
  calendars.find(({ name, writable }) =>
    writable !== false
    && normalizedName(name) === normalizedName(TECHNICALITIES_CALENDAR_NAME)
  ) ?? null;

export const resolveTaskExtractionDestination = (
  projects: TodoistProject[],
  extractionProjectId: string,
  preferredProjectId: string,
) => projects.find(({ id }) =>
  id === preferredProjectId && id !== extractionProjectId
) ?? projects.find(({ inbox, id }) => inbox && id !== extractionProjectId)
  ?? projects.find(({ id }) => id !== extractionProjectId)
  ?? null;

export const isExtractedTodoistTask = (task: TodoistTask, extractionProjectId: string | undefined) =>
  !!extractionProjectId && task.projectId === extractionProjectId;

// Present extraction metadata as a compact browser link without changing stored data.
export const extractedTaskDescriptionMarkdown = (description: string) => {
  const match = /^Recording [A-Za-z0-9_-]+ at (\d{4}-\d{2}-\d{2}T[^\s\[]+)/.exec(description);
  if (!match) return description;
  const start = Date.parse(match[1]);
  if (!Number.isFinite(start)) return description;
  const query = `${new Date(start).toISOString()} to ${new Date(start + 60_000).toISOString()}`;
  const href = `https://deeplog.app/pendant?${new URLSearchParams({ q: query })}`;
  return `[View transcript](${href})`;
};

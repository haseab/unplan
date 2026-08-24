import type { CalendarSource } from "./calendar-types";
import type { TodoistProject } from "./todoist";

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

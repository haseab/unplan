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

export const extractedTaskRecordingDate = (description: string): Date | null => {
  const match = /^(?:Recording|Transcript) [A-Za-z0-9_-]+ at (\d{4}-\d{2}-\d{2}T[^\s\[]+)/m.exec(description)
    ?? /^Recorded at (\d{4}-\d{2}-\d{2}T[^\s\[]+)/m.exec(description);
  const timestamp = match ? Date.parse(match[1]) : NaN;
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
};

const taskCreationTime = (task: TodoistTask) => {
  const timestamp = task.createdAt ? Date.parse(task.createdAt) : NaN;
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
};

/** Review source recordings oldest first, independently of import or project order. */
export const orderExtractedTodoistTasks = (tasks: TodoistTask[]) => [...tasks].sort((first, second) => {
  const firstCreated = taskCreationTime(first);
  const secondCreated = taskCreationTime(second);
  const firstRecorded = extractedTaskRecordingDate(first.description)?.getTime() ?? firstCreated;
  const secondRecorded = extractedTaskRecordingDate(second.description)?.getTime() ?? secondCreated;
  return firstRecorded - secondRecorded
    || firstCreated - secondCreated
    || first.id.localeCompare(second.id);
});

type ExtractedTaskDate = { label: "Recorded" | "Created" | "Due"; dateTime: string; text: string };

/** Recording context and actual due dates are distinct; never infer a deadline from recording time. */
export const extractedTaskDates = (task: TodoistTask, timeZone?: string): ExtractedTaskDate[] => {
  const dates: ExtractedTaskDate[] = [];
  const formatTimestamp = (value: string | undefined) => {
    if (!value || !Number.isFinite(Date.parse(value))) return null;
    const date = new Date(value);
    return {
      dateTime: date.toISOString(),
      text: date.toLocaleString(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone,
      }),
    };
  };
  const recording = extractedTaskRecordingDate(task.description);
  const context = formatTimestamp(recording?.toISOString() ?? task.createdAt);
  if (context) dates.push({ label: recording ? "Recorded" : "Created", ...context });

  const due = formatTimestamp(task.due?.datetime);
  if (due) {
    dates.push({ label: "Due", ...due });
  } else if (task.due && /^\d{4}-\d{2}-\d{2}$/.test(task.due.date)) {
    // Format calendar dates in UTC so they cannot shift to the previous day locally.
    const date = new Date(`${task.due.date}T00:00:00Z`);
    if (Number.isFinite(date.getTime()) && date.toISOString().startsWith(task.due.date)) {
      dates.push({
        label: "Due", dateTime: task.due.date,
        text: date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }),
      });
    }
  }
  return dates;
};

export type ExtractedTaskReviewAction = "delete" | "keep" | "skip";

export const extractedTaskReviewAction = (
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat" | "isComposing">,
  editing: boolean,
): ExtractedTaskReviewAction | null => {
  if (editing || event.altKey || event.shiftKey || event.repeat || event.isComposing) return null;
  if (event.metaKey || event.ctrlKey) {
    return event.key === "Backspace" || event.key === "Delete" ? "delete" : null;
  }
  if (event.key === "ArrowLeft") return "skip";
  if (event.key === "ArrowUp") return "delete";
  if (event.key === "ArrowRight") return "keep";
  return null;
};

// Present extraction metadata as a compact browser link without changing stored data.
export const extractedTaskDescriptionMarkdown = (description: string) => {
  const recording = extractedTaskRecordingDate(description);
  if (!recording) return description;
  const start = recording.getTime();
  const query = `${new Date(start).toISOString()} to ${new Date(start + 60_000).toISOString()}`;
  const href = `https://deeplog.app/pendant?${new URLSearchParams({ q: query })}`;
  return `[View transcript](${href})`;
};

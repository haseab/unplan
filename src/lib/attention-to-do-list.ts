import { isRedEvent } from "./attention-event-color";
import { attentionVisibleTasks } from "./attention-triage-counts";
import { calendarEventDetailsFromTodoistContent, todoistGroupAncestors, type TodoistGroupParents } from "./todoist-calendar";
import { todoistTaskUrl, type TodoistProject, type TodoistTask } from "./todoist";

export type ToDoItem = { id: string; title: string; start: string | null; end: string | null; allDay: boolean; url: string | null };
export type ToDoCalendarEvent = {
  id?: string; summary?: string; status?: string; colorId?: string; calendarColor?: string; timeZone?: string;
  start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
  recurrence?: string[]; recurringEventId?: string; htmlLink?: string;
  extendedProperties?: { private?: Record<string, string> };
  attendees?: Array<{ self?: boolean; responseStatus?: string }>;
};

// Google date-only boundaries are midnight in the calendar's zone, not UTC.
function eventTimestamp(value: string, timeZone = "UTC") {
  const target = Date.parse(value);
  if (value.length !== 10 || !Number.isFinite(target)) return target;
  const format = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  let instant = target;
  for (let pass = 0; pass < 3; pass++) {
    const parts = Object.fromEntries(format.formatToParts(instant).map(({ type, value }) => [type, value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const correction = target - represented;
    instant += correction;
    if (!correction) break;
  }
  return instant;
}

/** Rolling seven-day window, including an event already in progress. */
export function calendarToDoItems(events: ToDoCalendarEvent[], now = Date.now()): ToDoItem[] {
  const endWindow = now + 7 * 86400_000;
  return events.flatMap((event): ToDoItem[] => {
    if (!event.id || event.status === "cancelled" || event.recurringEventId || event.recurrence?.length
      || event.attendees?.some((a) => a.self && a.responseStatus === "declined") || isRedEvent(event)) return [];
    const start = event.start?.dateTime ?? event.start?.date;
    const end = event.end?.dateTime ?? event.end?.date;
    if (!start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) throw new Error("Invalid task interval");
    const startAt = eventTimestamp(start, event.timeZone), endAt = eventTimestamp(end, event.timeZone);
    if (endAt <= now || startAt >= endWindow || endAt <= startAt) return [];
    return [{ id: event.id, title: event.summary?.slice(0, 1000) || "Untitled event", start, end,
      allDay: !event.start?.dateTime, url: event.htmlLink?.startsWith("https://") ? event.htmlLink : null }];
  }).sort((a, b) => Date.parse(a.start!) - Date.parse(b.start!) || a.id.localeCompare(b.id));
}

/** Actual current folder membership; review tasks returned to triage are not in Today. */
export function priorityTodayItems(tasks: TodoistTask[], projects: TodoistProject[], parents: TodoistGroupParents, extraBucketIds: string[] = []): ToDoItem[] {
  const { visibleTasks } = attentionVisibleTasks(tasks, projects, extraBucketIds);
  return visibleTasks.flatMap((task): ToDoItem[] => {
    const details = calendarEventDetailsFromTodoistContent(task.content);
    if (!details.group) return [];
    const priority = [details.group, ...todoistGroupAncestors(details.group, parents).reverse()]
      .find((group) => /^priority(?: |$)/i.test(group.split("/").at(-1)?.trim() ?? ""));
    if (priority?.split("/").at(-1)?.trim().toLowerCase() !== "priority today") return [];
    return [{ id: task.id, title: details.title || "Untitled task", start: task.due?.datetime ?? task.due?.date ?? null,
      end: null, allDay: !task.due?.datetime, url: todoistTaskUrl(task.id) }];
  });
}

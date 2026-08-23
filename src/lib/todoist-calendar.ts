import type { CalendarEvent, CalendarSource } from "./calendar-types";

export const isTodoistCalendarName = (name: string | undefined) =>
  name?.trim().toLocaleLowerCase() === "todoist";

export const partitionCalendarEventsForTodoist = (
  events: CalendarEvent[],
  calendars: CalendarSource[],
) => {
  const todoistCalendarIds = new Set(
    calendars
      .filter((calendar) => isTodoistCalendarName(calendar.name))
      .map((calendar) => calendar.id),
  );

  return events.reduce<{
    blocked: CalendarEvent[];
    eligible: CalendarEvent[];
  }>((result, event) => {
    result[todoistCalendarIds.has(event.calendarId) ? "blocked" : "eligible"].push(event);
    return result;
  }, { blocked: [], eligible: [] });
};

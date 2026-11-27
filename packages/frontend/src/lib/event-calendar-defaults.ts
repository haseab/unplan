import type { CalendarSource } from "./calendar-types.js";

export const FUTURE_EVENT_CALENDAR_KEY = "unplan:default-event-calendar";
export const PAST_EVENT_CALENDAR_KEY = "unplan:default-past-event-calendar";

export function resolveEventCalendar(
  calendars: CalendarSource[],
  preferredId: string | null,
): CalendarSource | null {
  return calendars.find((calendar) => calendar.writable !== false && calendar.id === preferredId)
    ?? calendars.find((calendar) => calendar.writable !== false)
    ?? null;
}

export function eventCalendarForStart(
  start: Date,
  past: CalendarSource | null,
  future: CalendarSource | null,
  now = new Date(),
): CalendarSource | null {
  return start.getTime() < now.getTime() ? past : future;
}

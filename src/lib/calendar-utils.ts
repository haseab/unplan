import {
  addDays,
  addMinutes,
  differenceInCalendarDays,
  differenceInMinutes,
  format,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";
import type { CalendarEvent } from "./calendar-types";

export const MINUTES_IN_DAY = 24 * 60;
export const PIXELS_PER_MINUTE = 1;
export const GRID_HEIGHT = MINUTES_IN_DAY * PIXELS_PER_MINUTE;
export const SNAP_MINUTES = 15;

export const startOfCalendarWeek = (date: Date) =>
  startOfWeek(date, { weekStartsOn: 1 });

export const getWeekDays = (weekStart: Date) =>
  Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

export const minutesFromStartOfDay = (date: Date) =>
  date.getHours() * 60 + date.getMinutes();

export const snapMinutes = (minutes: number) =>
  Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const formatEventTime = (event: CalendarEvent) => {
  if (event.allDay) return "All day";
  return `${format(parseISO(event.start), "h:mm")}–${format(
    parseISO(event.end),
    "h:mm a",
  )}`;
};

export const eventGeometry = (event: CalendarEvent, weekStart: Date) => {
  const start = parseISO(event.start);
  const end = parseISO(event.end);
  const dayIndex = differenceInCalendarDays(startOfDay(start), weekStart);
  const top = minutesFromStartOfDay(start) * PIXELS_PER_MINUTE;
  const height = Math.max(
    differenceInMinutes(end, start) * PIXELS_PER_MINUTE,
    24,
  );
  return { dayIndex, top, height };
};

export const moveEvent = (
  event: CalendarEvent,
  dayDelta: number,
  minuteDelta: number,
) => ({
  ...event,
  start: addMinutes(addDays(parseISO(event.start), dayDelta), minuteDelta).toISOString(),
  end: addMinutes(addDays(parseISO(event.end), dayDelta), minuteDelta).toISOString(),
});

export const weekLabel = (weekStart: Date) => {
  const end = addDays(weekStart, 6);
  return weekStart.getMonth() === end.getMonth()
    ? `${format(weekStart, "MMMM d")} – ${format(end, "d, yyyy")}`
    : `${format(weekStart, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
};

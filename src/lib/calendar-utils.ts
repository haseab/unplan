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

export const getWeekDays = (weekStart: Date, dayCount = 7) =>
  Array.from({ length: dayCount }, (_, index) => addDays(weekStart, index));

export const minutesFromStartOfDay = (date: Date) =>
  date.getHours() * 60 + date.getMinutes();

export const snapMinutes = (minutes: number) =>
  Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const formatTimeRange = (start: Date, end: Date) =>
  `${format(start, "h:mm")}–${format(end, "h:mm a")}`;

export const formatEventTime = (event: CalendarEvent) => {
  if (event.allDay) return "All day";
  return formatTimeRange(parseISO(event.start), parseISO(event.end));
};

export const formatEventStartTime = (event: CalendarEvent) => {
  if (event.allDay) return "All day";
  return format(parseISO(event.start), "h:mm");
};

export const eventGeometry = (
  event: CalendarEvent,
  weekStart: Date,
  pixelsPerMinute = PIXELS_PER_MINUTE,
) => {
  const start = parseISO(event.start);
  const end = parseISO(event.end);
  const dayIndex = differenceInCalendarDays(startOfDay(start), weekStart);
  const top = minutesFromStartOfDay(start) * pixelsPerMinute;
  const height = Math.max(
    differenceInMinutes(end, start) * pixelsPerMinute,
    SNAP_MINUTES * pixelsPerMinute,
  );
  return { dayIndex, top, height };
};

export type EventSegmentGeometry = {
  dayIndex: number;
  endMinute: number;
  height: number;
  isEnd: boolean;
  isStart: boolean;
  top: number;
};

export const eventSegmentGeometries = (
  event: CalendarEvent,
  renderStart: Date,
  renderedDayCount: number,
  pixelsPerMinute = PIXELS_PER_MINUTE,
): EventSegmentGeometry[] => {
  const eventStart = parseISO(event.start);
  const eventEnd = parseISO(event.end);
  if (eventEnd.getTime() <= eventStart.getTime()) return [];

  const visibleStart = startOfDay(renderStart);
  const visibleEnd = addDays(visibleStart, renderedDayCount);
  let dayStart = startOfDay(eventStart);
  if (dayStart.getTime() < visibleStart.getTime()) dayStart = visibleStart;

  const segments: EventSegmentGeometry[] = [];
  while (
    dayStart.getTime() < visibleEnd.getTime() &&
    dayStart.getTime() < eventEnd.getTime()
  ) {
    const nextDay = addDays(dayStart, 1);
    const segmentStart = eventStart.getTime() > dayStart.getTime()
      ? eventStart
      : dayStart;
    const segmentEnd = eventEnd.getTime() < nextDay.getTime()
      ? eventEnd
      : nextDay;
    const top = minutesFromStartOfDay(segmentStart) * pixelsPerMinute;
    const bottom = segmentEnd.getTime() === nextDay.getTime()
      ? MINUTES_IN_DAY * pixelsPerMinute
      : minutesFromStartOfDay(segmentEnd) * pixelsPerMinute;

    segments.push({
      dayIndex: differenceInCalendarDays(dayStart, visibleStart),
      endMinute: bottom / pixelsPerMinute,
      height: Math.max(bottom - top, SNAP_MINUTES * pixelsPerMinute),
      isEnd: segmentEnd.getTime() === eventEnd.getTime(),
      isStart: segmentStart.getTime() === eventStart.getTime(),
      top,
    });
    dayStart = nextDay;
  }

  return segments;
};

export const eventSegmentKey = (
  event: Pick<CalendarEvent, "calendarId" | "id">,
  renderStart: Date,
  dayIndex: number,
) => `${event.calendarId}-${event.id}-${format(
  addDays(startOfDay(renderStart), dayIndex),
  "yyyy-MM-dd",
)}`;

export const moveEvent = (
  event: CalendarEvent,
  dayDelta: number,
  minuteDelta: number,
) => ({
  ...event,
  start: addMinutes(addDays(parseISO(event.start), dayDelta), minuteDelta).toISOString(),
  end: addMinutes(addDays(parseISO(event.end), dayDelta), minuteDelta).toISOString(),
});

export const resizeEvent = (
  event: CalendarEvent,
  edge: "start" | "end",
  requestedDelta: number,
) => {
  if (requestedDelta === 0) return event;

  const start = parseISO(event.start);
  const end = parseISO(event.end);
  const movingBoundary = edge === "start" ? start : end;
  const stationaryBoundary = edge === "start" ? end : start;
  const movingMinute = minutesFromStartOfDay(movingBoundary);
  const delta = clamp(
    requestedDelta,
    -movingMinute,
    MINUTES_IN_DAY - movingMinute,
  );
  let movedBoundary = addMinutes(movingBoundary, delta);
  const minimumDuration = SNAP_MINUTES * 60 * 1000;
  const distance = movedBoundary.getTime() - stationaryBoundary.getTime();

  if (Math.abs(distance) < minimumDuration) {
    const direction = distance === 0
      ? edge === "start" ? -1 : 1
      : Math.sign(distance);
    movedBoundary = new Date(
      stationaryBoundary.getTime() + direction * minimumDuration,
    );
  }

  const resizedStart = movedBoundary.getTime() < stationaryBoundary.getTime()
    ? movedBoundary
    : stationaryBoundary;
  const resizedEnd = movedBoundary.getTime() < stationaryBoundary.getTime()
    ? stationaryBoundary
    : movedBoundary;

  return {
    ...event,
    start: resizedStart.toISOString(),
    end: resizedEnd.toISOString(),
  };
};

export const eventTimesMatch = (
  first: Pick<CalendarEvent, "start" | "end">,
  second: Pick<CalendarEvent, "start" | "end">,
) => parseISO(first.start).getTime() === parseISO(second.start).getTime()
  && parseISO(first.end).getTime() === parseISO(second.end).getTime();

export const weekLabel = (weekStart: Date, dayCount = 7) => {
  if (dayCount === 1) return format(weekStart, "EEEE, MMMM d, yyyy");
  const end = addDays(weekStart, dayCount - 1);
  return weekStart.getMonth() === end.getMonth()
    ? `${format(weekStart, "MMMM d")} – ${format(end, "d, yyyy")}`
    : `${format(weekStart, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
};

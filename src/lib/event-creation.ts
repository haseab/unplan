import { addMinutes, differenceInMinutes, isSameDay, startOfDay } from "date-fns";
import type { CalendarEvent } from "./calendar-types";
import { MINUTES_IN_DAY, SNAP_MINUTES, clamp, snapMinutes } from "./calendar-utils";

export type EventCreationRange = {
  dayIndex: number;
  endMinute: number;
  startMinute: number;
};

export type EventCreationSession = {
  anchorMinute: number;
  calendarId: string;
  dayIndex: number;
};

export type AdjacentEventCreationEdge = "after" | "before";

export const adjacentEventCreationDates = (
  event: Pick<CalendarEvent, "end" | "start">,
  edge: AdjacentEventCreationEdge,
  durationMinutes = 15,
) => {
  const anchor = new Date(edge === "after" ? event.end : event.start);
  return edge === "after"
    ? { start: anchor, end: addMinutes(anchor, durationMinutes) }
    : { start: addMinutes(anchor, -durationMinutes), end: anchor };
};

export const eventCreationRangeFromDates = (
  start: Date,
  end: Date,
  renderedDays: Date[],
): EventCreationRange | null => {
  const dayIndex = renderedDays.findIndex((day) => isSameDay(day, start));
  if (dayIndex < 0) return null;

  const day = startOfDay(start);
  const startMinute = differenceInMinutes(start, day);
  const endMinute = differenceInMinutes(end, day);
  if (startMinute < 0 || endMinute <= startMinute || endMinute > MINUTES_IN_DAY) {
    return null;
  }

  return { dayIndex, endMinute, startMinute };
};

export const eventCreationAnchorRange = (
  dayIndex: number,
  minute: number,
): EventCreationRange => ({
  dayIndex,
  endMinute: minute,
  startMinute: minute,
});

export const isEventCreationAnchor = (range: EventCreationRange) =>
  range.startMinute === range.endMinute;

export const hasEventCreationDuration = (
  verticalDragPixels: number,
  pixelsPerMinute: number,
) => Math.abs(verticalDragPixels) >= SNAP_MINUTES * pixelsPerMinute;

export const eventCreationPoint = (
  x: number,
  y: number,
  gridWidth: number,
  renderedDayCount: number,
) => ({
  dayIndex: clamp(
    Math.floor(x / (gridWidth / renderedDayCount)),
    0,
    renderedDayCount - 1,
  ),
  minute: clamp(snapMinutes(y), 0, MINUTES_IN_DAY - SNAP_MINUTES),
});

export const eventCreationRange = (
  session: EventCreationSession,
  currentY: number,
): EventCreationRange => {
  const currentMinute = clamp(
    snapMinutes(currentY),
    0,
    MINUTES_IN_DAY,
  );
  const startMinute = Math.min(session.anchorMinute, currentMinute);
  const endMinute = Math.min(
    Math.max(session.anchorMinute, currentMinute, startMinute + SNAP_MINUTES),
    MINUTES_IN_DAY,
  );

  return { dayIndex: session.dayIndex, endMinute, startMinute };
};

export const eventCreationDates = (
  range: EventCreationRange,
  renderedDays: Date[],
) => {
  const day = startOfDay(renderedDays[range.dayIndex]);
  return {
    end: addMinutes(day, range.endMinute),
    start: addMinutes(day, range.startMinute),
  };
};

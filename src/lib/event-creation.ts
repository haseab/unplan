import { addMinutes, startOfDay } from "date-fns";
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

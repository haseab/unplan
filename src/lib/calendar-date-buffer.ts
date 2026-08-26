import { addDays } from "date-fns";

export type CalendarDateBuffer = {
  dayCount: number;
  periodDayCount: number;
  start: Date;
};

export type CalendarDateBufferAdjustment = {
  buffer: CalendarDateBuffer;
  prependedDayCount: number;
  removedBeforeDayCount: number;
};

const INITIAL_PERIOD_COUNT = 3;
const TRIM_HIDDEN_PERIOD_COUNT = 2;

export const createCalendarDateBuffer = (
  visibleStart: Date,
  periodDayCount: number,
): CalendarDateBuffer => ({
  dayCount: periodDayCount * INITIAL_PERIOD_COUNT,
  periodDayCount,
  start: addDays(visibleStart, -periodDayCount),
});

export const adjustCalendarDateBuffer = (
  buffer: CalendarDateBuffer,
  visibleStartOffsetDays: number,
): CalendarDateBufferAdjustment => {
  const periodDayCount = buffer.periodDayCount;
  let dayCount = buffer.dayCount;
  let start = buffer.start;
  let adjustedVisibleStartOffsetDays = visibleStartOffsetDays;
  let prependedDayCount = 0;
  let removedBeforeDayCount = 0;

  const hiddenBefore = adjustedVisibleStartOffsetDays;
  const hiddenAfter = dayCount
    - adjustedVisibleStartOffsetDays
    - periodDayCount;

  if (hiddenBefore < periodDayCount) {
    start = addDays(start, -periodDayCount);
    dayCount += periodDayCount;
    adjustedVisibleStartOffsetDays += periodDayCount;
    prependedDayCount += periodDayCount;
  }
  if (hiddenAfter < periodDayCount) {
    dayCount += periodDayCount;
  }

  const expandedHiddenBefore = adjustedVisibleStartOffsetDays;
  const expandedHiddenAfter = dayCount
    - adjustedVisibleStartOffsetDays
    - periodDayCount;
  const trimThreshold = periodDayCount * TRIM_HIDDEN_PERIOD_COUNT;

  if (expandedHiddenBefore > trimThreshold) {
    start = addDays(start, periodDayCount);
    dayCount -= periodDayCount;
    removedBeforeDayCount += periodDayCount;
  }
  if (expandedHiddenAfter > trimThreshold) {
    dayCount -= periodDayCount;
  }

  return {
    buffer: { dayCount, periodDayCount, start },
    prependedDayCount,
    removedBeforeDayCount,
  };
};

export const calendarDateBuffersEqual = (
  first: CalendarDateBuffer,
  second: CalendarDateBuffer,
) => first.dayCount === second.dayCount
  && first.periodDayCount === second.periodDayCount
  && first.start.getTime() === second.start.getTime();

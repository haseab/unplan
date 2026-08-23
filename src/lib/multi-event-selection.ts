import { differenceInMinutes, parseISO } from "date-fns";
import type { CalendarEvent } from "./calendar-types";

export type MultiEventSelectionSummary = {
  allDayCount: number;
  calendarCount: number;
  earliestStart: Date;
  latestEnd: Date;
  totalMinutes: number;
};

export const multiEventSelectionSummary = (
  events: CalendarEvent[],
): MultiEventSelectionSummary | null => {
  if (!events.length) return null;
  const starts = events.map((event) => parseISO(event.start));
  const ends = events.map((event) => parseISO(event.end));
  return {
    allDayCount: events.filter((event) => event.allDay).length,
    calendarCount: new Set(events.map((event) => event.calendarId)).size,
    earliestStart: new Date(Math.min(...starts.map((date) => date.getTime()))),
    latestEnd: new Date(Math.max(...ends.map((date) => date.getTime()))),
    totalMinutes: events.reduce((total, event) => total + Math.max(
      differenceInMinutes(parseISO(event.end), parseISO(event.start)),
      0,
    ), 0),
  };
};

export const sharedSelectionValue = <Value,>(values: Value[]) =>
  values.length > 0 && values.every((value) => value === values[0])
    ? values[0]
    : null;

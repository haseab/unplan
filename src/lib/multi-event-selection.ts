import { differenceInMinutes, parseISO } from "date-fns";
import type { CalendarEvent, CalendarSource } from "./calendar-types";

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

const calendarAccountKey = (calendar: CalendarSource) =>
  calendar.accountId ?? `local:${calendar.provider}`;

export const calendarsForEventSelection = (
  events: CalendarEvent[],
  calendarSources: CalendarSource[],
  writableCalendars: CalendarSource[],
) => {
  const sourceCalendars = events.flatMap((event) => {
    const calendar = calendarSources.find((item) => item.id === event.calendarId);
    return calendar ? [calendar] : [];
  });
  if (sourceCalendars.length !== events.length) return [];
  const accountKeys = new Set(sourceCalendars.map(calendarAccountKey));
  if (accountKeys.size !== 1) return [];
  const [accountKey] = accountKeys;
  return writableCalendars.filter(
    (calendar) => calendarAccountKey(calendar) === accountKey,
  );
};

export const moveSelectionToCalendar = (
  events: CalendarEvent[],
  calendar: CalendarSource,
) => events.map((event) => ({
  ...event,
  calendarId: calendar.id,
  calendarColor: calendar.backgroundColor,
  color: event.colorId ? event.color : calendar.backgroundColor,
  textColor: event.colorId ? event.textColor : calendar.foregroundColor,
}));

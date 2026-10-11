import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import type { CalendarEvent } from "./calendar-types";

export const setEventEndDay = (event: Pick<CalendarEvent, "start" | "end">, day: Date) => {
  const end = new Date(event.end);
  const next = startOfDay(day);
  next.setHours(end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds());
  return next > new Date(event.start) ? { end: next.toISOString() } : null;
};

export const moveEventToDay = (event: Pick<CalendarEvent, "start" | "end" | "allDay">, day: Date) => {
  const originalStart = new Date(event.start);
  const originalEnd = new Date(event.end);
  const start = startOfDay(day);
  if (event.allDay) {
    const days = Math.max(1, differenceInCalendarDays(originalEnd, originalStart));
    return { start: start.toISOString(), end: addDays(start, days).toISOString() };
  }
  start.setHours(originalStart.getHours(), originalStart.getMinutes(), originalStart.getSeconds(), originalStart.getMilliseconds());
  return { start: start.toISOString(), end: new Date(+start + (+originalEnd - +originalStart)).toISOString() };
};

export const changeEventClockTime = (event: Pick<CalendarEvent, "start" | "end">, field: "start" | "end", value: string) => {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (hours > 23 || minutes > 59) return null;
  const start = new Date(event.start), end = new Date(event.end);
  const next = new Date(event[field]);
  next.setHours(hours, minutes, 0, 0);
  if (field === "start") return { start: next.toISOString(), end: new Date(+next + (+end - +start)).toISOString() };
  const nextEnd = next <= start ? addDays(next, 1) : next;
  return { start: start.toISOString(), end: nextEnd.toISOString() };
};

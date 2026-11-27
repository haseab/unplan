import { parseISO } from "date-fns";
import type { CalendarEvent } from "./calendar-types.js";

export const isEventPast = (event: CalendarEvent, now: Date) =>
  parseISO(event.end).getTime() < now.getTime();

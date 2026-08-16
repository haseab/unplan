import { parseISO } from "date-fns";
import type { CalendarEvent } from "@/lib/calendar-types";

export const isEventPast = (event: CalendarEvent, now: Date) =>
  parseISO(event.end).getTime() < now.getTime();

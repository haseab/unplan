import type { CalendarSource } from "./calendar-types";

export const CATEGORY_CALENDAR_COLORS: Record<string, string> = {
  social: "#f773c0",
  project: "#b67aff",
  projects: "#b67aff",
  work: "#9430f8",
};

export const withCalendarDisplayColor = (calendar: CalendarSource): CalendarSource => {
  const color = CATEGORY_CALENDAR_COLORS[calendar.name.trim().toLowerCase()];
  return color ? { ...calendar, backgroundColor: color } : calendar;
};

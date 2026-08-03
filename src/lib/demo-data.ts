import { addDays, setHours, setMinutes } from "date-fns";
import type { CalendarEvent, CalendarSource } from "./calendar-types";
import { startOfCalendarWeek } from "./calendar-utils";

export const demoCalendars: CalendarSource[] = [
  {
    id: "demo-deep-work",
    name: "Deep work",
    backgroundColor: "#4666e5",
    foregroundColor: "#ffffff",
    primary: true,
    writable: true,
    provider: "demo",
  },
  {
    id: "demo-personal",
    name: "Personal",
    backgroundColor: "#c35f94",
    foregroundColor: "#ffffff",
    writable: true,
    provider: "demo",
  },
  {
    id: "demo-reminders",
    name: "Reminders",
    backgroundColor: "#d18a31",
    foregroundColor: "#ffffff",
    writable: true,
    provider: "demo",
  },
];

const at = (weekStart: Date, day: number, hour: number, minute = 0) =>
  setMinutes(setHours(addDays(weekStart, day), hour), minute).toISOString();

export const makeDemoEvents = (anchor = new Date()): CalendarEvent[] => {
  const week = startOfCalendarWeek(anchor);
  return [
    {
      id: "demo-1",
      calendarId: "demo-deep-work",
      title: "Weekly reset",
      start: at(week, 0, 9),
      end: at(week, 0, 10),
      color: "#4666e5",
      provider: "demo",
    },
    {
      id: "demo-2",
      calendarId: "demo-deep-work",
      title: "Product direction",
      start: at(week, 1, 10, 30),
      end: at(week, 1, 12),
      color: "#4666e5",
      provider: "demo",
    },
    {
      id: "demo-3",
      calendarId: "demo-personal",
      title: "Lunch with Maya",
      start: at(week, 1, 13),
      end: at(week, 1, 14),
      color: "#c35f94",
      location: "The Mill",
      provider: "demo",
    },
    {
      id: "demo-4",
      calendarId: "demo-deep-work",
      title: "Build calendar interactions",
      start: at(week, 2, 9, 30),
      end: at(week, 2, 12),
      color: "#4666e5",
      provider: "demo",
    },
    {
      id: "demo-5",
      calendarId: "demo-reminders",
      title: "Send project update",
      start: at(week, 2, 15),
      end: at(week, 2, 15, 45),
      color: "#d18a31",
      provider: "demo",
    },
    {
      id: "demo-6",
      calendarId: "demo-personal",
      title: "Run along the Embarcadero",
      start: at(week, 3, 17, 30),
      end: at(week, 3, 18, 30),
      color: "#c35f94",
      provider: "demo",
    },
    {
      id: "demo-7",
      calendarId: "demo-deep-work",
      title: "Quiet launch review",
      start: at(week, 4, 11),
      end: at(week, 4, 12),
      color: "#4666e5",
      provider: "demo",
    },
  ];
};

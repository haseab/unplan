import test from "node:test";
import assert from "node:assert/strict";
import type { CalendarEvent, CalendarSource } from "./calendar-types";
import {
  isTodoistCalendarName,
  partitionCalendarEventsForTodoist,
} from "./todoist-calendar";

const calendar = (id: string, name: string): CalendarSource => ({
  id,
  name,
  backgroundColor: "#000",
  foregroundColor: "#fff",
  provider: "demo",
});

const event = (id: string, calendarId: string): CalendarEvent => ({
  id,
  calendarId,
  title: id,
  start: "2026-08-22T09:00:00.000Z",
  end: "2026-08-22T10:00:00.000Z",
  calendarColor: "#000",
  color: "#000",
  provider: "demo",
});

test("recognizes the Todoist calendar name without case or surrounding whitespace", () => {
  assert.equal(isTodoistCalendarName("Todoist"), true);
  assert.equal(isTodoistCalendarName(" todoist "), true);
  assert.equal(isTodoistCalendarName("Todo list"), false);
});

test("separates Todoist calendar events from eligible task candidates", () => {
  const todoistEvent = event("todoist-event", "todoist-calendar");
  const workEvent = event("work-event", "work-calendar");

  assert.deepEqual(
    partitionCalendarEventsForTodoist(
      [todoistEvent, workEvent],
      [calendar("todoist-calendar", "Todoist"), calendar("work-calendar", "Work")],
    ),
    { blocked: [todoistEvent], eligible: [workEvent] },
  );
});

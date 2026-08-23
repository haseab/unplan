import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent } from "./calendar-types";
import {
  buildEventDeletionPlan,
  trimRecurrenceBefore,
} from "./recurring-delete";

const event = (id: string, start: string): CalendarEvent => ({
  calendarColor: "#000",
  calendarId: "calendar",
  color: "#000",
  end: start,
  id,
  originalStart: start,
  provider: "google",
  recurringEventId: "series",
  start,
  title: id,
});

test("following deletion removes loaded occurrences at and after the cutoff", () => {
  const events = [
    event("one", "2026-08-01T10:00:00Z"),
    event("two", "2026-08-08T10:00:00Z"),
    event("three", "2026-08-15T10:00:00Z"),
  ];
  const plan = buildEventDeletionPlan(events, [events[1]], "following");
  assert.deepEqual([...plan.removedIds], ["two", "three"]);
  assert.equal(plan.operations.length, 1);
});

test("single deletion removes only the selected recurring occurrence", () => {
  const events = [
    event("one", "2026-08-01T10:00:00Z"),
    event("two", "2026-08-08T10:00:00Z"),
    event("three", "2026-08-15T10:00:00Z"),
  ];
  const plan = buildEventDeletionPlan(events, [events[1]], "single");

  assert.deepEqual([...plan.removedIds], ["two"]);
  assert.deepEqual(plan.operations[0].affectedIds, ["two"]);
});

test("timed recurrence is trimmed one second before the target", () => {
  assert.deepEqual(
    trimRecurrenceBefore(
      ["RRULE:FREQ=WEEKLY;COUNT=10;BYDAY=SA"],
      "2026-08-22T10:00:00-07:00",
    ),
    ["RRULE:FREQ=WEEKLY;BYDAY=SA;UNTIL=20260822T165959Z"],
  );
});

test("all-day recurrence ends on the previous date", () => {
  assert.deepEqual(
    trimRecurrenceBefore(["RRULE:FREQ=DAILY"], "2026-08-22"),
    ["RRULE:FREQ=DAILY;UNTIL=20260821"],
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent } from "./calendar-types";
import {
  intersectsCalendarViewport,
  searchVisibleEvents,
} from "./visible-event-search";

const event = (
  id: string,
  title: string,
  start: string,
  end: string,
  details: Partial<CalendarEvent> = {},
): CalendarEvent => ({
  calendarColor: "#000",
  calendarId: "calendar",
  color: "#000",
  end,
  id,
  provider: "demo",
  start,
  title,
  ...details,
});

test("finds partial keywords and orders matches chronologically", () => {
  const events = [
    event("later", "Review launch plan", "2026-08-31T15:00:00.000Z", "2026-08-31T16:00:00.000Z"),
    event("first", "Launch review", "2026-08-30T15:00:00.000Z", "2026-08-30T16:00:00.000Z"),
    event("miss", "Team lunch", "2026-08-30T12:00:00.000Z", "2026-08-30T13:00:00.000Z"),
  ];

  assert.deepEqual(
    searchVisibleEvents(events, "lau rev").map(({ id }) => id),
    ["first", "later"],
  );
});

test("includes visible locations but not hidden descriptions in matching", () => {
  const events = [
    event("location", "Weekly sync", "2026-08-30T15:00:00.000Z", "2026-08-30T16:00:00.000Z", {
      location: "Founders room",
    }),
    event("description", "Weekly sync", "2026-08-30T17:00:00.000Z", "2026-08-30T18:00:00.000Z", {
      description: "Founders room",
    }),
  ];

  assert.deepEqual(
    searchVisibleEvents(events, "found room").map(({ id }) => id),
    ["location"],
  );
});

test("includes partially visible events and excludes vertically clipped events", () => {
  const viewport = { bottom: 700, left: 200, right: 1_100, top: 100 };

  assert.equal(
    intersectsCalendarViewport(
      { bottom: 130, left: 300, right: 500, top: 80 },
      viewport,
      120,
    ),
    true,
  );
  assert.equal(
    intersectsCalendarViewport(
      { bottom: 119, left: 300, right: 500, top: 80 },
      viewport,
      120,
    ),
    false,
  );
  assert.equal(
    intersectsCalendarViewport(
      { bottom: 760, left: 300, right: 500, top: 700 },
      viewport,
      120,
    ),
    false,
  );
});

test("excludes events outside the horizontal viewport", () => {
  const viewport = { bottom: 700, left: 200, right: 1_100, top: 100 };

  assert.equal(
    intersectsCalendarViewport(
      { bottom: 300, left: 1_100, right: 1_250, top: 200 },
      viewport,
    ),
    false,
  );
});

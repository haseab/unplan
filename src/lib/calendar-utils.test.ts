import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent } from "./calendar-types";
import {
  eventGeometry,
  eventSegmentGeometries,
  eventTimesMatch,
  resizeEvent,
} from "./calendar-utils";

const originalStart = new Date(2026, 7, 22, 10);
const originalEnd = new Date(2026, 7, 22, 11);
const event: CalendarEvent = {
  id: "event",
  calendarId: "calendar",
  title: "Planning",
  start: originalStart.toISOString(),
  end: originalEnd.toISOString(),
  calendarColor: "#000000",
  color: "#000000",
  provider: "demo",
};

test("dragging the start past the end flips the resized interval", () => {
  const resized = resizeEvent(event, "start", 90);

  assert.equal(resized.start, originalEnd.toISOString());
  assert.equal(
    resized.end,
    new Date(originalStart.getTime() + 90 * 60 * 1000).toISOString(),
  );
});

test("dragging the end past the start flips the resized interval", () => {
  const resized = resizeEvent(event, "end", -90);

  assert.equal(
    resized.start,
    new Date(originalEnd.getTime() - 90 * 60 * 1000).toISOString(),
  );
  assert.equal(resized.end, originalStart.toISOString());
});

test("a resize maintains the minimum duration at the crossover point", () => {
  assert.deepEqual(
    resizeEvent(event, "start", 60),
    {
      ...event,
      start: new Date(originalEnd.getTime() - 15 * 60 * 1000).toISOString(),
      end: originalEnd.toISOString(),
    },
  );
});

test("a zero-delta resize preserves provider timestamps exactly", () => {
  const googleEvent = {
    ...event,
    start: "2026-08-22T10:00:00-07:00",
    end: "2026-08-22T11:00:00-07:00",
    provider: "google" as const,
  };

  assert.strictEqual(resizeEvent(googleEvent, "start", 0), googleEvent);
});

test("equivalent timestamp formats do not count as changed event times", () => {
  assert.equal(
    eventTimesMatch(
      {
        start: "2026-08-22T10:00:00-07:00",
        end: "2026-08-22T11:00:00-07:00",
      },
      {
        start: "2026-08-22T17:00:00.000Z",
        end: "2026-08-22T18:00:00.000Z",
      },
    ),
    true,
  );
});

test("event geometry follows the selected calendar time scale", () => {
  const renderStart = new Date(2026, 7, 22);

  assert.deepEqual(eventGeometry(event, renderStart, 0.5), {
    dayIndex: 0,
    top: 300,
    height: 30,
  });
  assert.deepEqual(
    eventSegmentGeometries(event, renderStart, 1, 2).map((segment) => ({
      endMinute: segment.endMinute,
      height: segment.height,
      top: segment.top,
    })),
    [{ endMinute: 660, height: 120, top: 1200 }],
  );
});

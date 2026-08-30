import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent } from "./calendar-types";
import {
  eventGeometry,
  eventSegmentGeometries,
  eventSegmentKey,
  eventTimesMatch,
  fillEventGap,
  formatEventStartTime,
  formatTimeRange,
  latestQuarterHour,
  moveEventToStart,
  resizeEvent,
  resizeEventEnd,
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

test("compact event card time shows only the start time without meridiem", () => {
  assert.equal(formatEventStartTime(event), "10:00");
  assert.equal(formatEventStartTime({ ...event, allDay: true }), "All day");
});

test("time ranges use the calendar event label format", () => {
  assert.equal(formatTimeRange(originalStart, originalEnd), "10:00–11:00 AM");
});

test("the latest quarter-hour floors the present time", () => {
  const present = new Date(2026, 7, 22, 10, 14, 59, 999);

  assert.deepEqual(latestQuarterHour(present), new Date(2026, 7, 22, 10));
  assert.deepEqual(
    latestQuarterHour(new Date(2026, 7, 22, 10, 45)),
    new Date(2026, 7, 22, 10, 45),
  );
  assert.equal(present.getMinutes(), 14);
});

test("moving an event to a requested start preserves its duration", () => {
  const requestedStart = new Date(2026, 7, 23, 14, 15);

  assert.deepEqual(moveEventToStart(event, requestedStart), {
    ...event,
    start: requestedStart.toISOString(),
    end: new Date(2026, 7, 23, 15, 15).toISOString(),
  });
});

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

test("keyboard end resizing keeps the start fixed and enforces the minimum duration", () => {
  assert.deepEqual(resizeEventEnd(event, -15), {
    ...event,
    end: new Date(originalEnd.getTime() - 15 * 60 * 1000).toISOString(),
  });
  assert.deepEqual(resizeEventEnd(event, 15), {
    ...event,
    end: new Date(originalEnd.getTime() + 15 * 60 * 1000).toISOString(),
  });
  assert.deepEqual(resizeEventEnd(event, -90), {
    ...event,
    end: new Date(originalStart.getTime() + 15 * 60 * 1000).toISOString(),
  });
});

test("fills the gap to the nearest timed event on the same day", () => {
  const selected = {
    ...event,
    start: new Date(2026, 7, 22, 11).toISOString(),
    end: new Date(2026, 7, 22, 12).toISOString(),
  };
  const candidates: CalendarEvent[] = [
    {
      ...event,
      id: "earlier",
      start: new Date(2026, 7, 22, 9).toISOString(),
      end: new Date(2026, 7, 22, 10).toISOString(),
    },
    {
      ...event,
      id: "next",
      start: new Date(2026, 7, 22, 13, 30).toISOString(),
      end: new Date(2026, 7, 22, 14).toISOString(),
    },
  ];

  assert.deepEqual(fillEventGap(selected, candidates, "up"), {
    ...selected,
    start: new Date(2026, 7, 22, 10).toISOString(),
  });
  assert.deepEqual(fillEventGap(selected, candidates, "down"), {
    ...selected,
    end: new Date(2026, 7, 22, 13, 30).toISOString(),
  });
});

test("gap filling ignores all-day, overlapping, and cross-day events", () => {
  const selected = {
    ...event,
    start: new Date(2026, 7, 22, 11).toISOString(),
    end: new Date(2026, 7, 22, 12).toISOString(),
  };
  const candidates: CalendarEvent[] = [
    {
      ...event,
      allDay: true,
      id: "all-day",
      start: new Date(2026, 7, 22).toISOString(),
      end: new Date(2026, 7, 23).toISOString(),
    },
    {
      ...event,
      id: "overlap",
      start: new Date(2026, 7, 22, 11, 30).toISOString(),
      end: new Date(2026, 7, 22, 12, 30).toISOString(),
    },
    {
      ...event,
      id: "tomorrow",
      start: new Date(2026, 7, 23, 9).toISOString(),
      end: new Date(2026, 7, 23, 10).toISOString(),
    },
  ];

  assert.equal(fillEventGap(selected, candidates, "up"), null);
  assert.equal(fillEventGap(selected, candidates, "down"), null);
});

test("touching events block gap filling instead of falling through to farther events", () => {
  const selected = {
    ...event,
    start: new Date(2026, 7, 22, 11).toISOString(),
    end: new Date(2026, 7, 22, 12).toISOString(),
  };
  const candidates: CalendarEvent[] = [
    {
      ...event,
      id: "farther-above",
      start: new Date(2026, 7, 22, 8).toISOString(),
      end: new Date(2026, 7, 22, 9).toISOString(),
    },
    {
      ...event,
      id: "touching-above",
      start: new Date(2026, 7, 22, 10).toISOString(),
      end: selected.start,
    },
    {
      ...event,
      id: "touching-below",
      start: selected.end,
      end: new Date(2026, 7, 22, 13).toISOString(),
    },
    {
      ...event,
      id: "farther-below",
      start: new Date(2026, 7, 22, 14).toISOString(),
      end: new Date(2026, 7, 22, 15).toISOString(),
    },
  ];

  assert.equal(fillEventGap(selected, candidates, "up"), null);
  assert.equal(fillEventGap(selected, candidates, "down"), null);
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

test("event segment identity stays stable when the rendered range shifts", () => {
  assert.equal(
    eventSegmentKey(event, new Date(2026, 7, 17), 5),
    eventSegmentKey(event, new Date(2026, 7, 18), 4),
  );
});

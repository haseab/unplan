import assert from "node:assert/strict";
import test from "node:test";
import {
  includeCalendarEventLoadRange,
  planCalendarEventLoad,
} from "./calendar-event-load-range";

const coverage = { end: 30, key: "calendars", start: 10 };

test("loads the full target when no compatible coverage exists", () => {
  assert.deepEqual(planCalendarEventLoad(
    "calendars",
    { end: 30, start: 10 },
    null,
  ), {
    mode: "replace",
    range: { end: 30, start: 10 },
  });
});

test("loads only newly exposed trailing and leading ranges", () => {
  assert.deepEqual(planCalendarEventLoad(
    "calendars",
    { end: 40, start: 10 },
    coverage,
  ), {
    mode: "merge",
    range: { end: 40, start: 30 },
  });
  assert.deepEqual(planCalendarEventLoad(
    "calendars",
    { end: 30, start: 0 },
    coverage,
  ), {
    mode: "merge",
    range: { end: 10, start: 0 },
  });
});

test("does not reload a range already covered", () => {
  assert.equal(planCalendarEventLoad(
    "calendars",
    { end: 25, start: 15 },
    coverage,
  ), null);
});

test("forces a full replacement for reconciliation refreshes", () => {
  assert.deepEqual(planCalendarEventLoad(
    "calendars",
    { end: 25, start: 15 },
    coverage,
    true,
  ), {
    mode: "replace",
    range: { end: 25, start: 15 },
  });
});

test("coalesces loaded slices into continuous coverage", () => {
  assert.deepEqual(includeCalendarEventLoadRange(
    "calendars",
    coverage,
    { end: 40, start: 30 },
    false,
  ), { end: 40, key: "calendars", start: 10 });
});

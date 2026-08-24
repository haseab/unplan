import assert from "node:assert/strict";
import test from "node:test";
import {
  dominantAxisCalendarScrollDelta,
  horizontalCalendarDayShift,
  intentionalCalendarScrollDelta,
  recenteredCalendarScrollLeft,
} from "./calendar-horizontal-position";

test("detects a one-day horizontal move in a five-day view", () => {
  assert.equal(horizontalCalendarDayShift(600, 500, 5), 1);
  assert.equal(horizontalCalendarDayShift(400, 500, 5), -1);
});

test("keeps sub-day movement on the current visible date", () => {
  assert.equal(horizontalCalendarDayShift(549, 500, 5), 0);
  assert.equal(horizontalCalendarDayShift(451, 500, 5), 0);
});

test("supports full buffered-page movement", () => {
  assert.equal(horizontalCalendarDayShift(1_000, 500, 5), 5);
  assert.equal(horizontalCalendarDayShift(0, 500, 5), -5);
});

test("recenters by the committed number of days without a visual jump", () => {
  assert.equal(recenteredCalendarScrollLeft(700, 2, 500, 5), 500);
  assert.equal(recenteredCalendarScrollLeft(300, -2, 500, 5), 500);
});

test("keeps every scroll update on only its dominant axis", () => {
  assert.deepEqual(dominantAxisCalendarScrollDelta(18, 7), {
    left: 18,
    top: 0,
  });
  assert.deepEqual(dominantAxisCalendarScrollDelta(6, 20), {
    left: 0,
    top: 20,
  });
});

test("allows direction to change freely between scroll updates", () => {
  assert.deepEqual(dominantAxisCalendarScrollDelta(20, 4), {
    left: 20,
    top: 0,
  });
  assert.deepEqual(dominantAxisCalendarScrollDelta(3, 16), {
    left: 0,
    top: 16,
  });
});

test("ignores minor vertical noise while horizontal scrolling is active", () => {
  assert.deepEqual(intentionalCalendarScrollDelta(12, 3, "horizontal"), {
    axis: "horizontal",
    left: 12,
    top: 0,
  });
  assert.deepEqual(intentionalCalendarScrollDelta(1, 3, "horizontal"), {
    axis: "horizontal",
    left: 1,
    top: 0,
  });
});

test("changes axis when the new direction is clearly intentional", () => {
  assert.deepEqual(intentionalCalendarScrollDelta(3, 12, "horizontal"), {
    axis: "vertical",
    left: 0,
    top: 12,
  });
  assert.deepEqual(intentionalCalendarScrollDelta(12, 3, "vertical"), {
    axis: "horizontal",
    left: 12,
    top: 0,
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CALENDAR_TIME_SCALE,
  MAX_CALENDAR_TIME_SCALE,
  MIN_CALENDAR_TIME_SCALE,
  calendarGridLineDensity,
  calendarTimeScaleFromDrag,
  normalizeCalendarTimeScale,
  parseStoredCalendarTimeScale,
} from "./calendar-time-scale";

test("dragging down stretches the time scale and dragging up compresses it", () => {
  assert.equal(calendarTimeScaleFromDrag(1, 150), 1.5);
  assert.equal(calendarTimeScaleFromDrag(1, -150), 0.5);
});

test("the time scale is rounded and constrained to usable bounds", () => {
  assert.equal(normalizeCalendarTimeScale(1.024), 1);
  assert.equal(normalizeCalendarTimeScale(1.026), 1.05);
  assert.equal(normalizeCalendarTimeScale(99), MAX_CALENDAR_TIME_SCALE);
  assert.equal(normalizeCalendarTimeScale(-99), MIN_CALENDAR_TIME_SCALE);
});

test("stored time scales recover safely from missing or invalid values", () => {
  assert.equal(parseStoredCalendarTimeScale(null), DEFAULT_CALENDAR_TIME_SCALE);
  assert.equal(parseStoredCalendarTimeScale("not-a-number"), DEFAULT_CALENDAR_TIME_SCALE);
  assert.equal(parseStoredCalendarTimeScale("1.47"), 1.45);
});

test("grid lines thin out as the calendar is compressed", () => {
  assert.deepEqual(calendarGridLineDensity(1), {
    hourInterval: 1,
    showHalfHourLines: true,
  });
  assert.deepEqual(calendarGridLineDensity(0.75), {
    hourInterval: 1,
    showHalfHourLines: false,
  });
  assert.deepEqual(calendarGridLineDensity(0.55), {
    hourInterval: 2,
    showHalfHourLines: false,
  });
});

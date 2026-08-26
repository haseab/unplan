import assert from "node:assert/strict";
import test from "node:test";
import {
  adjustCalendarDateBuffer,
  createCalendarDateBuffer,
} from "./calendar-date-buffer";

const date = (day: number) => new Date(2026, 7, day, 12);

test("starts with one visible period and one reserve period on each side", () => {
  const buffer = createCalendarDateBuffer(date(10), 7);

  assert.equal(buffer.start.getTime(), date(3).getTime());
  assert.equal(buffer.dayCount, 21);
});

test("appends a period as soon as the trailing reserve is partly visible", () => {
  const initial = createCalendarDateBuffer(date(10), 7);
  const adjustment = adjustCalendarDateBuffer(initial, 7.25);

  assert.equal(adjustment.buffer.start.getTime(), initial.start.getTime());
  assert.equal(adjustment.buffer.dayCount, 28);
  assert.equal(adjustment.prependedDayCount, 0);
  assert.equal(adjustment.removedBeforeDayCount, 0);
});

test("prepends a period as soon as the leading reserve is partly visible", () => {
  const initial = createCalendarDateBuffer(date(10), 7);
  const adjustment = adjustCalendarDateBuffer(initial, 6.75);

  assert.equal(adjustment.buffer.start.getTime(), date(-4).getTime());
  assert.equal(adjustment.buffer.dayCount, 28);
  assert.equal(adjustment.prependedDayCount, 7);
  assert.equal(adjustment.removedBeforeDayCount, 0);
});

test("trims the distant leading period only after two hidden periods remain", () => {
  const expanded = adjustCalendarDateBuffer(
    createCalendarDateBuffer(date(10), 7),
    7.25,
  ).buffer;
  const adjustment = adjustCalendarDateBuffer(expanded, 14.25);

  assert.equal(adjustment.buffer.start.getTime(), date(10).getTime());
  assert.equal(adjustment.buffer.dayCount, 28);
  assert.equal(adjustment.removedBeforeDayCount, 7);
});

test("trims the distant trailing period after scrolling back across the buffer", () => {
  const initial = createCalendarDateBuffer(date(10), 7);
  const fourPeriods = { ...initial, dayCount: 28 };
  const adjustment = adjustCalendarDateBuffer(fourPeriods, 6.75);

  assert.equal(adjustment.buffer.start.getTime(), date(-4).getTime());
  assert.equal(adjustment.buffer.dayCount, 28);
  assert.equal(adjustment.prependedDayCount, 7);
  assert.equal(adjustment.removedBeforeDayCount, 0);
});

test("uses strict expansion and trim thresholds to provide hysteresis", () => {
  const initial = createCalendarDateBuffer(date(10), 7);
  const atExpansionBoundary = adjustCalendarDateBuffer(initial, 7);

  assert.equal(atExpansionBoundary.buffer.dayCount, 21);

  const fourPeriods = { ...initial, dayCount: 28 };
  const atTrimBoundary = adjustCalendarDateBuffer(fourPeriods, 14);

  assert.equal(atTrimBoundary.buffer.start.getTime(), initial.start.getTime());
  assert.equal(atTrimBoundary.buffer.dayCount, 28);
});

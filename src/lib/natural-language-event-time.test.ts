import assert from "node:assert/strict";
import test from "node:test";
import { parseEventTime } from "./natural-language-event-time";

const reference = new Date(2026, 7, 28, 12, 0, 0, 0);
const parts = (date: Date) => [
  date.getFullYear(),
  date.getMonth() + 1,
  date.getDate(),
  date.getHours(),
  date.getMinutes(),
];

test("parses a time range as today", () => {
  const parsed = parseEventTime("5pm to 6pm", new Date(2026, 7, 28, 21, 0))!;
  assert.deepEqual(parts(parsed.start), [2026, 8, 28, 17, 0]);
  assert.deepEqual(parts(parsed.end), [2026, 8, 28, 18, 0]);
});

test("rounds now to the nearest 15-minute increment", () => {
  const beforeMidpoint = parseEventTime("now", new Date(2026, 7, 28, 10, 52))!;
  assert.deepEqual(parts(beforeMidpoint.start), [2026, 8, 28, 10, 45]);
  assert.deepEqual(parts(beforeMidpoint.end), [2026, 8, 28, 11, 45]);

  const afterMidpoint = parseEventTime("now", new Date(2026, 7, 28, 10, 53))!;
  assert.deepEqual(parts(afterMidpoint.start), [2026, 8, 28, 11, 0]);
});

test("understands relative weekdays and inferred meridiem", () => {
  const parsed = parseEventTime("next friday 2-3pm", reference)!;
  assert.deepEqual(parts(parsed.start), [2026, 9, 4, 14, 0]);
  assert.deepEqual(parts(parsed.end), [2026, 9, 4, 15, 0]);
});

test("understands relative dates with durations", () => {
  const parsed = parseEventTime("tomorrow at 9:15 for 45 minutes", reference)!;
  assert.deepEqual(parts(parsed.start), [2026, 8, 29, 9, 15]);
  assert.deepEqual(parts(parsed.end), [2026, 8, 29, 10, 0]);
});

test("understands colloquial ranges and durations", () => {
  const range = parseEventTime("noon to 1", reference)!;
  assert.deepEqual(parts(range.start), [2026, 8, 28, 12, 0]);
  assert.deepEqual(parts(range.end), [2026, 8, 28, 13, 0]);

  const duration = parseEventTime("tomorrow at 4pm for half an hour", reference)!;
  assert.deepEqual(parts(duration.start), [2026, 8, 29, 16, 0]);
  assert.deepEqual(parts(duration.end), [2026, 8, 29, 16, 30]);
});

test("normalizes compact 24-hour ranges", () => {
  const parsed = parseEventTime("tomorrow 1730 to 1845", reference)!;
  assert.deepEqual(parts(parsed.start), [2026, 8, 29, 17, 30]);
  assert.deepEqual(parts(parsed.end), [2026, 8, 29, 18, 45]);
});

test("defaults date-only phrases to a one-hour morning entry", () => {
  const parsed = parseEventTime("monday", reference)!;
  assert.deepEqual(parts(parsed.start), [2026, 8, 31, 9, 0]);
  assert.deepEqual(parts(parsed.end), [2026, 8, 31, 10, 0]);
});

test("supports explicit all-day entries", () => {
  const parsed = parseEventTime("all day tomorrow", reference)!;
  assert.equal(parsed.allDay, true);
  assert.deepEqual(parts(parsed.start), [2026, 8, 29, 0, 0]);
  assert.deepEqual(parts(parsed.end), [2026, 8, 30, 0, 0]);
});

test("rejects text without a date or time", () => {
  assert.equal(parseEventTime("whenever feels good", reference), null);
});

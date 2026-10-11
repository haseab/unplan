import assert from "node:assert/strict";
import test from "node:test";
import { moveEventToDay, changeEventClockTime, setEventEndDay } from "./event-date-editing";
import { parseCalendarDateCommand } from "./calendar-date-command";

test("typed date commands move the day while preserving clock time and duration", () => {
  const event = { start: new Date(2026, 9, 11, 18, 30).toISOString(), end: new Date(2026, 9, 11, 19, 45).toISOString() };
  const day = parseCalendarDateCommand("tomorrow", new Date(2026, 9, 11))!;
  const moved = moveEventToDay(event, day);
  assert.equal(new Date(moved.start).getDate(), 12);
  assert.equal(new Date(moved.start).getHours(), 18);
  assert.equal(new Date(moved.start).getMinutes(), 30);
  assert.equal(+new Date(moved.end) - +new Date(moved.start), 75 * 60000);
});
test("multi-day all-day events retain their day span across daylight saving", () => {
  const event = { start: new Date(2026, 9, 11).toISOString(), end: new Date(2026, 9, 14).toISOString(), allDay: true };
  const moved = moveEventToDay(event, new Date(2026, 9, 31));
  assert.equal(new Date(moved.end).getDate(), 3);
  assert.equal(new Date(moved.end).getHours(), 0);
});
test("start time preserves duration and an earlier end time rolls into the next day", () => {
  const event = { start: new Date(2026, 9, 11, 18, 30).toISOString(), end: new Date(2026, 9, 11, 19, 30).toISOString() };
  const start = changeEventClockTime(event, "start", "20:00")!;
  assert.equal(new Date(start.end).getHours(), 21);
  const end = changeEventClockTime(event, "end", "01:00")!;
  assert.equal(new Date(end.end).getDate(), 12);
  assert.equal(changeEventClockTime(event, "start", "25:00"), null);
});

test("end-day editing preserves its time and rejects an end before the start", () => {
  const event = { start: new Date(2026, 9, 11, 18).toISOString(), end: new Date(2026, 9, 11, 19).toISOString() };
  const next = setEventEndDay(event, new Date(2026, 9, 13))!;
  assert.equal(new Date(next.end).getDate(), 13);
  assert.equal(new Date(next.end).getHours(), 19);
  assert.equal(setEventEndDay(event, new Date(2026, 9, 10)), null);
});

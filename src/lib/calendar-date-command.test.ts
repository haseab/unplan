import assert from "node:assert/strict";
import test from "node:test";
import { parseCalendarDateCommand } from "./calendar-date-command";

const reference = new Date(2026, 7, 28, 12, 0, 0, 0);
const dateParts = (date: Date | null) => date
  ? [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours()]
  : null;

test("parses relative calendar dates", () => {
  assert.deepEqual(
    dateParts(parseCalendarDateCommand("tomorrow", reference)),
    [2026, 8, 29, 0],
  );
  assert.deepEqual(
    dateParts(parseCalendarDateCommand("next Friday", reference)),
    [2026, 9, 4, 0],
  );
  assert.deepEqual(
    dateParts(parseCalendarDateCommand("in two weeks", reference)),
    [2026, 9, 11, 0],
  );
});

test("moves ambiguous month and day phrases forward", () => {
  assert.deepEqual(
    dateParts(parseCalendarDateCommand("August 12", reference)),
    [2027, 8, 12, 0],
  );
});

test("keeps explicitly past dates in the past", () => {
  assert.deepEqual(
    dateParts(parseCalendarDateCommand("August 12, 2025", reference)),
    [2025, 8, 12, 0],
  );
  assert.deepEqual(
    dateParts(parseCalendarDateCommand("yesterday", reference)),
    [2026, 8, 27, 0],
  );
});

test("parses compact date-scale relative shorthand", () => {
  assert.deepEqual(
    dateParts(parseCalendarDateCommand("48 da", reference)),
    [2026, 7, 11, 0],
  );
  assert.deepEqual(
    dateParts(parseCalendarDateCommand("2wa", reference)),
    [2026, 8, 14, 0],
  );
  assert.deepEqual(
    dateParts(parseCalendarDateCommand("3moa", reference)),
    [2026, 5, 28, 0],
  );
  assert.deepEqual(
    dateParts(parseCalendarDateCommand("1ya", reference)),
    [2025, 8, 28, 0],
  );
});

test("supports Retrace-style units and compact directions", () => {
  assert.deepEqual(
    dateParts(parseCalendarDateCommand("2d ago", reference)),
    [2026, 8, 26, 0],
  );
  assert.deepEqual(
    dateParts(parseCalendarDateCommand("2db", reference)),
    [2026, 8, 26, 0],
  );
  assert.deepEqual(
    dateParts(parseCalendarDateCommand("2wl", reference)),
    [2026, 9, 11, 0],
  );
  assert.deepEqual(
    dateParts(parseCalendarDateCommand("2moaf", reference)),
    [2026, 10, 28, 0],
  );
});

test("does not add minute or hour shorthand to the date command", () => {
  assert.equal(parseCalendarDateCommand("2ma", reference), null);
  assert.equal(parseCalendarDateCommand("2ha", reference), null);
});

test("rejects text without a date", () => {
  assert.equal(parseCalendarDateCommand("whenever feels good", reference), null);
  assert.equal(parseCalendarDateCommand("", reference), null);
});

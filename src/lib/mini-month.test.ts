import assert from "node:assert/strict";
import test from "node:test";
import { miniMonthDays } from "./mini-month";

test("mini month starts on Monday and includes complete weeks", () => {
  const days = miniMonthDays(new Date(2026, 9, 20));
  assert.equal(days.length, 35);
  assert.equal(days[0].getDay(), 1);
  assert.equal(days[0].getMonth(), 8);
  assert.equal(days[0].getDate(), 28);
  assert.equal(days.at(-1)?.getDay(), 0);
});

test("six-week months include the last day instead of truncating it", () => {
  const days = miniMonthDays(new Date(2026, 10, 1));
  assert.equal(days.length, 42);
  assert.ok(days.some((date) => date.getMonth() === 10 && date.getDate() === 30));
});

test("leap days and year boundaries are included", () => {
  const leapDays = miniMonthDays(new Date(2028, 1, 1));
  assert.ok(leapDays.some((date) => date.getMonth() === 1 && date.getDate() === 29));
  const december = miniMonthDays(new Date(2026, 11, 1));
  assert.equal(december.at(-1)?.getFullYear(), 2027);
  assert.equal(december.at(-1)?.getDay(), 0);
});

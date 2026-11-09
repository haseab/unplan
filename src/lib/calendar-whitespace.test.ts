import assert from "node:assert/strict";
import test from "node:test";
import { calendarWhitespace } from "./calendar-whitespace";
const h = 3600000;
const base = Date.parse("2026-11-08T20:00:00Z");
const event = (a: number, b: number) => ({start: {dateTime: new Date(base + a*h).toISOString()}, end: {dateTime: new Date(base+b*h).toISOString()}});
test("merges overlaps, duplicates and boundaries across the rolling 24 hours", () => {
  assert.equal(calendarWhitespace([event(-26,-23),event(-24,-22),event(-23,-21),event(-23,-21),event(-1,2),event(1,2)],base-24*h,base).hours,20);
});
test("empty calendars report the full window and all-day, declined and cancelled entries leave whitespace", () => {
  assert.equal(calendarWhitespace([],base-24*h,base).hours,24);
  assert.equal(calendarWhitespace([{...event(-5,-1),status:"cancelled"},{...event(-5,-1),attendees:[{self:true,responseStatus:"declined"}]},{start:{date:"2026-11-08"},end:{date:"2026-11-09"}}],base-24*h,base).hours,24);
});
test("fully covered time reports zero and malformed events fail closed", () => {
  assert.equal(calendarWhitespace([event(-200,1)],base-24*h,base).hours,0);
  assert.throws(()=>calendarWhitespace([{start:{dateTime:"bad"}}],base-h,base));
});

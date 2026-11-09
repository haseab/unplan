import test from "node:test";
import assert from "node:assert/strict";
import { currentActivity } from "./current-activity";
const now = Date.parse("2026-11-08T20:00:00Z");
const event = (from: number, to: number) => ({ start: { dateTime: new Date(now + from).toISOString() }, end: { dateTime: new Date(now + to).toISOString() } });
test("current activities include start and exclude end, without needing a video call", () => {
  assert.equal(currentActivity([event(0, 1000)], now).active, true);
  assert.equal(currentActivity([event(-1000, 0)], now).active, false);
  assert.equal(currentActivity([event(1, 1000)], now).active, false);
  assert.equal(currentActivity([event(-1000, 1)], now).active, true);
  assert.equal(currentActivity([], now).active, false);
});
test("all-day, declined and cancelled entries do not suppress Set intention", () => {
  assert.equal(currentActivity([
    { start: { date: "2026-11-08" }, end: { date: "2026-11-09" } },
    { ...event(-1000, 1000), status: "cancelled" },
    { ...event(-1000, 1000), attendees: [{ self: true, responseStatus: "declined" }] },
  ], now).active, false);
  assert.throws(() => currentActivity([{ start: {}, end: {} }], now));
});

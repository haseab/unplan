import assert from "node:assert/strict";
import test from "node:test";
import { nextCalendarCall, calendarEventMeetingUrl } from "./next-calendar-call";
import type { CalendarEvent } from "./calendar-types";
const event = (id: string, start: string, end: string, overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, start, end, title: id, calendarId: "work", color: "purple", calendarColor: "purple", provider: "google",
  conferenceLink: "https://meet.google.com/abc-defg-hij", ...overrides,
});
const now = new Date("2026-10-11T18:00:00Z");
test("joins an ongoing call before the nearest future call and ignores ended calls", () => {
  const ongoing = event("ongoing", "2026-10-11T17:30Z", "2026-10-11T18:30Z");
  const next = event("next", "2026-10-11T19:00Z", "2026-10-11T20:00Z");
  const ended = event("ended", "2026-10-11T16:00Z", "2026-10-11T18:00Z");
  assert.equal(nextCalendarCall([next, ended, ongoing], now)?.event.id, "ongoing");
  assert.equal(nextCalendarCall([ended, next], now)?.event.id, "next");
});
test("skips declined, all-day, missing-link and invalid-time events", () => {
  const base = event("base", "2026-10-11T19:00Z", "2026-10-11T20:00Z");
  assert.equal(nextCalendarCall([{ ...base, allDay: true }, { ...base, attendees: [{ self: true, responseStatus: "declined" }] },
    { ...base, conferenceLink: "pending" }, { ...base, start: "bad" }], now), null);
});
test("finds meeting links in location or notes, rejects unsafe URLs and unrelated sites", () => {
  const base = event("base", "2026-10-11T19:00Z", "2026-10-11T20:00Z", { conferenceLink: undefined });
  assert.equal(calendarEventMeetingUrl({ ...base, location: "Join https://company.zoom.us/j/123" }), "https://company.zoom.us/j/123");
  assert.equal(calendarEventMeetingUrl({ ...base, description: '<a href="https://meet.google.com/abc-defg-hij">Join</a>' }), "https://meet.google.com/abc-defg-hij");
  assert.equal(calendarEventMeetingUrl({ ...base, conferenceLink: "javascript:alert(1)", location: "https://zoom.us.evil.test/j/123" }), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { attentionMeeting, type MeetingEvent } from "./attention-next-meeting";

const now = Date.parse("2026-11-07T18:00:00Z");
const event: MeetingEvent = { summary: "Team sync", start: { dateTime: "2026-11-07T11:00:00-08:00" }, end: { dateTime: "2026-11-07T11:30:00-08:00" }, hangoutLink: "https://meet.google.com/abc-defg-hij" };
test("selects remote and in-person meetings without returning attendee data", () => {
  assert.deepEqual(attentionMeeting(event, now), { title: "Team sync", start: "2026-11-07T19:00:00.000Z", end: "2026-11-07T19:30:00.000Z", url: event.hangoutLink });
  assert.equal(attentionMeeting({ ...event, hangoutLink: undefined, attendees: [{ self: true }, { self: false }] }, now)?.title, "Team sync");
  assert.equal(attentionMeeting({ ...event, start: { dateTime: "2026-11-07T17:00:00Z" } }, now)?.title, "Team sync");
});
test("skips all-day, ended, declined, cancelled, focus and solo events", () => {
  for (const patch of [
    { start: {} }, { start: { dateTime: "invalid" } }, { end: { dateTime: "2026-11-07T18:00:00Z" } },
    { attendees: [{ self: true, responseStatus: "declined" }] }, { status: "cancelled" }, { eventType: "focusTime" },
    { hangoutLink: undefined, attendees: [{ self: true }] },
  ]) assert.equal(attentionMeeting({ ...event, ...patch }, now), null);
});
test("uses conference video and embedded meeting links safely", () => {
  assert.equal(attentionMeeting({ ...event, hangoutLink: undefined, conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://company.zoom.us/j/123" }] } }, now)?.url, "https://company.zoom.us/j/123");
  assert.equal(attentionMeeting({ ...event, hangoutLink: "javascript:bad", description: "Join https://zoom.us.evil.test/j/123" }, now), null);
});

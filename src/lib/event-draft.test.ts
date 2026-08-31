import assert from "node:assert/strict";
import test from "node:test";

import type { CalendarEvent } from "./calendar-types";
import { eventDraftsEqual } from "./event-draft";

const original: CalendarEvent = {
  calendarColor: "#4666e5",
  calendarId: "work",
  color: "#4666e5",
  end: "2026-08-30T18:30:00.000Z",
  id: "event-1",
  provider: "google",
  start: "2026-08-30T18:00:00.000Z",
  title: "Reach out to Edson",
};

test("recognizes an event draft that was edited and restored", () => {
  const edited = { ...original, title: `${original.title}s` };
  const restored = { ...edited, title: original.title };

  assert.equal(eventDraftsEqual(original, edited), false);
  assert.equal(eventDraftsEqual(original, restored), true);
});

test("compares nested event fields without relying on object identity", () => {
  const withAttendees = {
    ...original,
    attendees: [{ email: "guest@example.com", responseStatus: "accepted" as const }],
  };
  const copied = {
    ...withAttendees,
    attendees: withAttendees.attendees.map((attendee) => ({ ...attendee })),
  };

  assert.equal(eventDraftsEqual(withAttendees, copied), true);
});

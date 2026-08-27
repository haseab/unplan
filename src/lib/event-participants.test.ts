import assert from "node:assert/strict";
import test from "node:test";
import {
  isEventUnaccepted,
  mergeParticipantEmails,
  participantInitials,
  participantResponseSummary,
  participantResponseSummaryLabel,
  shouldAutoCreateEventConference,
  updateSelfParticipantResponse,
} from "./event-participants";

test("participant response summaries group Google response states", () => {
  const summary = participantResponseSummary([
    { email: "yes@example.com", responseStatus: "accepted" },
    { email: "no@example.com", responseStatus: "declined" },
    { email: "maybe@example.com", responseStatus: "tentative" },
    { email: "waiting@example.com" },
  ]);

  assert.deepEqual(summary, {
    accepted: 1,
    awaiting: 1,
    declined: 1,
    tentative: 1,
    total: 4,
  });
  assert.equal(
    participantResponseSummaryLabel(summary),
    "1 yes, 1 no, 1 maybe, 1 awaiting",
  );
});

test("adding a Google Calendar participant requests a conference only when needed", () => {
  const shouldCreate = (overrides: Partial<Parameters<typeof shouldAutoCreateEventConference>[0]> = {}) =>
    shouldAutoCreateEventConference({
      currentParticipantCount: 0,
      nextParticipantCount: 1,
      provider: "google",
      ...overrides,
    });

  assert.equal(shouldCreate(), true);
  assert.equal(shouldCreate({ currentParticipantCount: 1, nextParticipantCount: 1 }), false);
  assert.equal(shouldCreate({ currentParticipantCount: 2, nextParticipantCount: 1 }), false);
  assert.equal(shouldCreate({ conferenceLink: "https://meet.google.com/example" }), false);
  assert.equal(shouldCreate({ provider: "demo" }), false);
});

test("participant helpers preserve existing attendees and avoid duplicates", () => {
  const attendees = [{ displayName: "Furqan Rydhan", email: "furqan@example.com" }];
  assert.equal(participantInitials(attendees[0]), "FR");
  assert.deepEqual(
    mergeParticipantEmails(attendees, "furqan@example.com, aiden@example.com"),
    [
      attendees[0],
      { email: "aiden@example.com", responseStatus: "needsAction" },
    ],
  );
});

test("only events awaiting the current attendee's acceptance use the pending style", () => {
  const baseEvent = {
    id: "event",
    calendarId: "calendar",
    title: "Dev Sync",
    start: "2026-08-22T17:00:00.000Z",
    end: "2026-08-22T17:45:00.000Z",
    calendarColor: "#8b332d",
    color: "#8b332d",
    provider: "google" as const,
  };

  assert.equal(isEventUnaccepted({
    ...baseEvent,
    attendees: [{ self: true, responseStatus: "needsAction" }],
  }), true);
  assert.equal(isEventUnaccepted({
    ...baseEvent,
    attendees: [{ self: true, responseStatus: "tentative" }],
  }), true);
  assert.equal(isEventUnaccepted({
    ...baseEvent,
    attendees: [{ self: true, responseStatus: "accepted" }],
  }), false);
  assert.equal(isEventUnaccepted({ ...baseEvent, organizerSelf: true }), false);
  assert.equal(isEventUnaccepted(baseEvent), false);
});

test("updating the current participant response preserves every other attendee", () => {
  const event = {
    id: "event",
    calendarId: "calendar",
    title: "Dev Sync",
    start: "2026-08-22T17:00:00.000Z",
    end: "2026-08-22T17:45:00.000Z",
    calendarColor: "#8b332d",
    color: "#8b332d",
    provider: "google" as const,
    attendees: [
      { email: "organizer@example.com", organizer: true, responseStatus: "accepted" as const },
      { email: "me@example.com", self: true, responseStatus: "needsAction" as const },
      { email: "guest@example.com", responseStatus: "tentative" as const },
    ],
  };

  const updated = updateSelfParticipantResponse(event, "declined");

  assert.equal(updated.attendees?.[1].responseStatus, "declined");
  assert.equal(updated.attendees?.[0], event.attendees[0]);
  assert.equal(updated.attendees?.[2], event.attendees[2]);
});

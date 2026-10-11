import assert from "node:assert/strict";
import test from "node:test";
import { createGoogleCalendarSourceId } from "./google-source-id";
import {
  applyGoogleEventSaveResult, CalendarTransferCleanupError,
  isCrossAccountCalendarMove, transferableGoogleEventFields, transferCalendarEvent,
} from "./google-event-transfer";
import type { CalendarEvent } from "./calendar-types";

test("distinguishes same-account moves from transfers", () => {
  const source = createGoogleCalendarSourceId("work", "a");
  assert.equal(isCrossAccountCalendarMove(source, createGoogleCalendarSourceId("work", "b")), false);
  assert.equal(isCrossAccountCalendarMove(source, createGoogleCalendarSourceId("personal", "b")), true);
  assert.equal(isCrossAccountCalendarMove(undefined, source), false);
  assert.equal(isCrossAccountCalendarMove("demo", source), false);
});

test("creates before deleting and returns the new provider identity", async () => {
  const calls: string[] = [];
  const result = await transferCalendarEvent({
    create: async () => { calls.push("create"); return { id: "new" }; },
    deleteSource: async () => { calls.push("delete-source"); },
    rollback: async () => { calls.push("rollback"); },
  });
  assert.deepEqual(calls, ["create", "delete-source"]);
  assert.equal(result.id, "new");
});

test("creation failure leaves the original untouched", async () => {
  let deleted = false;
  await assert.rejects(transferCalendarEvent({
    create: async () => { throw new Error("destination denied"); },
    deleteSource: async () => { deleted = true; },
    rollback: async () => { throw new Error("must not rollback"); },
  }), /destination denied/);
  assert.equal(deleted, false);
});

test("source deletion failure removes the created copy", async () => {
  const calls: string[] = [];
  await assert.rejects(transferCalendarEvent({
    create: async () => "new",
    deleteSource: async () => { calls.push("delete-source"); throw new Error("source denied"); },
    rollback: async (id) => { calls.push(`rollback:${id}`); },
  }), /source denied/);
  assert.deepEqual(calls, ["delete-source", "rollback:new"]);
});

test("reports a remaining copy when rollback also fails", async () => {
  await assert.rejects(transferCalendarEvent({
    create: async () => "new",
    deleteSource: async () => { throw new Error("source denied"); },
    rollback: async () => { throw new Error("destination unavailable"); },
  }), CalendarTransferCleanupError);
});

test("copies notes, conference and private properties without provider ownership", () => {
  const fields = { description: "remote notes", conferenceData: { conferenceId: "meet" },
    extendedProperties: { private: { key: "value" } }, guestsCanModify: true };
  assert.deepEqual(transferableGoogleEventFields({ ...fields,
    id: "old", organizer: { email: "owner" }, recurringEventId: "series", iCalUID: "old" }), fields);
});

test("updates provider identity without discarding later edits and clears source series ownership", () => {
  const event: CalendarEvent = { id: "local", providerEventId: "old", calendarId: "destination",
    title: "later edit", start: "2026-10-11T12:00:00Z", end: "2026-10-11T13:00:00Z",
    color: "purple", calendarColor: "purple", provider: "google", recurringEventId: "series",
    originalStart: "old start", attendees: [{ email: "old-owner", self: true, organizer: true }] };
  const saved = applyGoogleEventSaveResult(event, { id: "new", htmlLink: "new-link", transferred: true });
  assert.equal(saved.id, "local");
  assert.equal(saved.title, "later edit");
  assert.equal(saved.providerEventId, "new");
  assert.equal(saved.recurringEventId, undefined);
  assert.equal(saved.originalStart, undefined);
  assert.deepEqual(saved.attendees, [{ email: "old-owner" }]);
});

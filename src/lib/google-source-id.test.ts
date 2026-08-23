import assert from "node:assert/strict";
import test from "node:test";
import {
  createGoogleCalendarSourceId,
  parseGoogleCalendarSourceId,
} from "./google-source-id";

test("round trips Google account and provider calendar identities", () => {
  const id = createGoogleCalendarSourceId(
    "account|with:separators@example.com",
    "team/calendar#group.v.calendar.google.com",
  );
  assert.deepEqual(parseGoogleCalendarSourceId(id), {
    accountId: "account|with:separators@example.com",
    providerCalendarId: "team/calendar#group.v.calendar.google.com",
  });
});

test("rejects malformed and non-Google calendar source IDs", () => {
  assert.equal(parseGoogleCalendarSourceId("demo-personal"), null);
  assert.equal(parseGoogleCalendarSourceId("google|missing-provider"), null);
  assert.equal(parseGoogleCalendarSourceId("google|bad%escape|calendar"), null);
});

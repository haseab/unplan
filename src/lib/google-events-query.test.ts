import assert from "node:assert/strict";
import test from "node:test";
import { buildGoogleEventsQuery } from "./google-events-query";

test("includes hidden invitations in Google event listings", () => {
  const query = buildGoogleEventsQuery({
    timeMax: "2026-08-24T00:00:00.000Z",
    timeMin: "2026-08-17T00:00:00.000Z",
  });

  assert.equal(query.get("showHiddenInvitations"), "true");
  assert.equal(query.get("singleEvents"), "true");
  assert.equal(query.get("timeMin"), "2026-08-17T00:00:00.000Z");
  assert.equal(query.get("timeMax"), "2026-08-24T00:00:00.000Z");
});

test("preserves provider search queries while including invitations", () => {
  const query = buildGoogleEventsQuery({
    searchQuery: "planning sync",
    timeMax: "2026-08-24T00:00:00.000Z",
    timeMin: null,
  });

  assert.equal(query.get("q"), "planning sync");
  assert.equal(query.get("showHiddenInvitations"), "true");
  assert.equal(query.has("timeMin"), false);
});

test("supports future-only queries without an upper bound", () => {
  const query = buildGoogleEventsQuery({
    searchQuery: "planning sync",
    timeMax: null,
    timeMin: "2026-08-24T00:00:00.000Z",
  });

  assert.equal(query.get("timeMin"), "2026-08-24T00:00:00.000Z");
  assert.equal(query.has("timeMax"), false);
});

test("supports provider pagination tokens", () => {
  const query = buildGoogleEventsQuery({
    pageToken: "next-page",
    timeMax: "2026-08-24T00:00:00.000Z",
    timeMin: null,
  });

  assert.equal(query.get("pageToken"), "next-page");
});

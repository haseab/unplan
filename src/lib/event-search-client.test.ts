import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent, CalendarSource } from "./calendar-types";
import { IncompleteEventSearchError, searchGoogleEvents } from "./event-search-client";
import { createGoogleCalendarSourceId } from "./google-source-id";

const calendar = (accountId: string): CalendarSource => ({
  accountId,
  backgroundColor: "#4666e5",
  foregroundColor: "#ffffff",
  id: createGoogleCalendarSourceId(accountId, "primary"),
  name: accountId,
  provider: "google",
  providerCalendarId: "primary",
});

const resultEvent: CalendarEvent = {
  calendarColor: "#4666e5",
  calendarId: createGoogleCalendarSourceId("healthy-account", "primary"),
  color: "#4666e5",
  end: "2026-08-22T18:00:00.000Z",
  id: "healthy-event",
  provider: "google",
  start: "2026-08-22T17:00:00.000Z",
  title: "Planning review",
};

test("multi-account search rejects incomplete results when one account fails", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storage = new Map<string, string>([[
    "unplan:google-accounts:v1",
    JSON.stringify([
      { accessToken: "failed-token", email: "failed@example.com", expiresAt: Date.now() + 60_000, id: "failed-account" },
      { accessToken: "healthy-token", email: "healthy@example.com", expiresAt: Date.now() + 60_000, id: "healthy-account" },
    ]),
  ]]);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: { getItem: (key: string) => storage.get(key) ?? null } },
  });
  globalThis.fetch = async (_input, init) => {
    const accountId = new Headers(init?.headers).get("X-Unplan-Google-Account");
    return accountId === "healthy-account"
      ? Response.json({ events: [resultEvent] })
      : Response.json({ error: "Account unavailable" }, { status: 503 });
  };

  try {
    await assert.rejects(searchGoogleEvents(
      "planning",
      [calendar("failed-account"), calendar("healthy-account")],
      new Date("2026-08-23T00:00:00.000Z"),
      new AbortController().signal,
      "exact",
      "past",
    ), (error: unknown) => {
      assert.ok(error instanceof IncompleteEventSearchError);
      assert.match(error.message, /Account unavailable/);
      assert.deepEqual(error.events.map(event => event.id), ["healthy-event"]);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("Google search requests the selected side of now", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storage = new Map<string, string>([[
    "unplan:google-accounts:v1",
    JSON.stringify([{
      accessToken: "healthy-token",
      email: "healthy@example.com",
      expiresAt: Date.now() + 60_000,
      id: "healthy-account",
    }]),
  ]]);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: { getItem: (key: string) => storage.get(key) ?? null } },
  });
  const requests: URLSearchParams[] = [];
  globalThis.fetch = async (input) => {
    requests.push(new URL(String(input), "http://localhost").searchParams);
    return Response.json({ events: [resultEvent] });
  };

  try {
    const now = new Date("2026-08-23T00:00:00.000Z");
    await searchGoogleEvents(
      "planning",
      [calendar("healthy-account")],
      now,
      new AbortController().signal,
      "exact",
      "future",
    );
    assert.equal(requests.length, 1);
    assert.equal(requests[0].get("timeMin"), now.toISOString());
    assert.equal(requests[0].has("timeMax"), false);

    requests.length = 0;
    await searchGoogleEvents("planning", [calendar("healthy-account")], now, new AbortController().signal, "exact", "fortnight");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].get("timeMax"), now.toISOString());
    assert.equal(requests[0].get("timeMin"), new Date(now.getTime() - 14 * 86400000).toISOString());
    requests.length = 0;
    await searchGoogleEvents(
      "planning",
      [calendar("healthy-account")],
      now,
      new AbortController().signal,
      "exact",
      "all",
    );
    assert.equal(requests.length, 2);
    assert.equal(requests.some((request) => request.has("timeMin")), true);
    assert.equal(requests.some((request) => request.has("timeMax")), true);
    globalThis.fetch = async () => Response.json({ events: [resultEvent], errors: [{ message: "Calendar unavailable" }] });
    await assert.rejects(searchGoogleEvents("planning", [calendar("healthy-account")], now, new AbortController().signal, "exact", "past"), /Calendar unavailable/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

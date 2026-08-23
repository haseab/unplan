import assert from "node:assert/strict";
import test from "node:test";
import { updateGoogleCalendarSelection } from "./google-calendar-list-client";
import { createGoogleCalendarSourceId } from "./google-source-id";

test("serializes selection updates for the same calendar", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let releaseFirst!: () => void;
  const firstResponse = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const requestedSelections: boolean[] = [];
  const accountId = "account-1";
  const calendarId = createGoogleCalendarSourceId(accountId, "calendar-a");
  const storage = new Map<string, string>([[
    "unplan:google-accounts:v1",
    JSON.stringify([{
      accessToken: "test-token",
      email: "person@example.com",
      expiresAt: Date.now() + 60_000,
      id: accountId,
    }]),
  ]]);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: { getItem: (key: string) => storage.get(key) ?? null } },
  });

  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { selected: boolean };
    requestedSelections.push(body.selected);
    if (requestedSelections.length === 1) await firstResponse;
    return Response.json({ selected: body.selected });
  };

  try {
    const hide = updateGoogleCalendarSelection(calendarId, false);
    const show = updateGoogleCalendarSelection(calendarId, true);
    await Promise.resolve();
    assert.deepEqual(requestedSelections, [false]);

    releaseFirst();
    await Promise.all([hide, show]);
    assert.deepEqual(requestedSelections, [false, true]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

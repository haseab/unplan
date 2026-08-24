import assert from "node:assert/strict";
import test from "node:test";
import { googleAuthorizedFetch, loadGoogleIdentity } from "./google-browser-auth";

class FakeScript extends EventTarget {
  async = false;
  defer = false;
  removed = false;
  src = "https://accounts.google.com/gsi/client";

  remove() {
    this.removed = true;
  }
}

test("Google Identity loading replaces a failed script on retry", async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let existing: FakeScript | null = new FakeScript();
  const appended: FakeScript[] = [];
  const fakeWindow: { google?: unknown } = {};
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => new FakeScript(),
      head: {
        appendChild: (script: FakeScript) => {
          appended.push(script);
          existing = script;
          queueMicrotask(() => {
            if (appended.length === 1) script.dispatchEvent(new Event("error"));
            else {
              fakeWindow.google = { accounts: { oauth2: {} } };
              script.dispatchEvent(new Event("load"));
            }
          });
        },
      },
      querySelector: () => existing,
    },
  });

  try {
    await assert.rejects(loadGoogleIdentity(), /Could not load Google Identity Services/);
    await loadGoogleIdentity();
    assert.equal(appended.length, 2);
    assert.equal(appended[0].removed, true);
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("expired Google access tokens refresh once and persist across concurrent requests", async () => {
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storage = new Map<string, string>();
  storage.set("unplan:google-accounts:v1", JSON.stringify([{
    accessToken: "expired-access-token",
    email: "person@example.com",
    expiresAt: 0,
    id: "google-account-id",
    refreshToken: "stored-refresh-token",
  }]));
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    },
  });

  let refreshRequests = 0;
  const apiAuthorizationHeaders: string[] = [];
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/google/oauth/token") {
        refreshRequests += 1;
        await Promise.resolve();
        return Response.json({ access_token: "refreshed-access-token", expires_in: 3600 });
      }
      apiAuthorizationHeaders.push(new Headers(init?.headers).get("Authorization") ?? "");
      return Response.json({ ok: true });
    },
  });

  try {
    await Promise.all([
      googleAuthorizedFetch("google-account-id", "/api/google/calendars"),
      googleAuthorizedFetch("google-account-id", "/api/google/events"),
    ]);
    assert.equal(refreshRequests, 1);
    assert.deepEqual(apiAuthorizationHeaders, [
      "Bearer refreshed-access-token",
      "Bearer refreshed-access-token",
    ]);
    const [storedAccount] = JSON.parse(storage.get("unplan:google-accounts:v1") ?? "[]");
    assert.equal(storedAccount.accessToken, "refreshed-access-token");
    assert.equal(storedAccount.refreshToken, "stored-refresh-token");
    assert.ok(storedAccount.expiresAt > Date.now());
  } finally {
    if (originalFetch) Object.defineProperty(globalThis, "fetch", originalFetch);
    else Reflect.deleteProperty(globalThis, "fetch");
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

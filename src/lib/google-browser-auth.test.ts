import assert from "node:assert/strict";
import test from "node:test";
import { googleAuthorizedFetch, loadGoogleAccounts, loadGoogleIdentity, readGoogleAccounts } from "./google-browser-auth";

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

const browserFixture = () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = globalThis.fetch;
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { origin: "https://unplan.io" }, localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    } },
  });
  return { storage, restore: () => {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  } };
};

test("Google API calls send a session and account selector, never browser tokens", async () => {
  const fixture = browserFixture();
  fixture.storage.set("unplan:google-accounts:v1", JSON.stringify([{
    id: "account", email: "person@example.test", accessToken: "fake-access", refreshToken: "fake-refresh", expiresAt: 0,
  }]));
  globalThis.fetch = async (_input, init) => {
    assert.equal(init?.credentials, "same-origin");
    assert.equal(new Headers(init?.headers).get("Authorization"), null);
    assert.equal(new Headers(init?.headers).get("X-Unplan-Google-Account"), "account");
    assert.equal(new Headers(init?.headers).get("X-Requested-With"), "XmlHttpRequest");
    assert.doesNotMatch(JSON.stringify(init), /fake-access|fake-refresh/);
    return Response.json({ ok: true });
  };
  try {
    await googleAuthorizedFetch("account", "/api/google/events", { headers: { Authorization: "Bearer fake-access" } });
  } finally { fixture.restore(); }
});

test("successful account loading removes legacy tokens and caches only metadata", async () => {
  const fixture = browserFixture();
  fixture.storage.set("unplan:google-accounts:v1", JSON.stringify([{
    id: "account", email: "person@example.test", accessToken: "fake-access", refreshToken: "fake-refresh", expiresAt: 0,
  }]));
  globalThis.fetch = async () => Response.json({ accounts: [{
    id: "account", email: "person@example.test", status: "active",
    accessToken: "never-cache-this", refreshToken: "never-cache-this-either",
  }] });
  try {
    assert.equal(readGoogleAccounts()[0].status, "expired");
    await loadGoogleAccounts();
    assert.equal(fixture.storage.has("unplan:google-accounts:v1"), false);
    assert.doesNotMatch(fixture.storage.get("unplan:google-accounts:v2")!, /Token|fake-|never-cache/);
    assert.deepEqual(readGoogleAccounts(), [{ id: "account", email: "person@example.test", status: "active" }]);
  } finally { fixture.restore(); }
});

test("temporary API failures preserve connection metadata", async () => {
  const fixture = browserFixture();
  const accounts = JSON.stringify([{ id: "account", email: "person@example.test", status: "active" }]);
  fixture.storage.set("unplan:google-accounts:v2", accounts);
  globalThis.fetch = async () => Response.json({ error: "temporarily unavailable" }, { status: 503 });
  try {
    assert.equal((await googleAuthorizedFetch("account", "/api/google/events")).status, 503);
    await assert.rejects(loadGoogleAccounts());
    assert.equal(fixture.storage.get("unplan:google-accounts:v2"), accounts);
  } finally { fixture.restore(); }
});

test("credentials cannot be forwarded to an external origin or another API", async () => {
  const fixture = browserFixture();
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return Response.json({}); };
  try {
    await assert.rejects(googleAuthorizedFetch("account", "https://evil.example/api/google/events"));
    await assert.rejects(googleAuthorizedFetch("account", "/api/todoist/tasks"));
    assert.equal(calls, 0);
  } finally { fixture.restore(); }
});

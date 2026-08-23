import assert from "node:assert/strict";
import test from "node:test";
import { loadGoogleIdentity } from "./google-browser-auth";

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

import assert from "node:assert/strict";
import test from "node:test";
import { openBrowserTab } from "./open-browser-tab";

test("opens a browser context first and clears the opener before navigating", () => {
  const calls: string[][] = [];
  const destinations: string[] = [];
  const tab: { opener: unknown; location: { replace: (href: string) => void } } = {
    opener: { source: true },
    location: { replace: href => { assert.equal(tab.opener, null); destinations.push(href); } },
  };
  const href = "https://deeplog.app/pendant?q=recording";
  assert.equal(openBrowserTab(href, (...args) => { calls.push(args); return tab; }), true);
  assert.deepEqual(calls, [["about:blank", "_blank"]]);
  assert.deepEqual(destinations, [href]);
  assert.equal(tab.opener, null);
});

test("popup blocking leaves the ordinary link available", () => {
  assert.equal(openBrowserTab("https://deeplog.app/pendant", () => null), false);
});

test("non-web protocols never open a browser window", () => {
  for (const href of ["javascript:alert(1)", "data:text/html,hi", "mailto:test@example.test", "bad-url"]) {
    assert.equal(openBrowserTab(href, () => { assert.fail("Unexpected opening"); }), false);
  }
});

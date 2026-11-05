import assert from "node:assert/strict";
import test from "node:test";
import * as chrono from "chrono-node";
import { eventHistoryShortcut, pastEventHistoryUrl } from "./event-history";

const key = {
  key: "p", code: "KeyP", metaKey: false, ctrlKey: false,
  altKey: false, shiftKey: false, isComposing: false,
};
const event = { start: "2026-11-01T01:30:15.123-07:00", end: "2026-11-01T01:45:30.456-08:00" };
const now = Date.parse("2026-11-05T20:00:00Z");

test("history shortcuts match Command/Ctrl+P, Shift+Command/Ctrl+P and macOS Option+P", () => {
  for (const modifier of [{ metaKey: true }, { ctrlKey: true }]) {
    assert.equal(eventHistoryShortcut({ ...key, ...modifier }), "limitless");
    assert.equal(eventHistoryShortcut({ ...key, ...modifier, shiftKey: true, key: "P" }), "retrace");
  }
  assert.equal(eventHistoryShortcut({ ...key, altKey: true, key: "π" }), "deeplog");
  assert.equal(eventHistoryShortcut({ ...key, metaKey: true, code: "" }), "limitless");
});

test("plain P, extra modifiers, unrelated keys and composition do not trigger history", () => {
  for (const change of [
    {}, { shiftKey: true }, { metaKey: true, altKey: true },
    { ctrlKey: true, altKey: true }, { altKey: true, shiftKey: true },
    { metaKey: true, isComposing: true }, { metaKey: true, key: "q", code: "KeyQ" },
  ]) assert.equal(eventHistoryShortcut({ ...key, ...change }), null);
});

test("only ended events with a valid positive duration have history links", () => {
  for (const destination of ["limitless", "retrace", "deeplog"] as const) {
    assert.ok(pastEventHistoryUrl(event, destination, Date.parse(event.end)));
    assert.equal(pastEventHistoryUrl(event, destination, Date.parse(event.end) - 1), null);
    assert.equal(pastEventHistoryUrl(event, destination, Date.parse(event.start) - 1), null);
    assert.equal(pastEventHistoryUrl({ ...event, start: "invalid" }, destination, now), null);
    assert.equal(pastEventHistoryUrl({ ...event, end: "invalid" }, destination, now), null);
    assert.equal(pastEventHistoryUrl({ ...event, end: event.start }, destination, now), null);
    assert.equal(pastEventHistoryUrl({ start: event.end, end: event.start }, destination, now), null);
    assert.equal(pastEventHistoryUrl(event, destination, NaN), null);
  }
});

test("Deeplog gets encoded exact instants across the DST fallback, including milliseconds", () => {
  const url = new URL(pastEventHistoryUrl(event, "deeplog", now)!);
  assert.equal(url.origin, "https://deeplog.app");
  assert.equal(url.pathname, "/");
  assert.equal(url.searchParams.get("from"), "2026-11-01T08:30:15.123Z");
  assert.equal(url.searchParams.get("to"), "2026-11-01T09:45:30.456Z");
  assert.ok(url.search.includes("%3A"));
});

test("Limitless history uses a query that Deeplog's Chrono parser reads as the exact range", () => {
  const url = new URL(pastEventHistoryUrl(event, "limitless", now)!);
  assert.equal(url.pathname, "/pendant");
  const results = chrono.parse(url.searchParams.get("q")!);
  assert.equal(results.length, 1);
  assert.equal(+results[0].start.date(), Date.parse(event.start));
  assert.equal(+results[0].end!.date(), Date.parse(event.end));
});

test("Retrace uses Deeplog's native scheme and the event start in milliseconds", () => {
  assert.equal(pastEventHistoryUrl(event, "retrace", now), `retracedev://timeline?t=${Date.parse(event.start)}`);
});

test("overnight and all-day event boundaries stay exact instead of becoming date-only ranges", () => {
  for (const range of [
    { start: "2026-11-03T23:30:00-08:00", end: "2026-11-04T00:30:00-08:00" },
    { start: "2026-11-03T00:00:00-08:00", end: "2026-11-04T00:00:00-08:00" },
  ]) {
    const url = new URL(pastEventHistoryUrl(range, "deeplog", now)!);
    assert.equal(Date.parse(url.searchParams.get("from")!), Date.parse(range.start));
    assert.equal(Date.parse(url.searchParams.get("to")!), Date.parse(range.end));
    const history = new URL(pastEventHistoryUrl(range, "limitless", now)!);
    const parsed = chrono.parse(history.searchParams.get("q")!)[0];
    assert.equal(+parsed.start.date(), Date.parse(range.start));
    assert.equal(+parsed.end!.date(), Date.parse(range.end));
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent, CalendarSource } from "./calendar-types";
import { mergeSearchSnapshots, selectSearchMatches, isSearchMatchesEditShortcut } from "./search-bulk-edit";

const calendar = (id: string, writable = true): CalendarSource => ({ id, name: id, provider: "demo", backgroundColor: "#123456", foregroundColor: "#ffffff", writable });
const calendars = [calendar("source"), calendar("target"), calendar("readonly", false)];
const event = (id: string, calendarId = "source"): CalendarEvent => ({ id, calendarId, title: "Planning", start: "2026-06-10T09:00:00Z", end: "2026-06-10T10:00:00Z", calendarColor: "#123456", color: "#123456", provider: "demo" });

test("search selection excludes read-only, missing calendars and duplicate matches", () => {
  const a = event("a"), b = event("b");
  assert.deepEqual(selectSearchMatches([], [a, a, b, event("c", "readonly"), event("d", "missing")], calendars), [a, b]);
});

test("offscreen search matches join the selection without overwriting newer loaded fields", () => {
  const a = event("a"), offscreen = event("b");
  const latest = { ...a, title: "Updated title", description: "Updated notes" };
  const selection = selectSearchMatches([latest, event("unrelated")], [a, offscreen], calendars);
  assert.deepEqual(selection, [latest, offscreen]);
  assert.deepEqual(mergeSearchSnapshots([latest], selection), [latest, offscreen]);
  assert.equal(a.title, "Planning");
});

test("matches moved since search are excluded without reviving stale source copies", () => {
  const a = event("a");
  assert.deepEqual(selectSearchMatches([{ ...a, calendarId: "target" }], [a], calendars), []);
});

test("search selection retains the exact recurring occurrence identity", () => {
  const occurrence = { ...event("a"), recurringEventId: "series", originalStart: "2026-06-10T09:00:00Z" };
  assert.deepEqual(selectSearchMatches([], [occurrence], calendars), [occurrence]);
});

test("Command or Control Right enters the matches editor without stealing other arrows", () => {
  const base = { metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, key: "ArrowRight" };
  assert.equal(isSearchMatchesEditShortcut(base), true);
  assert.equal(isSearchMatchesEditShortcut({ ...base, metaKey: false, ctrlKey: true }), true);
  for (const change of [{ metaKey: false }, { altKey: true }, { shiftKey: true }, { key: "ArrowLeft" }, { key: "ArrowDown" }]) {
    assert.equal(isSearchMatchesEditShortcut({ ...base, ...change }), false);
  }
});

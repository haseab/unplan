import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent, CalendarSource } from "./calendar-types";
import { buildSearchBulkUpdates, editableSearchEvents, mergeSearchSnapshots, rebaseSearchBulkUpdates, searchEventKey } from "./search-bulk-edit";
const calendar = (id: string, writable = true): CalendarSource => ({ id, name: id, provider: "demo", backgroundColor: "#123456", foregroundColor: "#ffffff", writable });
const calendars = [calendar("source"), calendar("target"), calendar("readonly", false)];
const event = (id: string, calendarId = "source"): CalendarEvent => ({ id, calendarId, title: "Planning", start: "2026-06-10T09:00:00Z", end: "2026-06-10T10:00:00Z", calendarColor: "#123456", color: "#123456", provider: "demo" });
test("reviewed targets exclude read-only sources, unchecked events and duplicates", () => {
  const a = event("a"), b = event("b"), c = event("c", "readonly");
  assert.deepEqual(editableSearchEvents([a, a, b, c], calendars).map(item => item.id), ["a", "b"]);
  const plan = buildSearchBulkUpdates([a, b, c], new Set([searchEventKey(a), searchEventKey(c)]), { calendarId: "target" }, calendars);
  assert.deepEqual(plan.originals, [a]);
  assert.deepEqual(plan.updated.map(item => [item.id, item.calendarId]), [["a", "target"]]);
  assert.equal(a.calendarId, "source");
});
test("staged move then calendar-default color resolves against the destination", () => {
  const a = { ...event("a"), colorId: "1", color: "#a4bdfc" };
  const plan = buildSearchBulkUpdates([a], new Set([searchEventKey(a)]), { calendarId: "target", color: { color: "#999999", textColor: "#ffffff" } }, calendars);
  assert.equal(plan.updated[0].color, "#123456");
  assert.equal(plan.updated[0].colorId, undefined);
  assert.deepEqual(plan.originals, [a]);
});
test("empty edits and invalid destinations never schedule writes", () => {
  const a = event("a");
  for (const changes of [{}, { calendarId: "readonly" }, { calendarId: "missing" }]) {
    assert.deepEqual(buildSearchBulkUpdates([a], new Set([searchEventKey(a)]), changes, calendars).updated, []);
  }
});
test("offscreen snapshots are available for optimistic updates and undo; loaded copies win", () => {
  const a = event("a"), b = event("b");
  const loaded = { ...a, title: "New title" };
  assert.deepEqual(mergeSearchSnapshots([loaded], [a, b]), [loaded, b]);
});
test("all staged fields preserve recurrence occurrence identity and original snapshots", () => {
  const a = { ...event("a"), recurringEventId: "series", originalStart: "2026-06-10T09:00:00Z" };
  const plan = buildSearchBulkUpdates([a], new Set([searchEventKey(a)]), { visibility: "private", transparency: "transparent" }, calendars);
  assert.equal(plan.updated[0].recurringEventId, "series");
  assert.equal(plan.updated[0].originalStart, a.originalStart);
  assert.equal(plan.updated[0].visibility, "private");
  assert.equal(plan.updated[0].transparency, "transparent");
  assert.equal(a.visibility, undefined);
});


test("reviewed edits preserve later changes to unrelated fields", () => {
  const snapshot = event("a");
  const latest = { ...snapshot, title: "New title", description: "New notes" };
  const updated = { ...snapshot, visibility: "private" as const };
  const [rebased] = rebaseSearchBulkUpdates([updated], [snapshot], [latest]);
  assert.equal(rebased.title, "New title");
  assert.equal(rebased.description, "New notes");
  assert.equal(rebased.visibility, "private");
  assert.throws(() => rebaseSearchBulkUpdates([updated], [snapshot], [{ ...latest, calendarId: "other" }]), /moved since/);
});

test("domain validation blocks moves across mixed accounts", () => {
  const sources = [{ ...calendar("source"), accountId: "first" }, { ...calendar("target"), accountId: "second" }];
  const a = event("a");
  assert.equal(buildSearchBulkUpdates([a], new Set([searchEventKey(a)]), { calendarId: "target" }, sources).updated.length, 0);
});


test("moving a custom-colored search match preserves its explicit color", () => {
  const a = { ...event("a"), customColor: "#abcdef", color: "#abcdef", textColor: "#000000" };
  const plan = buildSearchBulkUpdates([a], new Set([searchEventKey(a)]), { calendarId: "target" }, calendars);
  assert.equal(plan.updated[0].color, "#abcdef");
  assert.equal(plan.updated[0].customColor, "#abcdef");
  assert.equal(plan.updated[0].textColor, "#000000");
});

import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent } from "./calendar-types";
import {
  normalizeRecentEventTitle,
  reconcileRecentEventTitles,
  recentEventEditDurationMinutes,
  recentEventPreviewDurationMinutes,
  recordRecentEventTitleUse,
  searchRecentEventTitles,
} from "./recent-event-titles";

const event = (id: string, title: string, start: string): CalendarEvent => ({
  id,
  calendarId: "work",
  title,
  start,
  end: new Date(new Date(start).getTime() + 45 * 60_000).toISOString(),
  calendarColor: "#4666e5",
  color: "#4666e5",
  provider: "demo",
});

test("uses a recent timed duration while preserving incompatible all-day durations", () => {
  assert.equal(recentEventPreviewDurationMinutes({
    allDay: false,
    currentDurationMinutes: 30,
    recentDurationMinutes: 90,
  }), 90);
  assert.equal(recentEventPreviewDurationMinutes({
    allDay: false,
    currentDurationMinutes: 30,
    recentDurationMinutes: 24 * 60,
  }), 30);
  assert.equal(recentEventPreviewDurationMinutes({
    allDay: true,
    currentDurationMinutes: 24 * 60,
    recentDurationMinutes: 45,
  }), 24 * 60);
});

test("only pending-created events inherit a recent title's duration", () => {
  assert.equal(recentEventEditDurationMinutes({
    allDay: false,
    currentDurationMinutes: 30,
    pendingCreation: true,
    recentDurationMinutes: 90,
  }), 90);
  assert.equal(recentEventEditDurationMinutes({
    allDay: false,
    currentDurationMinutes: 30,
    pendingCreation: false,
    recentDurationMinutes: 90,
  }), 30);
});

test("normalizes whitespace and casing for title identity", () => {
  assert.equal(normalizeRecentEventTitle("  Weekly   Product Review "), "weekly product review");
});

test("history reconciliation deduplicates titles and retains the latest metadata", () => {
  const entries = reconcileRecentEventTitles([], [
    event("1", "Weekly Product Review", "2026-08-01T10:00:00.000Z"),
    event("2", " weekly  product review ", "2026-08-08T11:00:00.000Z"),
  ], "history-snapshot", new Date("2026-08-30T00:00:00.000Z").getTime());

  assert.equal(entries.length, 1);
  assert.equal(entries[0].historyCount, 2);
  assert.equal(entries[0].lastUsedAt, new Date("2026-08-08T11:00:00.000Z").getTime());
  assert.equal(entries[0].durationMinutes, 45);
});

test("observing the same loaded window does not repeatedly inflate history", () => {
  const loaded = [event("1", "Roadmap", "2026-08-01T10:00:00.000Z")];
  const first = reconcileRecentEventTitles([], loaded, "observed", Date.now());
  const second = reconcileRecentEventTitles(first, loaded, "observed", Date.now());
  assert.equal(second[0].historyCount, 1);
});

test("prefix matches outrank fuzzy matches and explicit selections boost ranking", () => {
  const now = new Date("2026-08-30T00:00:00.000Z").getTime();
  let entries = reconcileRecentEventTitles([], [
    event("1", "Product planning", "2026-08-20T10:00:00.000Z"),
    event("2", "Plan product launch", "2026-08-21T10:00:00.000Z"),
  ], "history-snapshot", now);
  assert.equal(searchRecentEventTitles(entries, "prod", { now })[0].title, "Product planning");

  entries = recordRecentEventTitleUse(entries, {
    calendarColor: "#4666e5",
    calendarId: "work",
    durationMinutes: 45,
    title: "Plan product launch",
  }, now);
  assert.equal(searchRecentEventTitles(entries, "", { now })[0].title, "Plan product launch");
});

import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent } from "./calendar-types";
import {
  addRecentEventTitle,
  applyRecentEventTitleSelection,
  normalizeRecentEventTitle,
  parseRecentEventTitles,
  reconcileRecentEventTitles,
  recentEventEditDurationMinutes,
  recentEventPreviewDurationMinutes,
  recordRecentEventTitleUse,
  searchRecentEventTitles,
} from "./recent-event-titles";

const event = (
  id: string,
  title: string,
  start: string,
  calendarId = "work",
): CalendarEvent => ({
  id,
  calendarId,
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

test("applies a selected recent title and its metadata in one event update", () => {
  const current = event("current", "Original title", "2026-08-23T10:00:00.000Z");
  const recent = {
    calendarColor: "#c061d6",
    calendarId: "recent-calendar",
    durationMinutes: 30,
    eventId: "recent-event",
    lastUsedAt: Date.now(),
    normalizedTitle: "mike shin",
    title: "Mike Shin",
    usageCount: 1,
  };
  const selected = applyRecentEventTitleSelection({
    calendar: {
      accountId: "account-1",
      backgroundColor: "#c061d6",
      foregroundColor: "#ffffff",
      id: "recent-calendar",
      name: "Work",
      provider: "google",
    },
    current,
    pendingCreation: false,
    recent,
  });

  assert.equal(selected.title, "Mike Shin");
  assert.equal(selected.calendarId, "recent-calendar");
  assert.equal(selected.color, "#c061d6");
  assert.equal(selected.end, current.end);
});

test("normalizes whitespace and casing for title identity", () => {
  assert.equal(normalizeRecentEventTitle("  Weekly   Product Review "), "weekly product review");
});

test("history reconciliation deduplicates matching calendar and title signatures", () => {
  const entries = reconcileRecentEventTitles([], [
    event("1", "Weekly Product Review", "2026-08-01T10:00:00.000Z"),
    event("2", " weekly  product review ", "2026-08-08T11:00:00.000Z"),
  ], new Date("2026-08-30T00:00:00.000Z").getTime());

  assert.equal(entries.length, 1);
  assert.equal(entries[0].eventId, "1");
  assert.equal(entries[0].durationMinutes, 45);
  assert.equal(entries[0].usageCount, 0);
});

test("history reconciliation keeps matching titles on different calendars separate", () => {
  const entries = reconcileRecentEventTitles([], [
    event("1", "Weekly Product Review", "2026-08-01T10:00:00.000Z", "work"),
    event("2", " weekly  product review ", "2026-08-08T11:00:00.000Z", "personal"),
  ], new Date("2026-08-30T00:00:00.000Z").getTime());

  assert.equal(entries.length, 2);
  assert.deepEqual(new Set(entries.map((entry) => entry.calendarId)), new Set(["work", "personal"]));
  assert.deepEqual(entries.map((entry) => entry.usageCount), [0, 0]);
});

test("observing the same loaded window does not duplicate suggestions", () => {
  const loaded = [event("1", "Roadmap", "2026-08-01T10:00:00.000Z")];
  const first = reconcileRecentEventTitles([], loaded, Date.now());
  const second = reconcileRecentEventTitles(first, loaded, Date.now());
  assert.equal(second.length, 1);
  assert.equal(second[0].eventId, "1");
});

test("fuzzy score ranks first and explicit usage breaks ties", () => {
  const now = new Date("2026-08-30T00:00:00.000Z").getTime();
  let entries = reconcileRecentEventTitles([], [
    event("1", "Product planning", "2026-08-20T10:00:00.000Z"),
    event("2", "Plan road", "2026-08-21T10:00:00.000Z"),
    event("3", "Product planning", "2026-08-22T10:00:00.000Z", "personal"),
  ], now);
  assert.equal(searchRecentEventTitles(entries, "prod")[0].title, "Product planning");

  entries = recordRecentEventTitleUse(entries, {
    calendarId: "personal",
    title: "Product planning",
  });
  assert.equal(searchRecentEventTitles(entries, "prod")[0].calendarId, "personal");
  assert.equal(searchRecentEventTitles(entries, "")[0].calendarId, "personal");
});

test("selection counts and current-title exclusion are scoped to the calendar", () => {
  const now = new Date("2026-08-30T00:00:00.000Z").getTime();
  let entries = reconcileRecentEventTitles([], [
    event("1", "Planning", "2026-08-20T10:00:00.000Z", "work"),
    event("2", "Planning", "2026-08-21T10:00:00.000Z", "personal"),
  ], now);

  entries = recordRecentEventTitleUse(entries, {
    calendarId: "work",
    title: "Planning",
  });

  assert.equal(entries.find((entry) => entry.calendarId === "work")?.usageCount, 1);
  assert.equal(entries.find((entry) => entry.calendarId === "personal")?.usageCount, 0);
  assert.deepEqual(
    searchRecentEventTitles(entries, "Planning", {
      excludeCalendarId: "work",
      excludeTitle: "Planning",
    }).map((entry) => entry.calendarId),
    ["personal"],
  );
});

test("a loaded event correction replaces the old signature while preserving unrelated cache entries", () => {
  const now = new Date("2026-08-30T00:00:00.000Z").getTime();
  let entries = reconcileRecentEventTitles([], [
    event("1", "Old title", "2026-08-20T10:00:00.000Z", "work"),
    event("2", "Unrelated", "2026-08-20T11:00:00.000Z", "work"),
  ], now);
  entries = recordRecentEventTitleUse(entries, { calendarId: "work", title: "Old title" });

  entries = reconcileRecentEventTitles(entries, [
    event("1", "New title", "2026-08-20T10:00:00.000Z", "personal"),
  ], now);

  assert.equal(entries.some((entry) => entry.title === "Old title"), false);
  assert.equal(entries.some((entry) => entry.title === "New title"), true);
  assert.equal(entries.some((entry) => entry.title === "Unrelated"), true);
});

test("newly created events enter the cache without counting as suggestion usage", () => {
  const entries = addRecentEventTitle([], event(
    "created",
    "New event",
    "2026-09-01T10:00:00.000Z",
  ));
  assert.equal(entries[0].eventId, "created");
  assert.equal(entries[0].usageCount, 0);
});

test("legacy selection counts migrate to usage counts", () => {
  const entries = parseRecentEventTitles(JSON.stringify([{
    calendarColor: "#4666e5",
    calendarId: "work",
    durationMinutes: 45,
    historyCount: 12,
    lastUsedAt: 123,
    normalizedTitle: "planning",
    selectionCount: 4,
    title: "Planning",
  }]));
  assert.equal(entries[0].eventId, "");
  assert.equal(entries[0].usageCount, 4);
});

test("the recent-title cache is unbounded", () => {
  const loaded = Array.from({ length: 300 }, (_, index) => event(
    String(index),
    `Event ${index}`,
    "2026-08-01T10:00:00.000Z",
  ));
  const entries = reconcileRecentEventTitles(
    [],
    loaded,
    new Date("2026-08-30T00:00:00.000Z").getTime(),
  );
  assert.equal(entries.length, 300);
});

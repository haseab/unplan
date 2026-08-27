import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent } from "./calendar-types";
import {
  calendarsForEventSelection,
  multiEventSelectionSummary,
  moveSelectionToCalendar,
  sharedSelectionValue,
} from "./multi-event-selection";

const event = (
  id: string,
  start: string,
  end: string,
  calendarId = "calendar-a",
): CalendarEvent => ({
  id,
  calendarId,
  title: id,
  start,
  end,
  calendarColor: "#000",
  color: "#000",
  provider: "demo",
});

test("multi-event summaries describe the complete selection", () => {
  const summary = multiEventSelectionSummary([
    event("first", "2026-08-22T09:00:00.000Z", "2026-08-22T10:00:00.000Z"),
    event("second", "2026-08-23T11:00:00.000Z", "2026-08-23T12:30:00.000Z", "calendar-b"),
  ]);

  assert.equal(summary?.calendarCount, 2);
  assert.equal(summary?.totalMinutes, 150);
  assert.equal(summary?.earliestStart.toISOString(), "2026-08-22T09:00:00.000Z");
  assert.equal(summary?.latestEnd.toISOString(), "2026-08-23T12:30:00.000Z");
});

test("shared selection values distinguish uniform and mixed fields", () => {
  assert.equal(sharedSelectionValue(["opaque", "opaque"]), "opaque");
  assert.equal(sharedSelectionValue(["opaque", "transparent"]), null);
});

const calendar = (
  id: string,
  accountId: string,
  backgroundColor = "#123456",
): import("./calendar-types").CalendarSource => ({
  accountId,
  backgroundColor,
  foregroundColor: "#ffffff",
  id,
  name: id,
  provider: "google",
});

test("bulk calendar choices stay within the selection's shared account", () => {
  const sources = [
    calendar("calendar-a", "account-1"),
    calendar("calendar-b", "account-1"),
    calendar("calendar-c", "account-2"),
  ];
  const selected = [
    event("first", "2026-08-22T09:00:00.000Z", "2026-08-22T10:00:00.000Z", "calendar-a"),
    event("second", "2026-08-22T10:00:00.000Z", "2026-08-22T11:00:00.000Z", "calendar-b"),
  ];

  assert.deepEqual(
    calendarsForEventSelection(selected, sources, sources).map(({ id }) => id),
    ["calendar-a", "calendar-b"],
  );
  assert.deepEqual(
    calendarsForEventSelection(
      [...selected, event("third", "2026-08-22T11:00:00.000Z", "2026-08-22T12:00:00.000Z", "calendar-c")],
      sources,
      sources,
    ),
    [],
  );
});

test("moving a selection updates its calendar palette", () => {
  const destination = calendar("calendar-b", "account-1", "#abcdef");
  const [moved] = moveSelectionToCalendar([
    event("first", "2026-08-22T09:00:00.000Z", "2026-08-22T10:00:00.000Z"),
  ], destination);

  assert.equal(moved.calendarId, "calendar-b");
  assert.equal(moved.calendarColor, "#abcdef");
  assert.equal(moved.color, "#abcdef");
});

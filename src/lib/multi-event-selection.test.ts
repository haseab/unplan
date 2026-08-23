import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent } from "./calendar-types";
import {
  multiEventSelectionSummary,
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

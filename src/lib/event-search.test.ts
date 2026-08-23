import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent } from "./calendar-types";
import {
  mergeCalendarSearchResults,
  mergeEventSearchResults,
  providerEventSearchQuery,
  searchLoadedEvents,
  searchLoadedPastEvents,
} from "./event-search";

const event = (
  id: string,
  title: string,
  start: string,
  end: string,
): CalendarEvent => ({
  id,
  calendarId: "calendar",
  title,
  start,
  end,
  calendarColor: "#000000",
  color: "#000000",
  provider: "demo",
});

const now = new Date("2026-08-22T19:00:00.000Z");
const planning = event(
  "planning",
  "Planning review",
  "2026-08-22T17:00:00.000Z",
  "2026-08-22T18:00:00.000Z",
);
const olderPlanning = event(
  "older-planning",
  "Planning retro",
  "2026-08-20T17:00:00.000Z",
  "2026-08-20T18:00:00.000Z",
);
const futurePlanning = event(
  "future-planning",
  "Planning tomorrow",
  "2026-08-23T17:00:00.000Z",
  "2026-08-23T18:00:00.000Z",
);

test("loaded event search returns matching past events newest first", () => {
  assert.deepEqual(
    searchLoadedPastEvents(
      [olderPlanning, futurePlanning, planning],
      "planning",
      now,
    ).map(({ id }) => id),
    ["planning", "older-planning"],
  );
});

test("merged provider results are de-duplicated and exclude future events", () => {
  assert.deepEqual(
    mergeEventSearchResults(
      [[olderPlanning, planning], [planning, futurePlanning]],
      now,
    ).map(({ id }) => id),
    ["planning", "older-planning"],
  );
});

test("progressively typing the final term keeps the provider candidate query stable", () => {
  assert.equal(providerEventSearchQuery("call mo"), "call");
  assert.equal(providerEventSearchQuery("call mom"), "call");
});

test("exact substring matching narrows monotonically as the query grows", () => {
  const callMom = event(
    "call-mom",
    "Call Mom",
    "2026-08-19T17:00:00.000Z",
    "2026-08-19T18:00:00.000Z",
  );
  const callMother = event(
    "call-mother",
    "Call Mother",
    "2026-08-18T17:00:00.000Z",
    "2026-08-18T18:00:00.000Z",
  );

  assert.deepEqual(
    searchLoadedPastEvents([callMother, callMom], "call mo", now)
      .map(({ id }) => id),
    ["call-mom", "call-mother"],
  );
  assert.deepEqual(
    searchLoadedPastEvents([callMother, callMom], "call mom", now)
      .map(({ id }) => id),
    ["call-mom"],
  );
});

test("calendar search includes loaded future events before recent history", () => {
  assert.deepEqual(
    searchLoadedEvents(
      [olderPlanning, futurePlanning, planning],
      "planning",
      now,
    ).map(({ id }) => id),
    ["future-planning", "planning", "older-planning"],
  );
});

test("calendar search merges visible and historical matches without duplicates", () => {
  assert.deepEqual(
    mergeCalendarSearchResults(
      [[futurePlanning, planning], [planning, olderPlanning]],
      now,
    ).map(({ id }) => id),
    ["future-planning", "planning", "older-planning"],
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent } from "./calendar-types";
import {
  mergeCalendarSearchResults,
  providerEventSearchQuery,
  searchLoadedEvents,
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

test("past event search excludes future events and sorts newest first", () => {
  assert.deepEqual(
    searchLoadedEvents(
      [olderPlanning, futurePlanning, planning],
      "planning",
      now,
      "past",
    ).map(({ id }) => id),
    ["planning", "older-planning"],
  );
});

test("merged past results are de-duplicated and exclude future events", () => {
  assert.deepEqual(
    mergeCalendarSearchResults(
      [[olderPlanning, planning], [planning, futurePlanning]],
      now,
      "past",
    ).map(({ id }) => id),
    ["planning", "older-planning"],
  );
});

test("progressively typing the final term keeps the provider candidate query stable", () => {
  assert.equal(providerEventSearchQuery("call mo"), "call");
  assert.equal(providerEventSearchQuery("call mom"), "call");
});

test("partial keyword matching narrows monotonically as the query grows", () => {
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
    searchLoadedEvents([callMother, callMom], "call mo", now, "past")
      .map(({ id }) => id),
    ["call-mom", "call-mother"],
  );
  assert.deepEqual(
    searchLoadedEvents([callMother, callMom], "call mom", now, "past")
      .map(({ id }) => id),
    ["call-mom"],
  );
});

test("keyword matching allows partial terms separated by other words", () => {
  const optimization = event(
    "cost-optimization",
    "Optimizing to make costs cheaper",
    "2026-08-23T17:00:00.000Z",
    "2026-08-23T18:00:00.000Z",
  );

  assert.deepEqual(
    searchLoadedEvents([optimization], "optimiz costs", now).map(({ id }) => id),
    ["cost-optimization"],
  );
  assert.deepEqual(searchLoadedEvents([optimization], "optimiz revenue", now), []);
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

test("future event search excludes completed events", () => {
  assert.deepEqual(
    searchLoadedEvents(
      [olderPlanning, futurePlanning, planning],
      "planning",
      now,
      "future",
    ).map(({ id }) => id),
    ["future-planning"],
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

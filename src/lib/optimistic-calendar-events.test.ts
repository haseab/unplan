import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent } from "./calendar-types";
import {
  reconcileOptimisticCalendarEvents,
  withCalendarEventPreview,
} from "./optimistic-calendar-events";

const event = (id: string, title = id): CalendarEvent => ({
  calendarColor: "#000000",
  calendarId: "calendar-1",
  color: "#000000",
  end: "2026-08-23T10:30:00.000Z",
  id,
  provider: "google",
  start: "2026-08-23T10:00:00.000Z",
  title,
});

test("preserves optimistic events missing from a provider snapshot", () => {
  const result = reconcileOptimisticCalendarEvents(
    [event("existing")],
    [event("optimistic")],
  );

  assert.deepEqual(result.events.map(({ id }) => id), ["existing", "optimistic"]);
  assert.deepEqual(result.preservedIds, ["optimistic"]);
  assert.deepEqual(result.confirmedIds, []);
  assert.deepEqual(result.suppressedRemovalIds, []);
  assert.deepEqual(result.confirmedRemovalIds, []);
});

test("uses the provider event and confirms a matching optimistic event", () => {
  const result = reconcileOptimisticCalendarEvents(
    [event("created", "Provider title")],
    [event("created", "Optimistic title")],
  );

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].title, "Provider title");
  assert.deepEqual(result.preservedIds, []);
  assert.deepEqual(result.confirmedIds, ["created"]);
});

test("does not disturb the provider snapshot when nothing is pending", () => {
  const loaded = [event("first"), event("second")];
  const result = reconcileOptimisticCalendarEvents(loaded, []);

  assert.deepEqual(result.events, loaded);
  assert.deepEqual(result.preservedIds, []);
  assert.deepEqual(result.confirmedIds, []);
});

test("keeps optimistically removed events out of a stale provider snapshot", () => {
  const result = reconcileOptimisticCalendarEvents(
    [event("moving-to-todoist"), event("remaining")],
    [],
    ["moving-to-todoist"],
  );

  assert.deepEqual(result.events.map(({ id }) => id), ["remaining"]);
  assert.deepEqual(result.suppressedRemovalIds, ["moving-to-todoist"]);
  assert.deepEqual(result.confirmedRemovalIds, []);
});

test("confirms an optimistic removal once it is absent from the provider", () => {
  const result = reconcileOptimisticCalendarEvents(
    [event("remaining")],
    [],
    ["removed"],
  );

  assert.deepEqual(result.events.map(({ id }) => id), ["remaining"]);
  assert.deepEqual(result.suppressedRemovalIds, []);
  assert.deepEqual(result.confirmedRemovalIds, ["removed"]);
});

test("projects an event edit without mutating the committed event collection", () => {
  const committed = [event("editing", "Original title"), event("other")];
  const preview = event("editing", "Live title");

  const displayed = withCalendarEventPreview(committed, preview);

  assert.equal(displayed[0].title, "Live title");
  assert.equal(committed[0].title, "Original title");
  assert.equal(displayed[1], committed[1]);
});

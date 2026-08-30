import assert from "node:assert/strict";
import test from "node:test";
import {
  adjacentEventCreationDates,
  eventCreationAnchorRange,
  eventCreationRange,
  eventCreationRangeFromDates,
  hasEventCreationDuration,
  isEventCreationAnchor,
} from "./event-creation";

const parts = (date: Date) => [
  date.getFullYear(),
  date.getMonth() + 1,
  date.getDate(),
  date.getHours(),
  date.getMinutes(),
];

test("represents pending creation as a zero-duration anchor", () => {
  const range = eventCreationAnchorRange(2, 600);

  assert.deepEqual(range, {
    dayIndex: 2,
    endMinute: 600,
    startMinute: 600,
  });
  assert.equal(isEventCreationAnchor(range), true);
});

test("requires a full 15-minute visual drag before creating a duration", () => {
  assert.equal(hasEventCreationDuration(14.99, 1), false);
  assert.equal(hasEventCreationDuration(15, 1), true);
  assert.equal(hasEventCreationDuration(-15, 1), true);
  assert.equal(hasEventCreationDuration(7.49, 0.5), false);
  assert.equal(hasEventCreationDuration(7.5, 0.5), true);
});

test("dragging promotes the anchor to a minimum 15-minute event", () => {
  const session = {
    anchorMinute: 600,
    calendarId: "calendar",
    dayIndex: 2,
  };

  assert.deepEqual(eventCreationRange(session, 601), {
    dayIndex: 2,
    endMinute: 615,
    startMinute: 600,
  });
  assert.equal(isEventCreationAnchor(eventCreationRange(session, 601)), false);
});

test("dragging farther preserves the snapped event duration", () => {
  assert.deepEqual(eventCreationRange({
    anchorMinute: 600,
    calendarId: "calendar",
    dayIndex: 2,
  }, 638), {
    dayIndex: 2,
    endMinute: 645,
    startMinute: 600,
  });
});

test("places a 30-minute draft immediately after or before an event", () => {
  const event = {
    start: new Date(2026, 7, 30, 10, 0).toISOString(),
    end: new Date(2026, 7, 30, 11, 15).toISOString(),
  };

  const after = adjacentEventCreationDates(event, "after");
  assert.deepEqual(parts(after.start), [2026, 8, 30, 11, 15]);
  assert.deepEqual(parts(after.end), [2026, 8, 30, 11, 45]);

  const before = adjacentEventCreationDates(event, "before");
  assert.deepEqual(parts(before.start), [2026, 8, 30, 9, 30]);
  assert.deepEqual(parts(before.end), [2026, 8, 30, 10, 0]);
});

test("maps adjacent draft dates to a visible calendar range", () => {
  const renderedDays = [
    new Date(2026, 7, 29),
    new Date(2026, 7, 30),
  ];

  assert.deepEqual(eventCreationRangeFromDates(
    new Date(2026, 7, 30, 11, 15),
    new Date(2026, 7, 30, 11, 45),
    renderedDays,
  ), {
    dayIndex: 1,
    endMinute: 705,
    startMinute: 675,
  });
  assert.equal(eventCreationRangeFromDates(
    new Date(2026, 7, 31, 11, 15),
    new Date(2026, 7, 31, 11, 45),
    renderedDays,
  ), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  adjacentEventCreationDates,
  currentEventCreationDates,
  eventCreationShortcutMode,
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

test("places a 15-minute draft immediately after or before an event", () => {
  const event = {
    start: new Date(2026, 7, 30, 10, 0).toISOString(),
    end: new Date(2026, 7, 30, 11, 15).toISOString(),
  };

  const after = adjacentEventCreationDates(event, "after");
  assert.deepEqual(parts(after.start), [2026, 8, 30, 11, 15]);
  assert.deepEqual(parts(after.end), [2026, 8, 30, 11, 30]);

  const before = adjacentEventCreationDates(event, "before");
  assert.deepEqual(parts(before.start), [2026, 8, 30, 9, 45]);
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


test("creation shortcuts preserve adjacent modes and recognize Option-modified physical N", () => {
  const event = {
    key: "n", code: "KeyN", altKey: false, metaKey: false,
    ctrlKey: false, shiftKey: false, repeat: false,
  };
  assert.equal(eventCreationShortcutMode(event), "after");
  assert.equal(eventCreationShortcutMode({ ...event, altKey: true, key: "Dead" }), "before");
  const now = { ...event, altKey: true, metaKey: true, key: "˜" };
  assert.equal(eventCreationShortcutMode(now), "now");
  assert.equal(eventCreationShortcutMode({ ...now, metaKey: false, ctrlKey: true }), "now");
  assert.equal(eventCreationShortcutMode({ ...event, metaKey: true }), null);
  assert.equal(eventCreationShortcutMode({ ...now, shiftKey: true }), null);
  assert.equal(eventCreationShortcutMode({ ...now, repeat: true }), null);
  assert.equal(eventCreationShortcutMode({ ...now, key: "x", code: "KeyX" }), null);
});

test("current event starts at the most recent quarter hour and lasts 15 minutes", () => {
  for (const minute of [0, 14, 15, 29, 30, 38, 44, 45, 59]) {
    const now = new Date(2026, 8, 13, 23, minute, 42, 123);
    const original = now.getTime();
    const { start, end } = currentEventCreationDates(now);
    assert.deepEqual(parts(start), [2026, 9, 13, 23, Math.floor(minute / 15) * 15]);
    assert.equal(start.getSeconds(), 0);
    assert.equal(start.getMilliseconds(), 0);
    assert.equal(end.getTime() - start.getTime(), 15 * 60_000);
    assert.equal(now.getTime(), original);
    if (minute >= 45) assert.deepEqual(parts(end), [2026, 9, 14, 0, 0]);
  }
});

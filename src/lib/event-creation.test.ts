import assert from "node:assert/strict";
import test from "node:test";
import {
  eventCreationAnchorRange,
  eventCreationRange,
  hasEventCreationDuration,
  isEventCreationAnchor,
} from "./event-creation";

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

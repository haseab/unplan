import assert from "node:assert/strict";
import test from "node:test";
import {
  eventCreationAnchorRange,
  eventCreationRange,
  isEventCreationAnchor,
} from "./event-creation";

test("pointer down creates a zero-duration visual anchor", () => {
  const range = eventCreationAnchorRange(2, 600);

  assert.deepEqual(range, {
    dayIndex: 2,
    endMinute: 600,
    startMinute: 600,
  });
  assert.equal(isEventCreationAnchor(range), true);
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

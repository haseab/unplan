import assert from "node:assert/strict";
import test from "node:test";
import {
  EVENT_DRAG_ACTIVATION_DISTANCE,
  isEventDragActivated,
} from "./event-drag";

test("ignores small pointer movements on calendar events", () => {
  assert.equal(
    isEventDragActivated(
      { startX: 100, startY: 100 },
      { clientX: 104, clientY: 104 },
    ),
    false,
  );
});

test("activates an event drag at the movement threshold", () => {
  assert.equal(
    isEventDragActivated(
      { startX: 100, startY: 100 },
      { clientX: 100 + EVENT_DRAG_ACTIVATION_DISTANCE, clientY: 100 },
    ),
    true,
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  findDirectionalEventKey,
  type EventNavigationRect,
} from "./event-keyboard-navigation";

const rect = (
  eventKey: string,
  left: number,
  top: number,
  width = 80,
  height = 40,
): EventNavigationRect => ({
  bottom: top + height,
  eventKey,
  left,
  right: left + width,
  top,
});

test("arrow navigation chooses the nearest event in the requested direction", () => {
  const anchor = rect("anchor", 100, 100);
  const candidates = [
    rect("left", 0, 110),
    rect("right", 210, 95),
    rect("up", 105, 15),
    rect("down", 95, 230),
  ];

  assert.equal(findDirectionalEventKey(anchor, candidates, "left"), "left");
  assert.equal(findDirectionalEventKey(anchor, candidates, "right"), "right");
  assert.equal(findDirectionalEventKey(anchor, candidates, "up"), "up");
  assert.equal(findDirectionalEventKey(anchor, candidates, "down"), "down");
});

test("multi-day segments belonging to the active event are skipped", () => {
  const anchor = rect("active", 100, 100);
  assert.equal(
    findDirectionalEventKey(
      anchor,
      [rect("active", 200, 100), rect("next", 300, 100)],
      "right",
    ),
    "next",
  );
});

test("navigation does not fall through to an event behind the requested direction", () => {
  const anchor = rect("anchor", 100, 100);
  assert.equal(
    findDirectionalEventKey(anchor, [rect("left", 0, 100)], "right"),
    null,
  );
});

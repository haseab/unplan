import assert from "node:assert/strict";
import test from "node:test";
import {
  findDirectionalEventKey,
  resolveEventNavigationAnchorKey,
  type EventNavigationRect,
} from "./event-keyboard-navigation";

const rect = (
  eventKey: string,
  dayIndex: number,
  left: number,
  top: number,
  width = 80,
  height = 40,
): EventNavigationRect => ({
  bottom: top + height,
  dayIndex,
  endMinute: top + height,
  eventKey,
  left,
  right: left + width,
  startMinute: top,
  top,
});

test("arrow navigation chooses the nearest event in the requested direction", () => {
  const anchor = rect("anchor", 1, 100, 100);
  const candidates = [
    rect("left", 0, 0, 100),
    rect("right", 2, 210, 100),
    rect("up", 1, 100, 15),
    rect("down", 1, 100, 230),
  ];

  assert.equal(findDirectionalEventKey(anchor, candidates, "left"), "left");
  assert.equal(findDirectionalEventKey(anchor, candidates, "right"), "right");
  assert.equal(findDirectionalEventKey(anchor, candidates, "up"), "up");
  assert.equal(findDirectionalEventKey(anchor, candidates, "down"), "down");
});

test("arrow navigation uses center-to-center distance", () => {
  const anchor = rect("anchor", 1, 100, 100);
  const candidates = [
    rect("closer-by-distance", 1, 160, 150),
    rect("closer-on-axis", 1, 100, 200),
  ];

  assert.equal(
    findDirectionalEventKey(anchor, candidates, "down"),
    "closer-by-distance",
  );
});

test("horizontal navigation does not skip the adjacent day", () => {
  const anchor = rect("anchor", 1, 100, 100);

  assert.equal(
    findDirectionalEventKey(
      anchor,
      [rect("later-match", 3, 320, 100)],
      "right",
    ),
    null,
  );
});

test("horizontal navigation visits overlapping matching events in the current day", () => {
  const anchor = rect("anchor", 1, 100, 100);
  const candidates = [
    rect("same-day", 1, 180, 100),
    rect("next-day", 2, 220, 100),
  ];

  assert.equal(findDirectionalEventKey(anchor, candidates, "right"), "same-day");
});

test("horizontal navigation requires identical start and end times", () => {
  const anchor = rect("anchor", 1, 100, 100);
  const candidates = [
    rect("different-time", 2, 210, 90),
    rect("matching-time", 2, 220, 100),
  ];

  assert.equal(
    findDirectionalEventKey(anchor, candidates, "right"),
    "matching-time",
  );
});

test("right falls down to the first later event in the adjacent day", () => {
  const anchor = rect("anchor", 1, 100, 100);
  const candidates = [
    rect("later", 2, 210, 240),
    rect("first-later", 2, 210, 180),
    rect("before", 2, 210, 80),
  ];

  assert.equal(
    findDirectionalEventKey(anchor, candidates, "right"),
    "first-later",
  );
});

test("left falls up to the last earlier event in the adjacent day", () => {
  const anchor = rect("anchor", 1, 100, 200);
  const candidates = [
    rect("earlier", 0, 0, 80),
    rect("last-earlier", 0, 0, 160),
    rect("after", 0, 0, 240),
  ];

  assert.equal(
    findDirectionalEventKey(anchor, candidates, "left"),
    "last-earlier",
  );
});

test("vertical navigation stays within the current day", () => {
  const anchor = rect("anchor", 1, 100, 100);
  const candidates = [
    rect("next-day", 2, 210, 150),
    rect("same-day", 1, 100, 260),
  ];

  assert.equal(findDirectionalEventKey(anchor, candidates, "down"), "same-day");
});

test("the selected event wins over stale browser focus", () => {
  assert.equal(
    resolveEventNavigationAnchorKey(
      "selected",
      "previously-focused",
      ["selected", "previously-focused"],
    ),
    "selected",
  );
});

test("browser focus is the fallback when there is no rendered selection", () => {
  assert.equal(
    resolveEventNavigationAnchorKey("not-rendered", "focused", ["focused"]),
    "focused",
  );
});

test("multi-day segments belonging to the active event are skipped", () => {
  const anchor = rect("active", 0, 100, 100);
  assert.equal(
    findDirectionalEventKey(
      anchor,
      [rect("active", 1, 200, 100), rect("next", 1, 300, 100)],
      "right",
    ),
    "next",
  );
});

test("navigation does not fall through to an event behind the requested direction", () => {
  const anchor = rect("anchor", 1, 100, 100);
  assert.equal(
    findDirectionalEventKey(anchor, [rect("left", 0, 0, 100)], "right"),
    null,
  );
});

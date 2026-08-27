import assert from "node:assert/strict";
import test from "node:test";
import {
  findEventNavigationBacktrackKey,
  findEventClosestToMiddleDayNoon,
  findDirectionalEventKey,
  isEventCalendarPickerShortcut,
  resolveEventNavigationAnchorKey,
  sidebarHorizontalArrowAction,
  type EventNavigationTransition,
  type EventNavigationRect,
} from "./event-keyboard-navigation";

test("C opens the calendar picker only for one selected event", () => {
  const shortcut = (overrides: Partial<Parameters<typeof isEventCalendarPickerShortcut>[0]> = {}) =>
    isEventCalendarPickerShortcut({
      altKey: false,
      key: "c",
      modifier: false,
      modalOpen: false,
      repeat: false,
      selectedCount: 1,
      shiftKey: false,
      ...overrides,
    });

  assert.equal(shortcut(), true);
  assert.equal(shortcut({ key: "C" }), true);
  assert.equal(shortcut({ selectedCount: 0 }), false);
  assert.equal(shortcut({ selectedCount: 2 }), false);
  assert.equal(shortcut({ modifier: true }), false);
  assert.equal(shortcut({ shiftKey: true }), false);
  assert.equal(shortcut({ repeat: true }), false);
  assert.equal(shortcut({ modalOpen: true }), false);
});

test("sidebar horizontal arrows only return left to the calendar", () => {
  const key = (value: string, editable = false) => sidebarHorizontalArrowAction({
    altKey: false,
    ctrlKey: false,
    editable,
    key: value,
    metaKey: false,
    shiftKey: false,
  });

  assert.equal(key("ArrowLeft"), "focus-calendar");
  assert.equal(key("ArrowRight"), "suppress");
  assert.equal(key("ArrowDown"), null);
  assert.equal(key("ArrowLeft", true), null);
  assert.equal(sidebarHorizontalArrowAction({
    altKey: false,
    ctrlKey: true,
    editable: false,
    key: "ArrowLeft",
    metaKey: false,
    shiftKey: false,
  }), null);
});

test("calendar focus fallback chooses the event nearest the middle day at noon", () => {
  assert.equal(
    findEventClosestToMiddleDayNoon([
      { dayIndex: 6, endMinute: 720, eventKey: "day-before", startMinute: 660 },
      { dayIndex: 7, endMinute: 780, eventKey: "middle-afternoon", startMinute: 750 },
      { dayIndex: 7, endMinute: 735, eventKey: "middle-noon", startMinute: 705 },
    ], 15),
    "middle-noon",
  );
});

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

test("horizontal navigation skips empty days", () => {
  const anchor = rect("anchor", 1, 100, 100);

  assert.equal(
    findDirectionalEventKey(
      anchor,
      [rect("later-match", 3, 320, 100)],
      "right",
    ),
    "later-match",
  );
});

test("horizontal navigation visits same-day events only when their times match", () => {
  const anchor = rect("anchor", 1, 100, 100);
  const candidates = [
    rect("same-time", 1, 180, 100),
    rect("different-time", 1, 0, 80),
    rect("next-day", 2, 220, 100),
  ];

  assert.equal(findDirectionalEventKey(anchor, candidates, "right"), "same-time");
  assert.equal(
    findDirectionalEventKey(anchor, [rect("different-time", 1, 0, 80)], "left"),
    null,
  );
});

test("horizontal navigation uses Euclidean distance across future days", () => {
  const anchor = rect("semester-reflection", 0, 25, 245, 230, 160);
  const candidates = [
    rect("weekly-ops-sync", 2, 529, 222, 218, 56),
    rect("reach-out-to-edson", 2, 529, 342, 218, 56),
    rect("safi", 1, 280, 821, 218, 357),
  ];

  assert.equal(
    findDirectionalEventKey(anchor, candidates, "right"),
    "reach-out-to-edson",
  );
});

test("horizontal distance is measured between event rectangles", () => {
  const anchor = rect("update-financial-plan-actual", 1, 100, 836, 318, 25);
  const candidates = [
    rect("finc-emails-slack", 2, 447, 242, 318, 25),
    rect("semester-reflection", 3, 795, 783, 318, 131),
  ];

  assert.equal(
    findDirectionalEventKey(anchor, candidates, "right"),
    "semester-reflection",
  );
});

test("horizontal navigation chooses the closest rectangle regardless of event size", () => {
  const anchor = rect("have-dante-talk", 1, 60, 283, 230, 67);
  const candidates = [
    rect("founders-open-campus", 2, 315, 710, 218, 205),
    rect("update-financial-plan", 2, 315, 259, 218, 28),
  ];

  assert.equal(
    findDirectionalEventKey(anchor, candidates, "right"),
    "update-financial-plan",
  );
});

test("opposite arrows backtrack the exact navigation path", () => {
  const history: EventNavigationTransition[] = [
    { direction: "right", fromEventKey: "a", toEventKey: "b" },
    { direction: "right", fromEventKey: "b", toEventKey: "c" },
  ];

  assert.equal(findEventNavigationBacktrackKey(history, "c", "left"), "b");
  history.pop();
  assert.equal(findEventNavigationBacktrackKey(history, "b", "left"), "a");
  assert.equal(findEventNavigationBacktrackKey(history, "b", "right"), null);
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

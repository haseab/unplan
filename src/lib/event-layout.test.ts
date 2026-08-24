import assert from "node:assert/strict";
import test from "node:test";
import { layoutTimedEventSegments, type TimedEventSegment } from "./event-layout";

const segment = (
  key: string,
  startMinute: number,
  endMinute: number,
  dayIndex = 0,
  sortOrder = 0,
): TimedEventSegment => ({ dayIndex, endMinute, key, sortOrder, startMinute });

test("events that meet at an edge remain full width", () => {
  const layouts = layoutTimedEventSegments([
    segment("first", 60, 90),
    segment("second", 90, 120),
  ]);

  assert.deepEqual(layouts.get("first"), {
    left: 0,
    overlapping: false,
    width: 1,
    zIndex: 0,
  });
  assert.deepEqual(layouts.get("second"), layouts.get("first"));
});

test("equal overlapping events split into equal-width columns", () => {
  const layouts = layoutTimedEventSegments([
    segment("first", 60, 120),
    segment("second", 75, 135),
  ]);

  assert.deepEqual(layouts.get("first"), {
    left: 0,
    overlapping: true,
    width: 0.5,
    zIndex: 0,
  });
  assert.deepEqual(layouts.get("second"), {
    left: 0.5,
    overlapping: true,
    width: 0.5,
    zIndex: 1,
  });
});

test("equal stacked events divide the available width evenly", () => {
  const layouts = layoutTimedEventSegments([
    segment("left", 60, 120, 0, 1),
    segment("middle", 60, 120, 0, 2),
    segment("right", 60, 120, 0, 3),
  ]);

  assert.equal(layouts.get("left")?.left, 0);
  assert.equal(layouts.get("left")?.width, 1 / 3);
  assert.equal(layouts.get("middle")?.left, 1 / 3);
  assert.equal(layouts.get("middle")?.width, 1 / 3);
  assert.equal(layouts.get("right")?.left, 2 / 3);
  assert.equal(layouts.get("right")?.width, 1 / 3);
});

test("four or more simultaneous events cascade with readable card widths", () => {
  const layouts = layoutTimedEventSegments([
    segment("first", 60, 120, 0, 1),
    segment("second", 60, 120, 0, 2),
    segment("third", 60, 120, 0, 3),
    segment("fourth", 60, 120, 0, 4),
    segment("fifth", 60, 120, 0, 5),
  ]);

  assert.equal(layouts.get("first")?.left, 0);
  assert.equal(layouts.get("first")?.width, 0.58);
  assert.ok(Math.abs((layouts.get("third")?.left ?? 0) - 0.21) < 1e-9);
  assert.ok(Math.abs((layouts.get("fifth")?.left ?? 0) - 0.42) < 1e-9);
  assert.equal(layouts.get("fifth")?.width, 0.58);
});

test("newer equal-duration events are placed farther right regardless of ID", () => {
  const layouts = layoutTimedEventSegments([
    segment("z-old", 60, 120, 0, 100),
    segment("a-new", 60, 120, 0, 200),
  ]);

  assert.equal(layouts.get("z-old")?.left, 0);
  assert.equal(layouts.get("a-new")?.left, 0.5);
});

test("a shorter event cascades over a longer event below its label", () => {
  const layouts = layoutTimedEventSegments([
    segment("long", 60, 240),
    segment("short", 120, 150),
  ]);

  assert.deepEqual(layouts.get("long"), {
    left: 0,
    overlapping: true,
    width: 1,
    zIndex: 0,
  });
  assert.deepEqual(layouts.get("short"), {
    left: 0.05,
    overlapping: true,
    width: 0.95,
    zIndex: 1,
  });
});

test("only a shorter row in the longer event label area moves to the right half", () => {
  const layouts = layoutTimedEventSegments([
    segment("long", 60, 240),
    segment("short", 75, 105),
  ]);

  assert.equal(layouts.get("long")?.left, 0);
  assert.equal(layouts.get("long")?.width, 1);
  assert.equal(layouts.get("short")?.left, 0.5);
  assert.equal(layouts.get("short")?.width, 0.5);
});

test("the longer event stays in the left column even when it starts later", () => {
  const layouts = layoutTimedEventSegments([
    segment("short", 45, 105),
    segment("long", 60, 240),
  ]);

  assert.equal(layouts.get("long")?.left, 0);
  assert.equal(layouts.get("short")?.left, 0.5);
});

test("a locally longer nested event keeps its full width behind its child", () => {
  const layouts = layoutTimedEventSegments([
    segment("long", 0, 240),
    segment("medium", 90, 150),
    segment("short", 105, 135),
  ]);

  assert.equal(layouts.get("long")?.width, 1);
  assert.deepEqual(layouts.get("medium"), {
    left: 0.05,
    overlapping: true,
    width: 0.95,
    zIndex: 1,
  });
  assert.deepEqual(layouts.get("short"), {
    left: 0.525,
    overlapping: true,
    width: 0.475,
    zIndex: 2,
  });
});

test("nested rows independently retain their available width", () => {
  const layouts = layoutTimedEventSegments([
    segment("long", 0, 300),
    segment("early-long", 90, 160),
    segment("early-middle", 100, 130),
    segment("early-right", 110, 140),
    segment("later", 150, 200),
  ]);

  assert.equal(layouts.get("early-long")?.left, 0.05);
  assert.equal(layouts.get("early-long")?.width, 0.95);
  assert.equal(layouts.get("later")?.left, 0.05 + 0.95 * 0.05);
  assert.equal(layouts.get("later")?.width, 0.95 * 0.95);
});

test("a later independent row gets the full inset width", () => {
  const layouts = layoutTimedEventSegments([
    segment("long", 0, 300),
    segment("early-left", 90, 150),
    segment("early-right", 100, 130),
    segment("later", 180, 210),
  ]);

  assert.equal(layouts.get("later")?.left, 0.05);
  assert.equal(layouts.get("later")?.width, 0.95);
});

test("a late longest event does not force its transitive conflict group into global lanes", () => {
  const layouts = layoutTimedEventSegments([
    segment("early-base", 60, 600),
    segment("early-child", 120, 150),
    segment("late-long", 540, 1440),
    segment("late-first", 555, 600),
    segment("late-second", 555, 600),
    segment("late-third", 555, 600),
  ]);

  assert.deepEqual(layouts.get("late-long"), {
    left: 0,
    overlapping: true,
    width: 1,
    zIndex: 0,
  });
  assert.deepEqual(layouts.get("early-base"), {
    left: 0.5,
    overlapping: true,
    width: 0.5,
    zIndex: 1,
  });
  assert.deepEqual(layouts.get("early-child"), {
    left: 0.525,
    overlapping: true,
    width: 0.475,
    zIndex: 2,
  });
});

test("events on different days never share a conflict group", () => {
  const layouts = layoutTimedEventSegments([
    segment("monday", 60, 120, 0),
    segment("tuesday", 60, 120, 1),
  ]);

  assert.equal(layouts.get("monday")?.overlapping, false);
  assert.equal(layouts.get("tuesday")?.overlapping, false);
});

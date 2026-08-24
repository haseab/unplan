import assert from "node:assert/strict";
import test from "node:test";
import {
  addMarqueeSelection,
  visibleEventIdsIntersectingRectangle,
  type MarqueeHitRegion,
} from "./marquee-selection";

const region = (
  eventId: string,
  left: number,
  right: number,
  stackIndex: number,
  top = 0,
  bottom = 100,
): MarqueeHitRegion => ({
  bottom,
  eventId,
  left,
  right,
  stackIndex,
  top,
});

test("selects only the top event when the marquee touches an occluded area", () => {
  const matches = visibleEventIdsIntersectingRectangle([
    region("left", 0, 100, 0),
    region("right", 50, 100, 1),
  ], {
    bottom: 80,
    left: 70,
    right: 90,
    top: 20,
  });

  assert.deepEqual([...matches], ["right"]);
});

test("selects an underlying event where its visible area is touched", () => {
  const matches = visibleEventIdsIntersectingRectangle([
    region("base", 0, 100, 0),
    region("overlay", 50, 100, 1, 25, 75),
  ], {
    bottom: 90,
    left: 70,
    right: 90,
    top: 70,
  });

  assert.deepEqual([...matches].sort(), ["base", "overlay"]);
});

test("does not select an event when rectangles only share an edge", () => {
  const matches = visibleEventIdsIntersectingRectangle([
    region("event", 0, 50, 0),
  ], {
    bottom: 100,
    left: 50,
    right: 75,
    top: 0,
  });

  assert.equal(matches.size, 0);
});

test("handles an occluded area covered by multiple higher events", () => {
  const matches = visibleEventIdsIntersectingRectangle([
    region("base", 0, 100, 0),
    region("top-half", 50, 100, 1, 0, 50),
    region("bottom-half", 50, 100, 2, 50, 100),
  ], {
    bottom: 100,
    left: 60,
    right: 90,
    top: 0,
  });

  assert.deepEqual([...matches].sort(), ["bottom-half", "top-half"]);
});

test("multiple marquee selections accumulate their event IDs", () => {
  const firstMarquee = addMarqueeSelection(
    new Set<string>(),
    new Set(["first", "second"]),
  );
  const secondMarquee = addMarqueeSelection(
    firstMarquee,
    new Set(["third", "fourth"]),
  );

  assert.deepEqual(
    [...secondMarquee].sort(),
    ["first", "fourth", "second", "third"],
  );
});

test("recomputing an active marquee preserves only its base and current hits", () => {
  const base = new Set(["already-selected"]);
  const expanded = addMarqueeSelection(base, new Set(["temporary", "kept"]));
  const contracted = addMarqueeSelection(base, new Set(["kept"]));

  assert.deepEqual([...expanded].sort(), ["already-selected", "kept", "temporary"]);
  assert.deepEqual([...contracted].sort(), ["already-selected", "kept"]);
});

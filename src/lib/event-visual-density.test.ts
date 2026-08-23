import assert from "node:assert/strict";
import test from "node:test";
import {
  eventContentLayout,
  eventVisualDensity,
} from "./event-visual-density";

test("event content progressively adapts to its rendered height", () => {
  assert.equal(eventVisualDensity(7), "bar");
  assert.equal(eventVisualDensity(11), "title");
  assert.equal(eventVisualDensity(33), "title");
  assert.equal(eventVisualDensity(34), "time");
  assert.equal(eventVisualDensity(57), "time");
  assert.equal(eventVisualDensity(58), "details");
});

test("event content uses remaining vertical lines for supplemental details", () => {
  assert.deepEqual(eventContentLayout(7, 1, true), {
    density: "bar",
    showLocation: false,
    timeLabelKind: "none",
  });
  assert.deepEqual(eventContentLayout(24, 1, true), {
    density: "title",
    showLocation: false,
    timeLabelKind: "start",
  });
  assert.equal(eventContentLayout(39, 2, false).timeLabelKind, "none");
  assert.equal(eventContentLayout(39, 1, false).timeLabelKind, "range");
  assert.deepEqual(eventContentLayout(58, 2, true), {
    density: "details",
    showLocation: true,
    timeLabelKind: "range",
  });
});

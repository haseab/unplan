import assert from "node:assert/strict";
import test from "node:test";
import { eventVisualDensity } from "./event-visual-density";

test("event content progressively adapts to its rendered height", () => {
  assert.equal(eventVisualDensity(7), "bar");
  assert.equal(eventVisualDensity(11), "title");
  assert.equal(eventVisualDensity(33), "title");
  assert.equal(eventVisualDensity(34), "time");
  assert.equal(eventVisualDensity(57), "time");
  assert.equal(eventVisualDensity(58), "details");
});

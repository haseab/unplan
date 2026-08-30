import assert from "node:assert/strict";
import test from "node:test";
import { matchesSearchKeywords } from "./keyword-search";

test("matches non-contiguous and partially typed keywords", () => {
  assert.equal(
    matchesSearchKeywords("Optimizing to make costs cheaper", "optimiz costs"),
    true,
  );
});

test("requires every keyword to match", () => {
  assert.equal(matchesSearchKeywords("Optimizing performance", "optimiz costs"), false);
  assert.equal(matchesSearchKeywords("Reducing costs", "optimiz costs"), false);
});

test("normalizes whitespace and letter case", () => {
  assert.equal(matchesSearchKeywords("Launch COST Optimization", " cost   optim "), true);
});

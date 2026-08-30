import assert from "node:assert/strict";
import test from "node:test";
import { adjacentListItemId, updateListSelection } from "./list-selection";

const orderedIds = ["first", "second", "third", "fourth"];

test("plain selection replaces the current list selection", () => {
  const result = updateListSelection({
    anchorId: "first",
    intent: "replace",
    itemId: "third",
    orderedIds,
    selection: new Set(["first", "second"]),
  });
  assert.deepEqual([...result.selection], ["third"]);
  assert.equal(result.anchorId, "third");
});

test("toggle selection preserves the other selected items", () => {
  const result = updateListSelection({
    anchorId: "first",
    intent: "toggle",
    itemId: "third",
    orderedIds,
    selection: new Set(["first"]),
  });
  assert.deepEqual([...result.selection], ["first", "third"]);
});

test("range selection includes every visible item from the anchor", () => {
  const result = updateListSelection({
    anchorId: "second",
    intent: "range",
    itemId: "fourth",
    orderedIds,
    selection: new Set(["second"]),
  });
  assert.deepEqual([...result.selection], ["second", "third", "fourth"]);
  assert.equal(result.anchorId, "second");
});

test("keyboard ranges expand, contract to the anchor, then expand past it", () => {
  let focusId = "third";
  const anchorId = focusId;
  let selection = new Set([focusId]);
  const navigate = (direction: "next" | "previous") => {
    const itemId = adjacentListItemId(orderedIds, focusId, direction);
    assert.ok(itemId);
    focusId = itemId;
    selection = updateListSelection({
      anchorId,
      intent: "range",
      itemId,
      orderedIds,
      selection,
    }).selection;
    return [...selection];
  };

  assert.deepEqual(navigate("previous"), ["second", "third"]);
  assert.deepEqual(navigate("previous"), ["first", "second", "third"]);
  assert.deepEqual(navigate("next"), ["second", "third"]);
  assert.deepEqual(navigate("next"), ["third"]);
  assert.deepEqual(navigate("next"), ["third", "fourth"]);
});

test("navigates to adjacent visible list items without wrapping", () => {
  assert.equal(adjacentListItemId(orderedIds, "second", "previous"), "first");
  assert.equal(adjacentListItemId(orderedIds, "second", "next"), "third");
  assert.equal(adjacentListItemId(orderedIds, "first", "previous"), null);
  assert.equal(adjacentListItemId(orderedIds, "fourth", "next"), null);
});

import { advanceKeyboardSelection } from "./list-selection";
import assert from "node:assert/strict";
import test from "node:test";
import {
  adjacentListItemId,
  listItemIdAfterRemoval,
  updateListSelection,
} from "./list-selection";

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

test("post-removal selection prefers the next item and falls back to the previous item", () => {
  assert.equal(listItemIdAfterRemoval({
    orderedIds,
    removedIds: new Set(["second"]),
  }), "third");
  assert.equal(listItemIdAfterRemoval({
    orderedIds,
    removedIds: new Set(["second", "third"]),
  }), "fourth");
  assert.equal(listItemIdAfterRemoval({
    orderedIds,
    removedIds: new Set(["fourth"]),
  }), "third");
  assert.equal(listItemIdAfterRemoval({
    orderedIds,
    removedIds: new Set(orderedIds),
  }), null);
});


test("Shift ranges contract and plain arrows preserve earlier selections", () => {
  let state = advanceKeyboardSelection(new Set(["a"]), "a", "b", true, null);
  state = advanceKeyboardSelection(state.selection, "b", "c", true, state.range);
  assert.deepEqual([...state.selection], ["a", "b", "c"]);
  state = advanceKeyboardSelection(state.selection, "c", "b", true, state.range);
  assert.deepEqual([...state.selection], ["a", "b"]);
  state = advanceKeyboardSelection(state.selection, "b", "d", false, state.range);
  assert.deepEqual([...state.selection], ["a", "b"]);
  state = advanceKeyboardSelection(state.selection, "d", "e", true, state.range);
  assert.deepEqual([...state.selection], ["a", "b", "d", "e"]);
  state = advanceKeyboardSelection(state.selection, "e", "d", true, state.range);
  assert.deepEqual([...state.selection], ["a", "b", "d"]);
});

test("releasing Shift starts a fresh range over the preserved selection", () => {
  const first = advanceKeyboardSelection(new Set(["a"]), "a", "b", true, null);
  const second = advanceKeyboardSelection(first.selection, "b", "c", true, null);
  const reversed = advanceKeyboardSelection(second.selection, "c", "b", true, second.range);
  assert.deepEqual([...reversed.selection], ["a", "b"]);
});

test("Escape-cleared selection and horizontal backtracking start from current focus", () => {
  let state = advanceKeyboardSelection(new Set(["a"]), "a", "right", true, null);
  state = advanceKeyboardSelection(state.selection, "right", "a", true, state.range);
  assert.deepEqual([...state.selection], ["a"]);
  state = advanceKeyboardSelection(state.selection, "a", "left", true, state.range);
  assert.deepEqual([...state.selection], ["a", "left"]);
  state = advanceKeyboardSelection(new Set(), "left", "next", true, state.range);
  assert.deepEqual([...state.selection], ["left", "next"]);
  assert.deepEqual([...advanceKeyboardSelection(new Set(), "next", "last", false, null).selection], ["last"]);
});


test("a new subtractive gesture removes 3, 2, then 1 without affecting 5 and 6", () => {
  const initial = new Set(["1", "2", "3", "5", "6"]);
  let state = advanceKeyboardSelection(initial, "3", "2", true, null);
  assert.deepEqual([...state.selection], ["1", "2", "5", "6"]);
  state = advanceKeyboardSelection(state.selection, "2", "1", true, state.range);
  assert.deepEqual([...state.selection], ["1", "5", "6"]);
  state = advanceKeyboardSelection(state.selection, "1", "1", true, state.range);
  assert.deepEqual([...state.selection], ["5", "6"]);
  state = advanceKeyboardSelection(state.selection, "1", "2", true, state.range);
  assert.deepEqual([...state.selection], ["1", "2", "5", "6"]);
  state = advanceKeyboardSelection(state.selection, "2", "3", true, state.range);
  assert.deepEqual([...state.selection], [...initial]);
});

test("subtraction remains subtractive when moving beyond the selected range", () => {
  let state = advanceKeyboardSelection(new Set(["1", "2", "3", "5", "6"]), "3", "2", true, null);
  state = advanceKeyboardSelection(state.selection, "2", "1", true, state.range);
  state = advanceKeyboardSelection(state.selection, "1", "0", true, state.range);
  assert.deepEqual([...state.selection], ["5", "6"]);
});

test("navigation after an operation returns to a single destination from the saved cursor", () => {
  const selection = new Set(["1", "2", "3", "5", "6"]);
  const next = advanceKeyboardSelection(selection, "3", "4", false, null, true);
  assert.deepEqual([...next.selection], ["4"]);
  const back = advanceKeyboardSelection(next.selection, "4", "3", false, next.range);
  assert.deepEqual([...back.selection], ["3"]);
  const shifted = advanceKeyboardSelection(selection, "3", "4", true, null, true);
  assert.deepEqual([...shifted.selection], ["1", "2", "3", "5", "6", "4"]);
});

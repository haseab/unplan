import assert from "node:assert/strict";
import test from "node:test";
import { handlePriorityReviewKeyDown } from "./priority-review-keyboard";

function press(key: string, options: Partial<KeyboardEvent> = {}, editing = false, inputValue = "7d", undoAvailable = true) {
  const calls: string[] = [];
  const target = Object.assign(new EventTarget(), { tagName: editing ? "INPUT" : "SECTION", value: inputValue });
  target.addEventListener("keydown", (event) => handlePriorityReviewKeyDown(event as KeyboardEvent, {
    confirm: () => calls.push("confirm"),
    undo: () => { calls.push("undo"); return undoAvailable; },
    submit: () => calls.push("submit"),
    close: () => calls.push("close"),
    focusNext: (backward) => calls.push(backward ? "previous" : "next"),
  }));
  target.addEventListener("keydown", () => calls.push("background"));
  const event = Object.assign(new Event("keydown", { cancelable: true }), {
    key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false, ...options,
  });
  target.dispatchEvent(event);
  return { calls, prevented: event.defaultPrevented };
}

test("all navigation is isolated from background selection, including modifiers and repeats", () => {
  for (const key of ["ArrowDown", "Home", "End", "PageUp", "PageDown"]) {
    assert.deepEqual(press(key), { calls: [], prevented: true });
  }
  assert.deepEqual(press("ArrowLeft"), { calls: [], prevented: true });
  assert.deepEqual(press("ArrowRight"), { calls: [], prevented: true });
  assert.deepEqual(press("ArrowLeft", { metaKey: true }), { calls: [], prevented: true });
  assert.deepEqual(press("ArrowRight", { repeat: true }), { calls: [], prevented: true });
  assert.deepEqual(press("a").calls, []);
});

test("Delete and Backspace never mutate follow-up tasks", () => {
  for (const key of ["Delete", "Backspace"]) {
    assert.deepEqual(press(key), { calls: [], prevented: true });
    assert.deepEqual(press(key, { repeat: true }), { calls: [], prevented: true });
  }
});

test("modal retains Undo, submit, close and trapped Tab navigation", () => {
  assert.deepEqual(press("z", { metaKey: true }).calls, ["undo"]);
  assert.deepEqual(press("z", { ctrlKey: true }).calls, ["undo"]);
  assert.deepEqual(press("Enter", { metaKey: true }).calls, ["submit"]);
  assert.deepEqual(press("Escape").calls, ["close"]);
  assert.deepEqual(press("Tab"), { calls: ["next"], prevented: true });
  assert.deepEqual(press("Tab", { shiftKey: true }), { calls: ["previous"], prevented: true });
});

test("Up stays isolated and never retriages a follow-up task", () => {
  assert.deepEqual(press("ArrowUp"), { calls: [], prevented: true });
  for (const options of [{ repeat: true }, { metaKey: true }, { ctrlKey: true }, { altKey: true }, { shiftKey: true }]) {
    assert.deepEqual(press("ArrowUp", options), { calls: [], prevented: true });
  }
});

test("typing in the follow-up field preserves native editing and never resolves a card", () => {
  for (const key of ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "Enter", "7"]) {
    assert.deepEqual(press(key, {}, true), { calls: [], prevented: false });
  }
  assert.deepEqual(press("z", { metaKey: true }, true), { calls: [], prevented: false });
  assert.deepEqual(press("Escape", {}, true).calls, ["close"]);
  assert.deepEqual(press("Tab", {}, true).calls, ["next"]);
});

test("Enter confirms a date from outside the input", () => {
  assert.deepEqual(press("Enter"), { calls: ["confirm"], prevented: true });
});

test("Cmd/Ctrl Z undoes the last submitted task while the default input stays focused", () => {
  for (const modifier of [{ metaKey: true }, { ctrlKey: true }]) {
    assert.deepEqual(press("z", modifier, true, ""), { calls: ["undo"], prevented: true });
    assert.deepEqual(press("z", { ...modifier, repeat: true }, true, ""), { calls: [], prevented: true });
    assert.deepEqual(press("z", modifier, true, "61 min"), { calls: [], prevented: false });
  }
});

test("empty-field Undo falls back to native editing when there is no pending task action", () => {
  assert.deepEqual(press("z", { metaKey: true }, true, "", false), { calls: ["undo"], prevented: false });
  assert.deepEqual(press("z", { metaKey: true, shiftKey: true }, true, ""), { calls: [], prevented: false });
});

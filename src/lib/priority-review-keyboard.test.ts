import assert from "node:assert/strict";
import test from "node:test";
import { handlePriorityReviewKeyDown } from "./priority-review-keyboard";

function press(key: string, options: Partial<KeyboardEvent> = {}) {
  const calls: string[] = [];
  const target = new EventTarget();
  target.addEventListener("keydown", (event) => handlePriorityReviewKeyDown(event as KeyboardEvent, {
    resolve: (action) => calls.push(action),
    undo: () => calls.push("undo"),
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
  for (const key of ["ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]) {
    assert.deepEqual(press(key), { calls: [], prevented: true });
  }
  assert.deepEqual(press("ArrowLeft"), { calls: ["left"], prevented: true });
  assert.deepEqual(press("ArrowRight"), { calls: ["right"], prevented: true });
  assert.deepEqual(press("ArrowLeft", { metaKey: true }), { calls: [], prevented: true });
  assert.deepEqual(press("ArrowRight", { repeat: true }), { calls: [], prevented: true });
  assert.deepEqual(press("a").calls, []);
});

test("Delete and Mac Backspace delete the review card once per keypress", () => {
  for (const key of ["Delete", "Backspace"]) {
    assert.deepEqual(press(key), { calls: ["delete"], prevented: true });
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

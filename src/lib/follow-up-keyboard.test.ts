import assert from "node:assert/strict";
import test from "node:test";
import { followUpReviewAction, isFollowUpCreationShortcut } from "./follow-up-keyboard";
const key = { key: "f", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false };
const context = { calendarActive: true, selectedCount: 1, editable: false, modalOpen: false };
test("F applies only to one selected calendar event outside text inputs and modals", () => {
  assert.equal(isFollowUpCreationShortcut(key, context), true);
  for (const override of [{ calendarActive: false }, { selectedCount: 0 }, { selectedCount: 2 }, { editable: true }, { modalOpen: true }]) assert.equal(isFollowUpCreationShortcut(key, { ...context, ...override }), false);
  for (const override of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { shiftKey: true }, { repeat: true }, { key: "e" }]) assert.equal(isFollowUpCreationShortcut({ ...key, ...override }, context), false);
});
test("review arrows resolve; only modified delete stops follow-ups", () => {
  assert.equal(followUpReviewAction({ ...key, key: "ArrowLeft" }), "schedule");
  assert.equal(followUpReviewAction({ ...key, key: "ArrowRight" }), "skip");
  assert.equal(followUpReviewAction({ ...key, key: "Backspace" }), null);
  assert.equal(followUpReviewAction({ ...key, key: "Delete" }), null);
  assert.equal(followUpReviewAction({ ...key, key: "Backspace", metaKey: true }), "stop");
  assert.equal(followUpReviewAction({ ...key, key: "Delete", ctrlKey: true }), "stop");
  assert.equal(followUpReviewAction({ ...key, key: "ArrowLeft", metaKey: true }), null);
  assert.equal(followUpReviewAction({ ...key, key: "ArrowLeft", repeat: true }), null);
});

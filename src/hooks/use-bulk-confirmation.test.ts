import assert from "node:assert/strict";
import test from "node:test";
import {
  requiresBulkConfirmation,
  TASK_DELETE_CONFIRMATION_THRESHOLD,
} from "./use-bulk-confirmation";

test("task deletion confirms only above three selected tasks", () => {
  assert.equal(requiresBulkConfirmation({ action: "delete", count: 3, threshold: TASK_DELETE_CONFIRMATION_THRESHOLD }), false);
  assert.equal(requiresBulkConfirmation({ action: "delete", count: 4, threshold: TASK_DELETE_CONFIRMATION_THRESHOLD }), true);
});

test("moves never require bulk confirmation", () => {
  assert.equal(requiresBulkConfirmation({ action: "move", count: 6 }), false);
  assert.equal(requiresBulkConfirmation({ action: "move", count: 6, threshold: 1 }), false);
});

test("other bulk actions retain the default confirmation threshold", () => {
  assert.equal(requiresBulkConfirmation({ action: "create", count: 3 }), true);
  assert.equal(requiresBulkConfirmation({ action: "delete", count: 3 }), true);
  assert.equal(requiresBulkConfirmation({ action: "update", count: 3 }), true);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  requiresBulkConfirmation,
  TASK_DELETE_CONFIRMATION_THRESHOLD,
} from "./use-bulk-confirmation";

test("task deletion confirms only above three selected tasks", () => {
  assert.equal(requiresBulkConfirmation({ count: 3, threshold: TASK_DELETE_CONFIRMATION_THRESHOLD }), false);
  assert.equal(requiresBulkConfirmation({ count: 4, threshold: TASK_DELETE_CONFIRMATION_THRESHOLD }), true);
});

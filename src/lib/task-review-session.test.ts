import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyTaskReviewSession,
  pendingTaskReviews,
  previousSkippedTaskId,
  previousTaskReview,
  skipTaskReview,
} from "./task-review-session";

const tasks = [{ id: "a" }, { id: "b" }, { id: "c" }];
const ids = (items: readonly { id: string }[]) => items.map(({ id }) => id);

test("back walks skipped tasks in reverse order and forward can resume", () => {
  const initial = emptyTaskReviewSession();
  const first = skipTaskReview(initial, "a");
  const second = skipTaskReview(first, "b");
  assert.deepEqual(ids(pendingTaskReviews(tasks, second)), ["c"]);
  const back = previousTaskReview(second, tasks);
  assert.deepEqual(ids(pendingTaskReviews(tasks, back)), ["b", "c"]);
  const backAgain = previousTaskReview(back, tasks);
  assert.deepEqual(ids(pendingTaskReviews(tasks, backAgain)), ["a", "b", "c"]);
  assert.deepEqual(ids(pendingTaskReviews(tasks, skipTaskReview(backAgain, "a"))), ["b", "c"]);
  assert.deepEqual(initial, emptyTaskReviewSession());
  assert.deepEqual(ids(tasks), ["a", "b", "c"]);
});

test("back focuses the previous skipped task even after incoming tasks reorder the queue", () => {
  const session = skipTaskReview(skipTaskReview(emptyTaskReviewSession(), "a"), "b");
  const reordered = [{ id: "new" }, ...tasks];
  const back = previousTaskReview(session, reordered);
  assert.deepEqual(ids(pendingTaskReviews(reordered, back)), ["b", "new", "c"]);
});

test("back ignores skipped tasks that have since been filed or removed", () => {
  const session = skipTaskReview(skipTaskReview(emptyTaskReviewSession(), "a"), "b");
  const available = tasks.filter(({ id }) => id !== "b");
  assert.equal(previousSkippedTaskId(session, available), "a");
  assert.deepEqual(ids(pendingTaskReviews(available, previousTaskReview(session, available))), ["a", "c"]);
  assert.equal(previousSkippedTaskId(session, []), null);
  assert.equal(previousTaskReview(session, []), session);
});

test("back is a no-op at the beginning and a fresh session restores every skipped task", () => {
  const initial = emptyTaskReviewSession();
  assert.equal(previousTaskReview(initial, tasks), initial);
  assert.equal(previousSkippedTaskId(initial, tasks), null);
  const skipped = skipTaskReview(initial, "a");
  assert.deepEqual(ids(pendingTaskReviews(tasks, skipped)), ["b", "c"]);
  assert.deepEqual(ids(pendingTaskReviews(tasks, emptyTaskReviewSession())), ["a", "b", "c"]);
});

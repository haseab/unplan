import assert from "node:assert/strict";
import test from "node:test";
import {
  clearActionToastResourceHold,
  getActionToastSyncSnapshot,
  hasPendingActionToast,
  queueActionToast,
  setActionToastResourceHold,
  triggerToastSubmit,
  triggerToastUndo,
} from "./action-toast";

globalThis.requestAnimationFrame = (callback: FrameRequestCallback) =>
  setTimeout(() => callback(Date.now()), 0) as unknown as number;

const pendingOptions = (
  onSubmit: () => void,
  onUndo: () => void,
  coalesceKey: string,
) => ({
  coalesceKey,
  duration: 60_000,
  onSubmit,
  onUndo,
});

test("keyboard submit commits pending actions from oldest to newest", async () => {
  const submitted: string[] = [];
  queueActionToast(
    "Created event",
    pendingOptions(
      () => { submitted.push("create"); },
      () => {},
      "event-create:test-event",
    ),
  );
  queueActionToast(
    "Updated event",
    pendingOptions(
      () => { submitted.push("update"); },
      () => {},
      "event-change:test-event",
    ),
  );

  assert.equal(triggerToastSubmit(), true);
  assert.equal(triggerToastSubmit(), true);
  assert.deepEqual(submitted, ["create", "update"]);
  assert.equal(hasPendingActionToast(), false);

  await Promise.resolve();
});

test("keyboard undo removes only the newest pending action", async () => {
  const undone: string[] = [];
  const submitted: string[] = [];
  queueActionToast(
    "Created event",
    pendingOptions(
      () => { submitted.push("create"); },
      () => { undone.push("create"); },
      "event-create:undo-event",
    ),
  );
  queueActionToast(
    "Updated event",
    pendingOptions(
      () => { submitted.push("update"); },
      () => { undone.push("update"); },
      "event-change:undo-event",
    ),
  );

  assert.equal(triggerToastUndo(), true);
  assert.deepEqual(undone, ["update"]);
  assert.equal(hasPendingActionToast(), true);
  assert.equal(triggerToastSubmit(), true);
  assert.deepEqual(submitted, ["create"]);

  await Promise.resolve();
});

test("a pending resource is paused only while an editing hold is active", async () => {
  queueActionToast("Updated event", {
    ...pendingOptions(() => {}, () => {}, "event-change:focused-event"),
    resourceIds: ["focused-event"],
  });

  assert.deepEqual(getActionToastSyncSnapshot().pausedResourceIds, []);
  setActionToastResourceHold("event-details", ["focused-event"]);
  assert.deepEqual(getActionToastSyncSnapshot().pausedResourceIds, ["focused-event"]);
  clearActionToastResourceHold("event-details");
  assert.deepEqual(getActionToastSyncSnapshot().pausedResourceIds, []);
  assert.equal(triggerToastSubmit(), true);

  await Promise.resolve();
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  clearActionToastResourceHold,
  getActionToastSyncSnapshot,
  hasPendingActionToast,
  hasActiveResourceCreation,
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

test("keyboard submit commits all pending actions from oldest to newest", async () => {
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
  assert.deepEqual(submitted, ["create", "update"]);
  assert.equal(triggerToastSubmit(), false);
  assert.equal(hasPendingActionToast(), false);

  await Promise.resolve();
});

test("immediate actions skip the pending queue and submit at creation", async () => {
  let submitted = 0;
  queueActionToast("Moved event", {
    ...pendingOptions(
      () => { submitted += 1; },
      () => {},
      "event-change:immediate-event",
    ),
    submitImmediately: true,
  });

  assert.equal(submitted, 1);
  assert.equal(hasPendingActionToast(), false);

  await Promise.resolve();
});

test("a dependent event mutation waits for its pending creation", async () => {
  const submitted: string[] = [];
  let releaseCreation!: () => void;
  const creationGate = new Promise<void>((resolve) => {
    releaseCreation = resolve;
  });

  queueActionToast("Duplicated event", {
    ...pendingOptions(
      async () => {
        submitted.push("create-start");
        await creationGate;
        submitted.push("create-end");
      },
      () => {},
      "event-create:dependent-event",
    ),
    createsResourceIds: ["dependent-event"],
    resourceIds: ["dependent-event"],
  });
  assert.equal(hasActiveResourceCreation("dependent-event"), true);
  queueActionToast("Moved event", {
    ...pendingOptions(
      () => { submitted.push("move"); },
      () => {},
      "event-change:dependent-event",
    ),
    resourceIds: ["dependent-event"],
  });

  assert.equal(triggerToastSubmit(), true);

  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(submitted, ["create-start"]);
  assert.equal(hasActiveResourceCreation("dependent-event"), true);

  releaseCreation();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(submitted, ["create-start", "create-end", "move"]);
  assert.equal(hasActiveResourceCreation("dependent-event"), false);
  assert.equal(hasPendingActionToast(), false);
});

test("a dependent event mutation is not sent when creation fails", async () => {
  let moveSubmitted = false;
  let moveRolledBack = false;

  queueActionToast("Duplicated event", {
    ...pendingOptions(
      () => { throw new Error("creation failed"); },
      () => {},
      "event-create:failed-dependent-event",
    ),
    createsResourceIds: ["failed-dependent-event"],
    resourceIds: ["failed-dependent-event"],
  });
  queueActionToast("Moved event", {
    ...pendingOptions(
      () => { moveSubmitted = true; },
      () => {},
      "event-change:failed-dependent-event",
    ),
    onError: () => { moveRolledBack = true; },
    resourceIds: ["failed-dependent-event"],
    submitImmediately: true,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(moveSubmitted, false);
  assert.equal(moveRolledBack, true);
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

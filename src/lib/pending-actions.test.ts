import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createPendingActionStore, type PendingActionOptions } from "./pending-actions";

function clock() {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  return {
    now: () => now,
    schedule: (run: () => void, delay: number) => { timers.set(++id, { at: now + delay, run }); return id; },
    cancel: (timer: unknown) => { timers.delete(Number(timer)); },
    advance: (duration: number) => {
      const end = now + duration;
      while (true) {
        const entry = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        timers.delete(entry[0]); now = entry[1].at; entry[1].run();
      }
      now = end;
    },
  };
}
const options = (overrides: Partial<PendingActionOptions> = {}): PendingActionOptions => ({
  duration: 1000, onUndo: () => {}, onSubmit: () => {}, ...overrides,
});
function gate() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("queue acceptance, versioned commands and provider completion are distinct", async () => {
  const store = createPendingActionStore(clock());
  const saved = gate();
  const action = store.queue("Updated event", options({ resourceIds: ["event"], onSubmit: () => saved.promise }));
  const queued = store.getOperation(action.id)!;
  assert.equal(queued.phase, "queued");
  assert.deepEqual(queued.allowedCommands, ["undo", "submit", "cancel"]);
  assert.equal(Object.isFrozen(queued.resourceIds), true);
  store.refresh("missing", "ignored", 1000);
  assert.equal(store.command(action.id, "submit", queued.revision + 1), false);
  assert.equal(store.command(action.id, "submit", queued.revision), true);
  assert.equal(store.getOperation(action.id)?.phase, "running");
  assert.equal(store.hasPending(), false);
  assert.equal(store.hasActive(), true);
  assert.equal(action.undo(), false);
  assert.deepEqual(store.getOperation(action.id)?.allowedCommands, []);
  saved.resolve();
  assert.equal(await action.completion, true);
  assert.equal(store.getOperation(action.id)?.phase, "complete");
  assert.equal(store.hasActive(), false);
  assert.equal(action.submit(), false);
});

test("multiple holds preserve the remaining undo deadline with a fake clock", async () => {
  const time = clock();
  const store = createPendingActionStore(time);
  let writes = 0;
  const action = store.queue("Move", options({ resourceIds: ["event"], onSubmit: () => { writes++; } }));
  time.advance(400);
  store.hold("editor", ["event"]);
  store.hold("pointer", ["event"]);
  assert.equal(store.getOperation(action.id)?.phase, "paused");
  assert.deepEqual(store.getOperation(action.id)?.blockers, ["resource-held"]);
  assert.equal(store.getOperation(action.id)?.undoUntil, undefined);
  time.advance(5000);
  store.release("editor");
  assert.equal(store.getOperation(action.id)?.phase, "paused");
  assert.equal(writes, 0);
  store.release("pointer");
  assert.equal(store.getOperation(action.id)?.undoUntil, time.now() + 600);
  time.advance(599); assert.equal(writes, 0);
  time.advance(1); assert.equal(writes, 1);
  assert.equal(await action.completion, true);
});

test("coalescing preserves the original undo and the newest submitted value", async () => {
  const time = clock();
  const store = createPendingActionStore(time);
  const calls: string[] = [];
  const first = store.queue("First", options({ coalesceKey: "event", onUndo: () => { calls.push("original"); } }));
  const second = store.queue("Second", options({ coalesceKey: "event", onUndo: () => { calls.push("new"); } }));
  assert.equal(first, second);
  assert.equal(second.undo(), true);
  assert.equal(await first.completion, false);
  time.advance(5000); assert.deepEqual(calls, ["original"]);
  const third = store.queue("Third", options({ coalesceKey: "event", onSubmit: () => { calls.push("old-value"); } }));
  store.queue("Fourth", options({ coalesceKey: "event", onSubmit: () => { calls.push("latest-value"); } }));
  third.submit(); await third.completion;
  assert.deepEqual(calls, ["original", "latest-value"]);
});

test("a failed creation blocks its dependent write and exposes the dependency", async () => {
  const store = createPendingActionStore(clock());
  const create = gate();
  let updates = 0;
  const creation = store.queue("Create", options({ createsResourceIds: ["event"], onSubmit: () => create.promise }));
  const edit = store.queue("Edit", options({ resourceIds: ["event"], onSubmit: () => { updates++; } }));
  edit.submit();
  assert.equal(store.getOperation(edit.id)?.phase, "waiting");
  assert.deepEqual(store.getOperation(edit.id)?.blockers, ["creation-dependency"]);
  assert.deepEqual(store.getOperation(edit.id)?.dependencyIds, [creation.id]);
  assert.deepEqual(store.protectedResourceIds(), ["event"]);
  create.reject(new Error("Provider failed"));
  assert.deepEqual(await Promise.all([creation.completion, edit.completion]), [false, false]);
  assert.equal(updates, 0);
  assert.equal(store.getOperation(edit.id)?.phase, "failed");
  assert.equal(store.hasActive(), false);
});

test("zero-duration submit and synchronous provider failure settle exactly once", async () => {
  const store = createPendingActionStore(clock());
  let writes = 0, errors = 0, settled = 0;
  const action = store.queue("Save", options({ duration: 0,
    onSubmit: () => { writes++; throw new Error("Denied"); },
    onError: () => { errors++; }, onSettled: () => { settled++; },
  }));
  assert.equal(action.submit(), false);
  assert.equal(action.cancel(), false);
  assert.equal(await action.completion, false);
  assert.deepEqual([writes, errors, settled], [1, 1, 1]);
  assert.equal(store.getOperation(action.id)?.error, "Denied");
});

test("explicit partial outcomes retain confirmed successes and do not invoke rollback", async () => {
  const store = createPendingActionStore(clock());
  let rollbacks = 0;
  const action = store.queue("Move", options({
    onSubmit: () => ({ status: "needs-attention", succeededResourceIds: ["saved"], failedResourceIds: ["retained"] }),
    onError: () => { rollbacks++; },
  }));
  action.submit(); assert.equal(await action.completion, false);
  const result = store.getOperation(action.id)!;
  assert.equal(result.phase, "needs-attention");
  assert.deepEqual(result.outcome?.succeededResourceIds, ["saved"]);
  assert.deepEqual(result.outcome?.failedResourceIds, ["retained"]);
  assert.equal(rollbacks, 0);
});

test("presenter or settled-callback failure cannot reclassify a confirmed write", async () => {
  const log = mock.method(console, "error", () => {});
  try {
    const store = createPendingActionStore(clock());
    store.subscribe(() => { throw new Error("Renderer failed"); });
    const action = store.queue("Save", options({ onSettled: () => { throw new Error("Cleanup failed"); } }));
    action.submit();
    assert.equal(await action.completion, true);
    assert.equal(store.getOperation(action.id)?.phase, "complete");
    assert.equal(store.hasActive(), false);
  } finally { log.mock.restore(); }
});

import assert from "node:assert/strict";
import test from "node:test";
import { LatestMutationQueue, MutationQueue } from "./mutation-queue";

const makeQueue = (overrides: Partial<ConstructorParameters<typeof MutationQueue>[0]> = {}) =>
  new MutationQueue({
    concurrency: 2,
    maxAttempts: 3,
    maxRetryDelayMs: 0,
    minStartIntervalMs: 0,
    retryBaseDelayMs: 0,
    shouldRetry: () => false,
    ...overrides,
  });

test("limits concurrent work", async () => {
  const queue = makeQueue();
  let active = 0;
  let maximumActive = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const jobs = Array.from({ length: 5 }, (_, index) =>
    queue.enqueue(`event-${index}`, async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await gate;
      active -= 1;
      return index;
    }),
  );

  await Promise.resolve();
  assert.equal(maximumActive, 2);
  release();
  assert.deepEqual(await Promise.all(jobs), [0, 1, 2, 3, 4]);
});

test("serializes mutations with the same key", async () => {
  const queue = makeQueue();
  const order: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

  const first = queue.enqueue("same-event", async () => {
    order.push("first-start");
    await firstGate;
    order.push("first-end");
  });
  const second = queue.enqueue("same-event", async () => {
    order.push("second-start");
  });

  await Promise.resolve();
  assert.deepEqual(order, ["first-start"]);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, ["first-start", "first-end", "second-start"]);
});

test("retries retryable failures with backoff", async () => {
  const delays: number[] = [];
  const retryable = new Error("retryable");
  const queue = makeQueue({
    maxRetryDelayMs: 8_000,
    random: () => 0,
    retryBaseDelayMs: 1_000,
    shouldRetry: (error) => error === retryable,
    sleep: async (duration) => { delays.push(duration); },
  });
  let attempts = 0;

  const result = await queue.enqueue("event", async () => {
    attempts += 1;
    if (attempts < 3) throw retryable;
    return "saved";
  });

  assert.equal(result, "saved");
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [1_000, 2_000]);
});

test("latest mutation queue coalesces pending values and serializes writes", async () => {
  const writes: number[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const queue = new LatestMutationQueue<number>({
    debounceMs: 0,
    maxAttempts: 1,
    retryDelayMs: () => 0,
    run: async (value) => {
      writes.push(value);
      if (value === 1) await firstGate;
    },
    shouldRetry: () => false,
  });

  const first = queue.enqueue(1);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = queue.enqueue(2);
  const third = queue.enqueue(3);
  releaseFirst();
  await Promise.all([first, second, third]);

  assert.deepEqual(writes, [1, 3]);
});

test("latest mutation queue can merge metadata from superseded values", async () => {
  const writes: Array<{ ids: string[]; value: number }> = [];
  const queue = new LatestMutationQueue<{ ids: string[]; value: number }>({
    debounceMs: 0,
    maxAttempts: 1,
    mergePending: (pending, next) => ({
      ids: [...pending.ids, ...next.ids],
      value: next.value,
    }),
    retryDelayMs: () => 0,
    run: async (value) => { writes.push(value); },
    shouldRetry: () => false,
  });

  await Promise.all([
    queue.enqueue({ ids: ["a"], value: 1 }),
    queue.enqueue({ ids: ["b"], value: 2 }),
  ]);

  assert.deepEqual(writes, [{ ids: ["a", "b"], value: 2 }]);
});

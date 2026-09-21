import assert from "node:assert/strict";
import test from "node:test";
import { TodoistDestinationsCache, TODOIST_DESTINATIONS_CACHE_MS } from "./todoist-destinations-cache";

const destinations = { projects: [], sections: [] };

test("shares simultaneous reads and expires metadata after fifteen minutes", async () => {
  let now = 0;
  let reads = 0;
  const cache = new TodoistDestinationsCache(() => now);
  const fetch = async () => { reads += 1; return destinations; };
  const first = cache.load("account", fetch);
  assert.equal(cache.load("account", fetch), first);
  await first;
  now = TODOIST_DESTINATIONS_CACHE_MS - 1;
  await cache.load("account", fetch);
  assert.equal(reads, 1);
  now += 1;
  await cache.load("account", fetch);
  assert.equal(reads, 2);
});

test("isolates accounts and supports invalidation after project creation", async () => {
  let reads = 0;
  const cache = new TodoistDestinationsCache();
  const fetch = async () => { reads += 1; return destinations; };
  await cache.load("first", fetch);
  await cache.load("second", fetch);
  cache.invalidate("first");
  await cache.load("first", fetch);
  await cache.load("second", fetch);
  assert.equal(reads, 3);
});

test("failed requests can be retried immediately", async () => {
  const cache = new TodoistDestinationsCache();
  await assert.rejects(cache.load("account", async () => { throw new Error("offline"); }));
  assert.equal(await cache.load("account", async () => destinations), destinations);
});

test("an invalidated in-flight read cannot replace newer metadata", async () => {
  const cache = new TodoistDestinationsCache();
  let resolve!: (value: typeof destinations) => void;
  const pending = new Promise<typeof destinations>((done) => { resolve = done; });
  const old = cache.load("account", () => pending);
  cache.invalidate("account");
  const newer = { projects: [], sections: [] };
  await cache.load("account", async () => newer);
  resolve(destinations);
  await old;
  assert.equal(await cache.load("account", async () => destinations), newer);
});

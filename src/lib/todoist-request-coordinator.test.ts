import assert from "node:assert/strict";
import test from "node:test";
import { TodoistRequestCoordinator, todoistRetryAfterMs, todoistErrorResponse } from "./todoist-request-coordinator";

const json = (value: unknown) => Response.json(value);
const fetcher = (run: (url: string, init: RequestInit) => Promise<Response>) =>
  ((url: string | URL | Request, init?: RequestInit) => run(String(url), init ?? {})) as typeof fetch;

test("overlapping imports and background scans share list pages for one minute", async () => {
  let calls = 0;
  let now = 0;
  const coordinator = new TodoistRequestCoordinator(fetcher(async () => { calls++; return json({ results: [calls] }); }), () => now);
  const responses = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    coordinator.request("account", i % 2 ? "/tasks?limit=200&cursor=next" : "/tasks?cursor=next&limit=200")));
  assert.equal(calls, 1);
  assert.deepEqual(await Promise.all(responses.map(r => r.json())), Array.from({ length: 20 }, () => ({ results: [1] })));
  now = 59_999;
  await coordinator.request("account", "/tasks?limit=200&cursor=next");
  assert.equal(calls, 1);
  now = 60_000;
  await coordinator.request("account", "/tasks?limit=200&cursor=next");
  assert.equal(calls, 2);
  await coordinator.request("other-account", "/tasks?limit=200&cursor=next");
  assert.equal(calls, 3);
});

test("one caller aborting does not cancel a shared provider read", async () => {
  let release!: (response: Response) => void;
  let providerSignal: AbortSignal | null | undefined;
  let calls = 0;
  const coordinator = new TodoistRequestCoordinator(fetcher(async (_url, init) => {
    calls++; providerSignal = init.signal;
    return new Promise<Response>(resolve => { release = resolve; });
  }));
  const controller = new AbortController();
  const first = coordinator.request("a", "/tasks?limit=200", { signal: controller.signal });
  const second = coordinator.request("a", "/tasks?limit=200");
  controller.abort();
  await assert.rejects(first, { name: "AbortError" });
  assert.equal(providerSignal?.aborted, false);
  release(json({ results: ["task"] }));
  assert.deepEqual(await (await second).json(), { results: ["task"] });
  assert.equal(calls, 1);
});

test("writes invalidate old list pages even if an earlier read finishes after the write", async () => {
  let release!: (response: Response) => void;
  let reads = 0;
  const coordinator = new TodoistRequestCoordinator(fetcher(async (_url, init) => {
    if (init.method === "POST") return json({ id: "new" });
    reads++;
    if (reads === 1) return new Promise<Response>(resolve => { release = resolve; });
    return json({ results: ["new"] });
  }));
  const old = coordinator.request("a", "/tasks?limit=200");
  await coordinator.request("a", "/tasks", { method: "POST", body: "{}" });
  release(json({ results: ["old"] }));
  await old;
  assert.deepEqual(await (await coordinator.request("a", "/tasks?limit=200")).json(), { results: ["new"] });
  assert.equal(reads, 2);
});

test("individual tasks are always re-read before cron writes", async () => {
  let calls = 0;
  const coordinator = new TodoistRequestCoordinator(fetcher(async () => json({ revision: ++calls })));
  await coordinator.request("a", "/tasks/task-id");
  assert.deepEqual(await (await coordinator.request("a", "/tasks/task-id")).json(), { revision: 2 });
});

test("429 creates an account-wide cooldown across reads and writes and preserves Retry-After", async () => {
  let now = 0;
  let calls = 0;
  const coordinator = new TodoistRequestCoordinator(fetcher(async () => {
    calls++;
    return new Response("limited", { status: 429, headers: { "Retry-After": "120" } });
  }), () => now);
  const first = await coordinator.request("a", "/tasks?limit=200");
  assert.equal(first.headers.get("retry-after"), "120");
  now = 15_000;
  for (const path of ["/projects", "/sections", "/tasks/123"]) {
    const blocked = await coordinator.request("a", path);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("retry-after"), "105");
  }
  assert.equal((await coordinator.request("a", "/tasks", { method: "POST", body: "{}" })).status, 429);
  assert.equal(calls, 1);
  await coordinator.request("b", "/projects");
  assert.equal(calls, 2);
  now = 120_000;
  await coordinator.request("a", "/projects");
  assert.equal(calls, 3);
});

test("missing Retry-After gets a safe cooldown; HTTP-date headers and route errors retain timing", async () => {
  let calls = 0;
  let now = 0;
  const coordinator = new TodoistRequestCoordinator(fetcher(async () => {
    calls++;
    return new Response("limited", { status: 429 });
  }), () => now);
  assert.equal((await coordinator.request("a", "/tasks")).headers.get("retry-after"), "60");
  now = 59_000;
  assert.equal((await coordinator.request("a", "/projects")).headers.get("retry-after"), "1");
  assert.equal(calls, 1);
  now = 60_000;
  await coordinator.request("a", "/projects");
  assert.equal(calls, 2);
  assert.equal(todoistRetryAfterMs("Thu, 01 Jan 1970 00:02:00 GMT", 0), 120_000);
  assert.equal(todoistRetryAfterMs("bad", 0), 60_000);
  const response = todoistErrorResponse(Object.assign(new Error("limited"), { status: 429, retryAfterMs: 42_001 }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "43");
});

test("provider errors are not cached and a rejected read can recover", async () => {
  let calls = 0;
  const coordinator = new TodoistRequestCoordinator(fetcher(async () => {
    calls++;
    if (calls === 1) throw new Error("offline");
    return calls === 2 ? new Response("down", { status: 503 }) : json({ ok: true });
  }));
  await assert.rejects(coordinator.request("a", "/tasks"), /offline/);
  assert.equal((await coordinator.request("a", "/tasks")).status, 503);
  assert.equal((await coordinator.request("a", "/tasks")).status, 200);
  assert.equal(calls, 3);
});

test("writes clear every cached page and project filter, including uncertain failures", async () => {
  let revision = 0;
  const coordinator = new TodoistRequestCoordinator(fetcher(async (_url, init) => {
    if (init.method === "POST") { revision++; throw new Error("lost acknowledgement"); }
    return json({ revision });
  }));
  for (const path of ["/tasks?limit=200", "/tasks?limit=200&cursor=next", "/tasks?project_id=bucket&limit=200"]) {
    await coordinator.request("a", path);
  }
  await assert.rejects(coordinator.request("a", "/tasks/123", { method: "POST", body: "{}" }), /lost acknowledgement/);
  for (const path of ["/tasks?limit=200", "/tasks?limit=200&cursor=next", "/tasks?project_id=bucket&limit=200"]) {
    assert.deepEqual(await (await coordinator.request("a", path)).json(), { revision: 1 });
  }
});

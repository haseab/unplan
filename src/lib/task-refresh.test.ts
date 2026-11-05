import test from "node:test";
import assert from "node:assert/strict";
import { refreshTasks } from "./task-refresh";
import { zonedMonthEnd } from "./zoned-month-end";
import { latestTaskRefreshSettings, parseTaskRefreshSettings, TASK_REFRESH_SETTINGS_PREFIX } from "./task-refresh-settings";
import { calendarEventDetailsFromTodoistContent, todoistContentWithGroupChange } from "./todoist-calendar";
import type { TodoistTask } from "./todoist";
import { triggerTaskRefresh } from "../../workers/task-refresh/index";

const now = new Date("2026-11-05T18:00:00Z");
const task = (id: string, content = todoistContentWithGroupChange("Review", "Priority Tomorrow", new Date("2026-11-01T18:00:00Z"))): TodoistTask => ({ id, content, description: "Notes", due: null, priority: 1, projectId: "inbox" });

test("refreshes from stored data, and a second run makes no duplicate changes", async () => {
  let current = task("one");
  let writes = 0;
  const provider = { readTask: async () => current, updateTask: async (_id: string, content: string) => { writes++; current = { ...current, content }; } };
  assert.equal((await refreshTasks([current], { activity: {}, parents: {} }, now, provider)).updated, 1);
  assert.equal(calendarEventDetailsFromTodoistContent(current.content).group, "Ungrouped");
  assert.equal((await refreshTasks([current], { activity: {}, parents: {} }, now, provider)).updated, 0);
  assert.equal(writes, 1);
});

test("respects a follow-up postponed since the initial scan", async () => {
  const original = task("one");
  const latest = task("one", original.content.replace("]]", ";reviewAt=2026-12-01T18%3A00%3A00.000Z]]"));
  const result = await refreshTasks([original], { activity: {}, parents: {} }, now, { readTask: async () => latest, updateTask: async () => assert.fail("must not write") });
  assert.equal(result.skipped, 1);
});

test("keeps a title edit made since the initial scan", async () => {
  const original = task("one");
  let written = "";
  await refreshTasks([original], { activity: {}, parents: {} }, now, { readTask: async () => ({ ...original, content: original.content.replace("Review", "Renamed") }), updateTask: async (_id, content) => { written = content; } });
  assert.equal(calendarEventDetailsFromTodoistContent(written).title, "Renamed");
});

test("bounds writes and retries failures from source data on the next run", async () => {
  const tasks = Array.from({ length: 35 }, (_, i) => task(String(i)));
  const result = await refreshTasks(tasks, { activity: {}, parents: {} }, now, { readTask: async () => { throw new Error("offline"); }, updateTask: async () => assert.fail() });
  assert.equal(result.failed, 30);
  assert.equal(result.deferred, 5);
  assert.equal(result.pending, 35);
});

test("monthly refresh uses saved folder hierarchy and time zone", async () => {
  const original = task("monthly", todoistContentWithGroupChange("Monthly", "Research", new Date("2026-10-20T12:00:00Z")));
  const folders = { activity: { Work: { active: true, changedAt: "2026-01-01T00:00:00Z" } }, parents: { Research: "Work" }, timeZone: "America/Los_Angeles" };
  const provider = { readTask: async () => original, updateTask: async () => {} };
  assert.equal((await refreshTasks([original], folders, new Date("2026-10-31T06:59:59Z"), provider)).updated, 0);
  assert.equal((await refreshTasks([original], folders, new Date("2026-10-31T07:00:00Z"), provider)).updated, 1);
});

for (const [date, zone, expected] of [
  ["2026-11-01T02:00:00Z", "America/Los_Angeles", "2026-10-31T07:00:00.000Z"],
  ["2026-11-30T08:00:00Z", "America/Los_Angeles", "2026-11-30T08:00:00.000Z"],
  ["2024-02-29T01:00:00Z", "Asia/Tokyo", "2024-02-28T15:00:00.000Z"],
  ["2026-01-01T00:00:00Z", "UTC", "2025-12-31T00:00:00.000Z"],
]) test(`month end ${date} in ${zone}`, () => assert.equal(zonedMonthEnd(new Date(date), zone).toISOString(), expected));

test("settings reject invalid time zones and select the newest stored rules", () => {
  const settings = { activity: {}, parents: { Research: "Work" }, timeZone: "America/Los_Angeles", updatedAt: now.toISOString() };
  assert.equal(parseTaskRefreshSettings({ ...settings, timeZone: "invalid" }), null);
  assert.equal(parseTaskRefreshSettings({ ...settings, updatedAt: "bad" }), null);
  assert.equal(parseTaskRefreshSettings({ ...settings, parents: [] }), null);
  const record = (id: string, updatedAt: string) => ({ ...task(id), description: TASK_REFRESH_SETTINGS_PREFIX + JSON.stringify({ ...settings, updatedAt }) });
  assert.equal(latestTaskRefreshSettings([record("old", "2026-01-01"), record("new", now.toISOString())])?.task.id, "new");
});

test("worker sends the same authenticated POST each invocation without task state", async () => {
  const requests: Request[] = [];
  const fetcher: typeof fetch = async (url, init) => { requests.push(new Request(url, init)); return Response.json({ updated: 0 }); };
  const env = { TASK_REFRESH_URL: "https://unplan.io/api/task-refresh", TASK_REFRESH_SECRET: "test-only" };
  await triggerTaskRefresh(env, fetcher); await triggerTaskRefresh(env, fetcher);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.method, "POST");
    assert.equal(request.headers.get("authorization"), "Bearer test-only");
    assert.equal(await request.text(), "");
  }
  await assert.rejects(triggerTaskRefresh(env, async () => new Response(null, { status: 502 })), /HTTP 502/);
});

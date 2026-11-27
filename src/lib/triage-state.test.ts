import assert from "node:assert/strict";
import test from "node:test";
import { readTriageState } from "./triage-state";

const projects = [
  { id: "inbox", name: "Inbox", inbox_project: true },
  { id: "bucket", name: "unplan-calendar" },
  { id: "bucket-2", name: "unplan-calendar-2" },
  { id: "extraction", name: "task-extraction" },
  { id: "extra", name: "Configured source" },
  { id: "unrelated", name: "Unrelated" },
];
const task = (id: string, projectId: string) => ({ id, project_id: projectId, content: id, description: "", priority: 1, due: null });
test("reads only Inbox, managed buckets, extraction, and configured extra projects", async () => {
  const calls: URL[] = [];
  const request = async <T>(path: string): Promise<T> => {
    const url = new URL(path, "https://todoist.test"); calls.push(url);
    if (url.pathname === "/projects") return { results: projects, next_cursor: null } as T;
    const id = url.searchParams.get("project_id");
    assert.ok(id, "unscoped task requests must not be used");
    assert.notEqual(id, "unrelated");
    const cursor = url.searchParams.get("cursor");
    return { results: [task(cursor ? "second" : id, id)], next_cursor: id === "bucket" && !cursor ? "more" : null } as T;
  };
  const result = await readTriageState(request, ["extra", "extra", "missing"]);
  assert.deepEqual(new Set(result.tasks.map((t) => t.projectId)), new Set(["inbox", "bucket", "bucket-2", "extraction", "extra"]));
  assert.ok(result.tasks.some((t) => t.id === "second"), "pagination is retained");
  assert.equal(calls.filter((url) => url.searchParams.get("project_id") === "extra").length, 1);
});
test("reads every projects page before resolving task source membership", async () => {
  const requested: string[] = [];
  const result = await readTriageState(async <T>(path: string): Promise<T> => {
    const url = new URL(path, "https://todoist.test");
    if (url.pathname === "/projects") return { results: url.searchParams.has("cursor") ? [projects[3]] : [projects[0]], next_cursor: url.searchParams.has("cursor") ? null : "next" } as T;
    const id = url.searchParams.get("project_id")!; requested.push(id);
    return { results: [task(id, id)], next_cursor: null } as T;
  });
  assert.deepEqual(new Set(requested), new Set(["inbox", "extraction"]));
  assert.equal(result.tasks.length, 2);
});
test("provider failures surface instead of returning partial or empty queues", async () => {
  await assert.rejects(readTriageState(async <T>(path: string): Promise<T> => {
    if (path.startsWith("/projects")) return { results: projects, next_cursor: null } as T;
    throw new Error("Todoist unavailable");
  }), /Todoist unavailable/);
});
test("the persisted folder settings are found inside the Inbox read", async () => {
  const settings = { parents: { Child: "Parent" }, activity: {}, timeZone: "America/Los_Angeles", updatedAt: "2026-11-11T00:00:00Z" };
  const result = await readTriageState(async <T>(path: string): Promise<T> => {
    if (path.startsWith("/projects")) return { results: [projects[0]], next_cursor: null } as T;
    return { results: [{ ...task("settings", "inbox"), description: "unplan:task-refresh-settings:v1\n" + JSON.stringify(settings) }], next_cursor: null } as T;
  });
  assert.equal(result.record?.settings.parents.Child, "Parent");
});

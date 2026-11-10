import assert from "node:assert/strict";
import test from "node:test";
import { createTriageService, type TriageDependencies } from "./triage-service";
import { parseTriageAction } from "./triage-contract";
import { calendarEventDetailsFromTodoistContent, todoistContentWithGroupChange } from "./todoist-calendar";
import type { TodoistTask } from "./todoist";

const task = (id = "t", projectId = "inbox"): TodoistTask => ({ id, projectId, content: "Review proposal", description: "Source details", priority: 1, due: null });
const identity = (t: TodoistTask) => ({ taskId: t.id, expectedContent: t.content, expectedProjectId: t.projectId });
function setup(overrides: Partial<TriageDependencies> = {}) {
  const calls: Array<{ path: string; body?: unknown; method?: string }> = [];
  const tasks = [task(), task("ex", "extract"), task("private", "other")];
  const deps: TriageDependencies = {
    readState: async () => ({ tasks, projects: [{ id: "inbox", name: "Inbox", inbox: true, parentId: null }, { id: "extract", name: "task-extraction", inbox: false, parentId: null }], record: { settings: { parents: { Child: "Priority Today" }, activity: {}, timeZone: "America/Los_Angeles", updatedAt: new Date().toISOString() } } }),
    saveSettings: async () => {}, todoist: async (path, body, method) => { calls.push({ path, body, method }); },
    calendars: async () => [{ id: "google|a|c", name: "Technicalities", provider: "google", writable: true, backgroundColor: "#123456", foregroundColor: "#fff" }],
    schedule: async () => { calls.push({ path: "calendar-create" }); }, extraBucketIds: [], ...overrides,
  };
  return { service: createTriageService(deps), calls, tasks };
}
test("snapshot uses the same visible task scope and persisted hierarchy as counts", async () => {
  const { service } = setup(); const data = await service.snapshot();
  assert.deepEqual(data.tasks.map((t) => t.id), ["t"]);
  assert.deepEqual(data.extractedTasks.map((t) => t.id), ["ex"]);
  assert.ok(data.groups.includes("Priority Today")); assert.equal(data.groupParents.Child, "Priority Today");
  assert.equal(data.defaultCalendarId, "google|a|c");
});
test("calendar failure does not block task review", async () => {
  const { service } = setup({ calendars: async () => { throw new Error("down"); } });
  const data = await service.snapshot(); assert.equal(data.tasks.length, 1); assert.ok(data.calendarError); assert.equal(data.defaultCalendarId, null);
});
test("a stale decision performs no provider writes", async () => {
  const { service, calls, tasks } = setup();
  await assert.rejects(service.mutate({ ...identity(tasks[0]), expectedContent: "Old", action: "delete" }), /changed in another client/);
  assert.equal(calls.length, 0);
});
test("tasks outside integration buckets cannot be mutated", async () => {
  const { service, tasks, calls } = setup();
  await assert.rejects(service.mutate({ ...identity(tasks[2]), action: "delete" }), /changed/); assert.equal(calls.length, 0);
});
test("schedule creates the calendar event before completing the task", async () => {
  const { service, tasks, calls } = setup(); await service.mutate({ ...identity(tasks[0]), action: "schedule" });
  assert.deepEqual(calls.map((c) => c.path), ["calendar-create", "/tasks/t/close"]);
});
test("a failed event creation leaves the Todoist task open", async () => {
  const { service, tasks, calls } = setup({ schedule: async () => { throw new Error("calendar failed"); } });
  await assert.rejects(service.mutate({ ...identity(tasks[0]), action: "schedule" }), /calendar failed/); assert.equal(calls.length, 0);
});
test("Keep on extraction writes task metadata before moving it into the inbox", async () => {
  const { service, tasks, calls } = setup(); await service.mutate({ ...identity(tasks[1]), action: "extract", resolution: "keep" });
  assert.deepEqual(calls.map((c) => c.path), ["/tasks/ex", "/tasks/ex/move"]);
  assert.deepEqual(calls[1].body, { project_id: "inbox" });
  const content = (calls[0].body as { content: string }).content;
  assert.equal(calendarEventDetailsFromTodoistContent(content).group, "Ungrouped");
  assert.equal(calendarEventDetailsFromTodoistContent(content).calendarId, "google|a|c");
});
test("rename keeps metadata and source description", async () => {
  const { service, tasks, calls } = setup(); tasks[0].content = todoistContentWithGroupChange(tasks[0].content, "Priority Today");
  await service.mutate({ ...identity(tasks[0]), action: "rename", title: "Revised title" });
  const body = calls[0].body as { content: string; description: string };
  assert.equal(body.description, "Source details"); assert.equal(calendarEventDetailsFromTodoistContent(body.content).group, "Priority Today");
  assert.equal(calendarEventDetailsFromTodoistContent(body.content).title, "Revised title");
});
test("invalid folder parents and malformed operations are rejected", async () => {
  const { service } = setup(); await assert.rejects(service.mutate({ action: "create-folder", name: "New", parent: "Missing" }), /parent folder/);
  assert.throws(() => parseTriageAction({ action: "delete", taskId: "t" }));
  assert.throws(() => parseTriageAction({ ...identity(task()), action: "follow-up", date: "invalid" }));
  assert.throws(() => parseTriageAction({ ...identity(task()), action: "follow-up", date: new Date().toISOString(), period: { amount: -1, unit: "day" } }));
});

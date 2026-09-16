import assert from "node:assert/strict";
import test from "node:test";
import { FOLLOW_UP_PROJECT_NAME, TodoistFollowUpStore, followUpFromTask, followUpTaskInput } from "./todoist-follow-ups";
import type { FollowUp } from "./follow-ups";
import type { CreateTodoistTaskInput, TodoistProject, TodoistTask, UpdateTodoistTaskInput } from "./todoist";

const record: FollowUp = {
  id: "legacy-id", input: "3 days", rule: { kind: "interval", amount: 3, unit: "day" }, nextDue: "2026-09-19T17:00:00.000Z",
  event: { id: "event-1", calendarId: "cal-1", title: "Call Jane", start: "2026-09-16T17:00:00.000Z", end: "2026-09-16T17:45:00.000Z", description: "Original notes", provider: "google", color: "red", calendarColor: "red" },
};
function fake() {
  const tasks: TodoistTask[] = [];
  const projects: TodoistProject[] = [];
  let failCreate = false;
  let failUpdate = false;
  let failDelete = false;
  let createCount = 0;
  const api = {
    async loadTodoistDestinations() { return { projects, sections: [] }; },
    async createTodoistProject(_token: string, name: string) { const project = { id: "project", name, inbox: false, parentId: null }; projects.push(project); return project; },
    async loadTodoistTasks() { return [...tasks]; },
    async createTodoistTask(_token: string, input: CreateTodoistTaskInput) {
      if (failCreate) throw new Error("offline");
      const task: TodoistTask = { id: `task-${++createCount}`, content: input.content, description: input.description ?? "", projectId: input.projectId!, priority: 1, due: null };
      tasks.push(task); return task;
    },
    async updateTodoistTask(_token: string, id: string, input: UpdateTodoistTaskInput) {
      if (failUpdate) throw new Error("offline");
      const index = tasks.findIndex((task) => task.id === id);
      tasks[index] = { ...tasks[index], ...input }; return tasks[index];
    },
    async deleteTodoistTask(_token: string, id: string) {
      if (failDelete) throw new Error("offline");
      tasks.splice(tasks.findIndex((task) => task.id === id), 1);
    },
  };
  return { api, tasks, projects, failCreate: () => { failCreate = true; }, failUpdate: () => { failUpdate = true; }, failDelete: () => { failDelete = true; } };
}

test("migration saves exact snapshot and deadline in dedicated Todoist project before removing local record", async () => {
  const env = fake();
  const store = new TodoistFollowUpStore("token", env.api);
  const migrated: string[] = [];
  const items = await store.sync([record], (id) => { assert.equal(env.tasks.length, 1); migrated.push(id); });
  assert.deepEqual(items, [record]);
  assert.deepEqual(migrated, [record.id]);
  assert.equal(env.projects[0].name, FOLLOW_UP_PROJECT_NAME);
  assert.deepEqual(followUpFromTask(env.tasks[0]), record);
  const anotherBrowser = new TodoistFollowUpStore("token", env.api);
  assert.deepEqual(await anotherBrowser.sync([], () => {}), [record]);
});

test("retry after interrupted migration does not duplicate or overwrite newer cloud schedule", async () => {
  const env = fake(); const store = new TodoistFollowUpStore("token", env.api);
  const newer = { ...record, nextDue: "2026-10-01T17:00:00.000Z" };
  await store.save(newer);
  let cleared = false;
  assert.deepEqual(await store.sync([record], () => { cleared = true; }), [newer]);
  assert.equal(env.tasks.length, 1); assert.equal(cleared, true);
});

test("failed migration preserves local data and does not report it migrated", async () => {
  const env = fake(); env.failCreate(); const store = new TodoistFollowUpStore("token", env.api);
  let cleared = false;
  await assert.rejects(store.sync([record], () => { cleared = true; }), /offline/);
  assert.equal(cleared, false);
});

test("editing the same event updates one task; advance persists the deadline without changing event data", async () => {
  const env = fake(); const store = new TodoistFollowUpStore("token", env.api);
  await store.save(record);
  const edited = { ...record, id: "different-id", input: "1h", rule: { kind: "interval", amount: 1, unit: "hour" } as const };
  const [saved] = await store.save(edited);
  assert.equal(env.tasks.length, 1); assert.equal(saved.id, record.id);
  const [advanced] = await store.advance(saved);
  assert.ok(Date.parse(advanced.nextDue) > Date.now());
  assert.deepEqual(advanced.event, record.event);
  assert.deepEqual(followUpFromTask(env.tasks[0]), advanced);
  assert.deepEqual(await store.advance(saved), [advanced], "stale review from another tab cannot advance twice");
});

test("failed updates and stops leave remote record untouched", async () => {
  const env = fake(); const store = new TodoistFollowUpStore("token", env.api);
  await store.save(record); env.failUpdate(); env.failDelete();
  await assert.rejects(store.advance(record), /offline/);
  await assert.rejects(store.stop(record.id), /offline/);
  assert.deepEqual(followUpFromTask(env.tasks[0]), record);
});

test("stopping removes only the follow-up task; poll does not resurrect it", async () => {
  const env = fake(); const store = new TodoistFollowUpStore("token", env.api);
  await store.save(record);
  assert.deepEqual(await store.stop(record.id), []);
  assert.deepEqual(await store.sync([], () => {}), []);
  assert.equal(env.tasks.length, 0);
});

test("ordinary and malformed tasks are not interpreted as follow-ups; reads don't create empty projects", async () => {
  const env = fake(); const store = new TodoistFollowUpStore("token", env.api);
  assert.deepEqual(await store.sync([], () => {}), []);
  assert.equal(env.projects.length, 0);
  await store.save(record);
  assert.equal(followUpFromTask({ ...env.tasks[0], description: "Ordinary notes" }), null);
  assert.equal(followUpFromTask({ ...env.tasks[0], description: "unplan-follow-up:v1\ninvalid" }), null);
  assert.ok(followUpTaskInput(record).description.includes(record.nextDue));
});

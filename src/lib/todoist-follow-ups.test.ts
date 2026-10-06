import assert from "node:assert/strict";
import test from "node:test";
import { FOLLOW_UP_PROJECT_NAME, FOLLOW_UP_SECTION_NAME, TodoistFollowUpStore, followUpFromTask, followUpTaskInput } from "./todoist-follow-ups";
import type { FollowUp } from "./follow-ups";
import type { CreateTodoistTaskInput, TodoistProject, TodoistSection, TodoistTask, UpdateTodoistTaskInput } from "./todoist";

const record: FollowUp = {
  id: "legacy-id", input: "3 days", rule: { kind: "interval", amount: 3, unit: "day" }, nextDue: "2026-09-19T17:00:00.000Z",
  event: { id: "event-1", calendarId: "cal-1", title: "Call Jane", start: "2026-09-16T17:00:00.000Z", end: "2026-09-16T17:45:00.000Z", description: "Original notes", provider: "google", color: "red", calendarColor: "red" },
};
function fake() {
  const tasks: TodoistTask[] = [];
  const projects: TodoistProject[] = [{ id: "inbox", name: "Inbox", inbox: true, parentId: null }];
  const sections: TodoistSection[] = [];
  const creates: CreateTodoistTaskInput[] = [];
  let failSection = false;
  let failCreate = false;
  let failUpdate = false;
  let failDelete = false;
  let createCount = 0;
  const api = {
    async loadTodoistDestinations() { return { projects, sections }; },
    async createTodoistSection(_token: string, projectId: string, name: string) {
      if (failSection) throw new Error("section offline");
      const section = { id: "section", name, projectId }; sections.push(section); return section;
    },
    async loadTodoistTasks(_token: string, projectId: string) { return tasks.filter((task) => task.projectId === projectId); },
    async createTodoistTask(_token: string, input: CreateTodoistTaskInput) {
      if (failCreate) throw new Error("offline");
      const task: TodoistTask = { id: `task-${++createCount}`, content: input.content, description: input.description ?? "", projectId: input.projectId!, priority: 1, due: null };
      creates.push(input); tasks.push(task); return task;
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
  return { api, tasks, projects, sections, creates, failSection: () => { failSection = true; }, failCreate: () => { failCreate = true; }, failUpdate: () => { failUpdate = true; }, failDelete: () => { failDelete = true; } };
}

test("migration saves exact snapshot and deadline in an Inbox section before removing local record", async () => {
  const env = fake();
  const store = new TodoistFollowUpStore("token", env.api);
  const migrated: string[] = [];
  const items = await store.sync([record], (id) => { assert.equal(env.tasks.length, 1); migrated.push(id); });
  assert.deepEqual(items, [record]);
  assert.deepEqual(migrated, [record.id]);
  assert.equal(env.projects.length, 1);
  assert.deepEqual(env.sections, [{ id: "section", name: FOLLOW_UP_SECTION_NAME, projectId: "inbox" }]);
  assert.equal(env.creates[0].projectId, "inbox");
  assert.equal(env.creates[0].sectionId, "section");
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

test("ordinary and malformed tasks are not interpreted as follow-ups; reads don't create empty sections", async () => {
  const env = fake(); const store = new TodoistFollowUpStore("token", env.api);
  assert.deepEqual(await store.sync([], () => {}), []);
  assert.equal(env.projects.length, 1);
  assert.equal(env.sections.length, 0);
  await store.save(record);
  assert.equal(followUpFromTask({ ...env.tasks[0], description: "Ordinary notes" }), null);
  assert.equal(followUpFromTask({ ...env.tasks[0], description: "unplan-follow-up:v1\ninvalid" }), null);
  assert.ok(followUpTaskInput(record).description.includes(record.nextDue));
});


test("reuses only the matching Inbox section across store instances", async () => {
  const env = fake();
  env.sections.push(
    { id: "wrong", name: FOLLOW_UP_SECTION_NAME, projectId: "other" },
    { id: "existing", name: " UNPLAN-FOLLOW-UPS ", projectId: "inbox" },
  );
  await new TodoistFollowUpStore("token", env.api).save(record);
  await new TodoistFollowUpStore("token", env.api).save({ ...record, id: "second", event: { ...record.event, id: "second-event" } });
  assert.equal(env.sections.length, 2);
  assert.deepEqual(env.creates.map(({ sectionId }) => sectionId), ["existing", "existing"]);
});

test("legacy project reminders remain editable while new reminders go to Inbox", async () => {
  const env = fake();
  env.projects.push({ id: "legacy", name: FOLLOW_UP_PROJECT_NAME, inbox: false, parentId: null });
  await env.api.createTodoistTask("token", { ...followUpTaskInput(record), projectId: "legacy" });
  const store = new TodoistFollowUpStore("token", env.api);
  assert.deepEqual(await store.sync([], () => {}), [record]);
  await store.save({ ...record, input: "every 3 days" });
  assert.equal(env.tasks.length, 1);
  assert.equal(env.sections.length, 0);
  assert.equal(followUpFromTask(env.tasks[0])?.input, "every 3 days");
  await store.save({ ...record, id: "new", event: { ...record.event, id: "new-event" } });
  assert.equal(env.tasks[1].projectId, "inbox");
  await store.stop(record.id);
  assert.equal(env.tasks.length, 1);
  assert.equal(followUpFromTask(env.tasks[0])?.id, "new");
});

test("section creation failure preserves local follow-ups for retry", async () => {
  const env = fake(); env.failSection();
  let migrated = false;
  await assert.rejects(new TodoistFollowUpStore("token", env.api).sync([record], () => { migrated = true; }), /section offline/);
  assert.equal(migrated, false);
  assert.equal(env.tasks.length, 0);
});

test("ordinary Inbox tasks survive follow-up operations", async () => {
  const env = fake();
  await env.api.createTodoistTask("token", { content: "Ordinary task", projectId: "inbox" });
  const store = new TodoistFollowUpStore("token", env.api);
  await store.save(record);
  assert.deepEqual(await store.sync([], () => {}), [record]);
  await store.stop(record.id);
  assert.equal(env.tasks.length, 1);
  assert.equal(env.tasks[0].content, "Ordinary task");
});

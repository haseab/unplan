import test from "node:test";
import assert from "node:assert/strict";
import { createPriorityReviewState, priorityReviewReducer, remainingPriorityReviewTasks, priorityReviewSection, priorityReviewDefaultDays, priorityReviewTasks } from "./priority-task-review";
import { todoistContentReturnedToTriage, todoistContentWithGroup, todoistContentWithGroupChange } from "./todoist-calendar";
import type { TodoistTask } from "./todoist";

const task = (id: string, group: string): TodoistTask => ({
  id, content: todoistContentWithGroup(id, group), description: "", priority: 1,
  projectId: "tasks", due: null,
});

test("follow-up triage includes only Today, Tomorrow, Later and their descendants", () => {
  const tasks = [
    task("now", "Priority right now"),
    task("alias", "Priority Now"),
    task("today", "PRIORITY TODAY"),
    task("work", "Work"),
    task("child", "Launch"),
    task("tomorrow", "Priority Tomorrow"),
    task("later", "Priority Later"),
    task("root", "Priority"),
    task("later-child", "Backlog"),
  ];
  assert.deepEqual(priorityReviewTasks(tasks, {
    Launch: "Priority Today",
    Backlog: "Priority Later",
    "Priority Today": "Priority",
    "Priority Later": "Priority",
  }).map(({ id }) => id), ["today", "child", "tomorrow", "later", "later-child"]);
});

test("priority review recognizes normalized folder paths", () => {
  assert.deepEqual(priorityReviewTasks([
    task("now", "Work/ PRIORITY RIGHT NOW "),
    task("today", "Work/Priority Today"),
    task("later", "Work/Priority Later"),
  ], {}).map(({ id }) => id), ["today", "later"]);
});

test("newly filed priority tasks are included; ungrouped tasks are excluded", () => {
  const original = task("new", "Ungrouped");
  assert.deepEqual(priorityReviewTasks([original], {}), []);
  assert.deepEqual(priorityReviewTasks([{ ...original, content: todoistContentWithGroup(original.content, "Priority today") }], {}).map(({ id }) => id), ["new"]);
});


test("priority review reviews Today before Later even when Later was filed more recently", () => {
  const older = { ...task("older", "Ungrouped"), createdAt: "2026-09-16T12:00:00Z" };
  const justFlagged = { ...task("just-flagged", "Ungrouped"), createdAt: "2026-01-01T12:00:00Z" };
  const tasks = [
    { ...older, content: todoistContentWithGroupChange(older.content, "Priority Today", new Date("2026-09-15T12:00:00Z")) },
    { ...justFlagged, content: todoistContentWithGroupChange(justFlagged.content, "Launch", new Date("2026-09-16T12:00:00Z")) },
  ];
  assert.deepEqual(priorityReviewTasks(tasks, { Launch: "Priority Later" }).map(({ id }) => id), ["older", "just-flagged"]);
  assert.deepEqual(tasks.map(({ id }) => id), ["older", "just-flagged"], "source order is unchanged");
});

test("equal filing times keep their order and missing or invalid times come last", () => {
  const filed = (id: string) => ({
    ...task(id, "Priority Today"),
    content: todoistContentWithGroupChange(id, "Priority Today", new Date("2026-09-16T12:00:00Z")),
  });
  const invalid = task("invalid", "Priority Today");
  invalid.content = invalid.content.replace("]]", ";groupChangedAt=invalid]]");
  assert.deepEqual(priorityReviewTasks([
    task("legacy", "Priority Today"), filed("first"), invalid, filed("second"),
  ], {}).map(({ id }) => id), ["first", "second", "legacy", "invalid"]);
});


for (const direction of ["left", "right", "up"] as const) {
  test(`undo ${direction} returns the task to the front and reverses its departure`, () => {
    const tasks = [task("first", "Priority"), task("second", "Priority")];
    const card = { task: tasks[0], direction };
    const departed = priorityReviewReducer(createPriorityReviewState(), { type: "resolve", card });
    assert.deepEqual(remainingPriorityReviewTasks(tasks, departed).map(({ id }) => id), ["second"]);
    const restored = priorityReviewReducer(departed, { type: "restore", card });
    assert.equal(restored.departure, null);
    assert.equal(restored.returning, card);
    // Scheduling temporarily removes the task from the source list.
    assert.deepEqual(remainingPriorityReviewTasks(tasks.slice(1), restored).map(({ id }) => id), ["first", "second"]);
    const settled = priorityReviewReducer(restored, { type: "animation-end", card });
    assert.equal(settled.returning, null);
    assert.deepEqual(remainingPriorityReviewTasks(tasks, settled).map(({ id }) => id), ["first", "second"]);
  });
}

test("undo an older decision restores it first without undoing other reviewed tasks", () => {
  const tasks = [task("a", "Priority"), task("b", "Priority"), task("c", "Priority")];
  const a = { task: tasks[0], direction: "right" as const };
  const b = { task: tasks[1], direction: "left" as const };
  let state = priorityReviewReducer(createPriorityReviewState(), { type: "resolve", card: a });
  state = priorityReviewReducer(state, { type: "resolve", card: b });
  state = priorityReviewReducer(state, { type: "restore", card: a });
  state = priorityReviewReducer(state, { type: "animation-end", card: b });
  assert.equal(state.returning, a, "stale animation must not clear the return");
  assert.deepEqual(remainingPriorityReviewTasks(tasks, state).map(({ id }) => id), ["a", "c"]);
});

test("a reopened review starts with the undone task even if its source order changed", () => {
  const tasks = [task("a", "Priority"), task("b", "Priority")];
  const state = createPriorityReviewState({ task: tasks[1], direction: "left" });
  assert.deepEqual(remainingPriorityReviewTasks(tasks, state).map(({ id }) => id), ["b", "a"]);
});

test("section labels recognize aliases, paths, and descendant folders", () => {
  assert.equal(priorityReviewSection(task("now", "Work/ PRIORITY TODAY "), {}), "Priority Today");
  assert.equal(priorityReviewSection(task("child", "Launch"), { Launch: "Priority today" }), "Priority Today");
  assert.equal(priorityReviewSection(task("child", "Launch"), { Launch: "Work/PRIORITY TODAY" }), "Priority Today");
  assert.equal(priorityReviewSection(task("later", "Priority Later"), {}), "Priority Later");
});

test("default refresh timers never exclude tasks without an explicit follow-up date", () => {
  const now = new Date("2026-11-05T18:00:00Z");
  const tasks = ["Priority Tomorrow", "Priority Later", "Priority Today"].map((group, index) => ({
    ...task(String(index), group),
    content: todoistContentWithGroupChange(String(index), group, now),
  }));
  assert.deepEqual(priorityReviewTasks(tasks, {}).map(({ id }) => id), ["2", "0", "1"]);
});

test("Now and Right Now never inherit follow-up eligibility from a parent", () => {
  for (const group of ["Priority Now", "Priority Right Now"]) {
    assert.equal(priorityReviewSection(task("now", group), { [group]: "Priority Today" }), null);
    assert.equal(priorityReviewSection(task("child", "Now child"), { "Now child": group }), null);
  }
});

test("legacy refreshed priority tasks enter follow-up triage without an explicit review time", () => {
  const refreshed = { ...task("returned", "Priority Tomorrow"), content: todoistContentReturnedToTriage("Returned", "Priority Tomorrow") };
  assert.deepEqual(priorityReviewTasks([refreshed], {}).map(({ id }) => id), ["returned"]);
});

test("follow-up defaults match the task's priority category and saved source", () => {
  assert.equal(priorityReviewDefaultDays(task("today", "Priority Today"), {}), 3);
  assert.equal(priorityReviewDefaultDays(task("tomorrow", "Priority Tomorrow"), {}), 3);
  assert.equal(priorityReviewDefaultDays(task("later", "Priority Later"), {}), 7);
  assert.equal(priorityReviewDefaultDays(task("nested", "Launch"), { Launch: "Priority Later" }), 7);
  const refreshed = { ...task("returned", "Ungrouped"), content: todoistContentReturnedToTriage("Returned", "Priority Later") };
  assert.equal(priorityReviewDefaultDays(refreshed, {}), 7);
});

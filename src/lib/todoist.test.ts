import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTodoistTaskOrder,
  changedTodoistProjectOrders,
  insertTodoistTaskAtIndex,
  insertTodoistTasksAtTarget,
  collectTodoistPages,
  reorderTodoistTaskIds,
  todoistTaskDropTargetAtPointer,
  resolveTodoistDestination,
  type TodoistProject,
  type TodoistSection,
} from "./todoist";

const task = (id: string) => ({
  id,
  content: id,
  description: "",
  priority: 1,
  projectId: "inbox",
  due: null,
});

const projects: TodoistProject[] = [
  { id: "inbox", inbox: true, name: "Inbox", parentId: null },
  { id: "work", inbox: false, name: "Work", parentId: null },
];
const sections: TodoistSection[] = [
  { id: "doing", name: "Doing", projectId: "work" },
  { id: "later", name: "Later", projectId: "inbox" },
];

test("preserves a valid Todoist project and section", () => {
  assert.deepEqual(
    resolveTodoistDestination(projects, sections, "work", "doing"),
    { projectId: "work", sectionId: "doing" },
  );
});

test("falls back to Inbox when the saved project disappears", () => {
  assert.deepEqual(
    resolveTodoistDestination(projects, sections, "deleted", "doing"),
    { projectId: "inbox", sectionId: "" },
  );
});

test("clears a section that does not belong to the selected project", () => {
  assert.deepEqual(
    resolveTodoistDestination(projects, sections, "work", "later"),
    { projectId: "work", sectionId: "" },
  );
});

test("reorders a dragged task before or after its drop target", () => {
  assert.deepEqual(
    reorderTodoistTaskIds(["a", "b", "c"], "c", "a", "before"),
    ["c", "a", "b"],
  );
  assert.deepEqual(
    reorderTodoistTaskIds(["a", "b", "c"], "a", "b", "after"),
    ["b", "a", "c"],
  );
});

test("projects a task before the next row or after the final row", () => {
  const slots = [
    { center: 20, taskId: "one" },
    { center: 60, taskId: "two" },
  ];

  assert.deepEqual(todoistTaskDropTargetAtPointer(slots, 40), {
    edge: "before",
    taskId: "two",
  });
  assert.deepEqual(todoistTaskDropTargetAtPointer(slots, 80), {
    edge: "after",
    taskId: "two",
  });
  assert.equal(todoistTaskDropTargetAtPointer([], 40), null);
});

test("restores an optimistically deleted task at its original index", () => {
  assert.deepEqual(
    insertTodoistTaskAtIndex([task("one"), task("three")], task("two"), 1)
      .map(({ id }) => id),
    ["one", "two", "three"],
  );
});

test("inserts optimistic tasks together at their projected target", () => {
  const one = task("one");
  const two = task("two");
  const firstNew = task("new-one");
  const secondNew = task("new-two");

  assert.deepEqual(
    insertTodoistTasksAtTarget(
      [one, two],
      [firstNew, secondNew],
      { edge: "after", taskId: "one" },
    ).map(({ id }) => id),
    ["one", "new-one", "new-two", "two"],
  );
});

test("applies a visible task order without moving hidden tasks out of their slots", () => {
  assert.deepEqual(
    applyTodoistTaskOrder(
      [task("a"), task("hidden"), task("b"), task("c")],
      ["c", "a", "b"],
    ).map(({ id }) => id),
    ["c", "hidden", "a", "b"],
  );
});

test("returns only Todoist projects whose relative task order changed", () => {
  const previous = [
    task("a"),
    task("b"),
    { ...task("c"), projectId: "work" },
    { ...task("d"), projectId: "work" },
  ];
  const next = [
    task("b"),
    task("a"),
    { ...task("c"), projectId: "work" },
    { ...task("d"), projectId: "work" },
  ];

  assert.deepEqual(changedTodoistProjectOrders(previous, next), [
    { projectId: "inbox", taskIds: ["b", "a"] },
  ]);
});

test("collects every page returned by Todoist", async () => {
  const requestedCursors: Array<string | null> = [];
  const tasks = await collectTodoistPages(async (cursor) => {
    requestedCursors.push(cursor);
    return cursor === null
      ? { results: ["first", "second"], next_cursor: "page-2" }
      : { results: ["third"], next_cursor: null };
  });

  assert.deepEqual(tasks, ["first", "second", "third"]);
  assert.deepEqual(requestedCursors, [null, "page-2"]);
});

test("rejects a repeated Todoist pagination cursor", async () => {
  await assert.rejects(
    collectTodoistPages(async () => ({
      results: [],
      next_cursor: "same-page",
    })),
    /repeated pagination cursor/,
  );
});

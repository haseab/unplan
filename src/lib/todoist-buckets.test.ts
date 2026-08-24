import assert from "node:assert/strict";
import test from "node:test";
import type { TodoistProject, TodoistTask } from "./todoist";
import {
  isTodoistProjectAtCapacity,
  isTodoistProjectCapacityError,
  nextTodoistManagedBucketName,
  parseTodoistBucketProjectIds,
  resolveTodoistBucketProjectIds,
  todoistManagedBucketProjects,
} from "./todoist-buckets";

const projects: TodoistProject[] = [
  { id: "inbox", inbox: true, name: "Inbox", parentId: null },
  { id: "calendar", inbox: false, name: "unplan-calendar", parentId: null },
  { id: "work", inbox: false, name: "Work", parentId: null },
];

test("starts the bucket chain with Inbox and retains valid stored buckets", () => {
  assert.deepEqual(resolveTodoistBucketProjectIds({
    preferredProjectId: "work",
    projects,
    storedProjectIds: ["missing", "calendar", "calendar"],
  }), ["inbox", "calendar", "work"]);
});

test("parses stored bucket ids defensively", () => {
  assert.deepEqual(parseTodoistBucketProjectIds('["inbox", 42, "calendar", ""]'), [
    "inbox",
    "calendar",
  ]);
  assert.deepEqual(parseTodoistBucketProjectIds("not json"), []);
});

test("counts only committed active tasks toward local capacity", () => {
  const tasks = Array.from({ length: 299 }, (_, index): TodoistTask => ({
    content: `Task ${index}`,
    description: "",
    due: null,
    id: String(index),
    priority: 1,
    projectId: "inbox",
  }));
  tasks.push({ ...tasks[0], id: "optimistic", optimistic: true });
  assert.equal(isTodoistProjectAtCapacity(tasks, "inbox"), false);
  assert.equal(isTodoistProjectAtCapacity(tasks, "inbox", 1), true);
});

test("uses stable managed bucket names as capacity grows", () => {
  assert.deepEqual(todoistManagedBucketProjects(projects).map(({ project }) => project.id), [
    "calendar",
  ]);
  assert.equal(nextTodoistManagedBucketName(projects), "unplan-calendar-2");
  assert.equal(nextTodoistManagedBucketName([
    ...projects,
    { id: "calendar-2", inbox: false, name: "Unplan-Calendar-2", parentId: null },
  ]), "unplan-calendar-3");
});

test("recognizes provider capacity errors without swallowing unrelated failures", () => {
  assert.equal(isTodoistProjectCapacityError(new Error("Maximum number of 300 tasks reached")), true);
  assert.equal(isTodoistProjectCapacityError(new Error("Todoist unavailable")), false);
});

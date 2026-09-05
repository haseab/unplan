import assert from "node:assert/strict";
import test from "node:test";
import { changedTodoistProjectOrders, type TodoistTask } from "./todoist";
import {
  isLocalTask,
  LOCAL_TASK_PROJECT_ID,
  parseLocalTasks,
  serializeLocalTasks,
} from "./local-tasks";

const localTask = (id = "local-one"): TodoistTask => ({
  id,
  content: "Write the brief",
  description: "",
  priority: 1,
  projectId: LOCAL_TASK_PROJECT_ID,
  due: null,
  source: "local",
});

test("local tasks round-trip through browser storage", () => {
  const parsed = parseLocalTasks(serializeLocalTasks([localTask()]));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].content, "Write the brief");
  assert.equal(isLocalTask(parsed[0]), true);
});

test("invalid local task storage is ignored", () => {
  assert.deepEqual(parseLocalTasks("not json"), []);
  assert.deepEqual(parseLocalTasks(JSON.stringify([{ id: 42 }])), []);
});

test("local task movement is excluded from Todoist order updates", () => {
  const providerTask: TodoistTask = {
    ...localTask("provider-one"),
    projectId: "todoist-project",
    source: undefined,
  };
  assert.deepEqual(
    changedTodoistProjectOrders(
      [providerTask, localTask()],
      [localTask(), providerTask],
    ),
    [],
  );
});


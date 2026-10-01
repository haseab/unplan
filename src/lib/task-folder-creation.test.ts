import assert from "node:assert/strict";
import test from "node:test";
import { createTaskFolder } from "./task-folder-creation";
import { readTodoistFolderPreferences, TODOIST_CUSTOM_GROUPS_STORAGE_KEY, TODOIST_GROUP_PARENTS_STORAGE_KEY } from "./todoist-folder-backup";
import { taskTriageFolders } from "./task-triage";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } as Storage;
};

test("created folders persist at the root and inside existing nested folders", () => {
  const storage = memoryStorage();
  const root = createTaskFolder(storage, [], " Work ", null);
  const child = createTaskFolder(storage, [root], "Research", root);
  const nested = createTaskFolder(storage, [root, child], " Notes / ideas ", child);
  const groups = JSON.parse(storage.getItem(TODOIST_CUSTOM_GROUPS_STORAGE_KEY)!);
  const { groupOrder: order, groupParents: parents } = readTodoistFolderPreferences(storage);
  assert.deepEqual(groups, ["Work", "Research", "Notes - ideas"]);
  assert.deepEqual(parents, { Work: null, Research: "Work", "Notes - ideas": "Research" });
  assert.deepEqual(taskTriageFolders({ groups, order, parents, query: "Work / Research / Notes" }), [
    { name: nested, label: nested, depth: 2, path: "Work / Research / Notes - ideas" },
  ]);
});

test("invalid or duplicate folders never change stored hierarchy", () => {
  const storage = memoryStorage();
  createTaskFolder(storage, [], "Work", null);
  const before = storage.getItem(TODOIST_CUSTOM_GROUPS_STORAGE_KEY);
  for (const [name, parent] of [["", null], [" work ", null], ["Ungrouped", null], ["Child", "Missing"]]) {
    assert.throws(() => createTaskFolder(storage, ["Work"], name!, parent));
  }
  assert.equal(storage.getItem(TODOIST_CUSTOM_GROUPS_STORAGE_KEY), before);
});

test("failed hierarchy writes roll back the folder list", () => {
  const storage = memoryStorage();
  const setItem = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === TODOIST_GROUP_PARENTS_STORAGE_KEY) throw new Error("Storage full");
    setItem(key, value);
  };
  assert.throws(() => createTaskFolder(storage, [], "Work", null), /Storage full/);
  assert.equal(storage.getItem(TODOIST_CUSTOM_GROUPS_STORAGE_KEY), null);
  assert.equal(storage.getItem(TODOIST_GROUP_PARENTS_STORAGE_KEY), null);
});

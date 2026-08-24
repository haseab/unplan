import assert from "node:assert/strict";
import test from "node:test";

import {
  createTodoistFolderHierarchyBackup,
  parseTodoistFolderHierarchyBackup,
  restoreTodoistFolderHierarchyBackup,
  TODOIST_CUSTOM_GROUPS_STORAGE_KEY,
  TODOIST_GROUP_ORDER_STORAGE_KEY,
  TODOIST_GROUP_PARENTS_STORAGE_KEY,
} from "./todoist-folder-backup";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test("folder hierarchy backup round-trips local preferences", () => {
  const source = new MemoryStorage();
  source.setItem(TODOIST_CUSTOM_GROUPS_STORAGE_KEY, JSON.stringify(["Systems", "Easy Tasks"]));
  source.setItem(TODOIST_GROUP_ORDER_STORAGE_KEY, JSON.stringify(["Easy Tasks", "Systems"]));
  source.setItem(TODOIST_GROUP_PARENTS_STORAGE_KEY, JSON.stringify({ "Easy Tasks": "Systems" }));

  const backup = createTodoistFolderHierarchyBackup(source, "2026-08-23T00:00:00.000Z");
  const destination = new MemoryStorage();
  restoreTodoistFolderHierarchyBackup(JSON.stringify(backup), destination);

  assert.deepEqual(
    createTodoistFolderHierarchyBackup(destination, backup.exportedAt),
    backup,
  );
});

test("folder hierarchy backup rejects circular nesting", () => {
  const backup = createTodoistFolderHierarchyBackup(new MemoryStorage());
  assert.throws(
    () => parseTodoistFolderHierarchyBackup(JSON.stringify({
      ...backup,
      groupParents: { One: "Two", Two: "One" },
    })),
    /circular nesting/,
  );
});

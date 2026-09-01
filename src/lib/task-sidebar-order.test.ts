import assert from "node:assert/strict";
import test from "node:test";
import {
  moveTask,
  sidebarFocusFallbackNavigationId,
  sidebarNavigationItems,
  sidebarTriageNavigationItems,
  taskMoveIndex,
} from "./task-sidebar-order";

test("focuses the first task in the most recently opened folder", () => {
  const openFolders = new Map([
    ["folder:Work", ["task:work-1", "task:work-2"]],
    ["folder:Personal", ["task:personal-1"]],
  ]);

  assert.equal(sidebarFocusFallbackNavigationId({
    firstFolderId: "folder:Work",
    openFolders,
    recentOpenFolderIds: ["folder:Personal", "folder:Work"],
  }), "task:work-1");
});

test("focus fallback uses an empty open folder, then the first closed folder", () => {
  assert.equal(sidebarFocusFallbackNavigationId({
    firstFolderId: "folder:Work",
    openFolders: new Map([["folder:Personal", []]]),
    recentOpenFolderIds: ["folder:Personal"],
  }), "folder:Personal");
  assert.equal(sidebarFocusFallbackNavigationId({
    firstFolderId: "folder:Work",
    openFolders: new Map(),
    recentOpenFolderIds: [],
  }), "folder:Work");
});

test("moves a task one position and stops at list boundaries", () => {
  assert.deepEqual(moveTask(["a", "b", "c"], 1, taskMoveIndex(1, 3, -1)), ["b", "a", "c"]);
  assert.equal(taskMoveIndex(0, 3, -1), 0);
  assert.equal(taskMoveIndex(2, 3, 1), 2);
});

test("orders visible triage actions before the folder navigation", () => {
  assert.deepEqual(sidebarTriageNavigationItems({
    extractedCount: 12,
    normalCount: 3,
  }), [
    { id: "triage:extracted", kind: "action" },
    { id: "triage:normal", kind: "action" },
  ]);
  assert.deepEqual(sidebarTriageNavigationItems({
    extractedCount: 0,
    normalCount: 3,
  }), [
    { id: "triage:normal", kind: "action" },
  ]);
});

test("orders folders, expanded descendants, and tasks as one simple navigation list", () => {
  const groups = [
    { group: "Work", taskIds: ["work-1"] },
    { group: "Launch", taskIds: ["launch-1", "launch-2"] },
    { group: "Later", taskIds: ["later-1"] },
  ];

  assert.deepEqual(
    sidebarNavigationItems(groups, { Launch: "Work" }, new Set()),
    [
      { id: "folder:Work", kind: "folder" },
      { id: "folder:Launch", kind: "folder" },
      { id: "task:launch-1", kind: "task" },
      { id: "task:launch-2", kind: "task" },
      { id: "task:work-1", kind: "task" },
      { id: "folder:Later", kind: "folder" },
      { id: "task:later-1", kind: "task" },
    ],
  );
});

test("collapsed folders skip their complete subtree and continue with the next folder", () => {
  const groups = [
    { group: "Work", taskIds: ["work-1"] },
    { group: "Launch", taskIds: ["launch-1"] },
    { group: "Later", taskIds: ["later-1"] },
  ];

  assert.deepEqual(
    sidebarNavigationItems(groups, { Launch: "Work" }, new Set(["Work"])),
    [
      { id: "folder:Work", kind: "folder" },
      { id: "folder:Later", kind: "folder" },
      { id: "task:later-1", kind: "task" },
    ],
  );
});

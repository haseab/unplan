import test from "node:test";
import assert from "node:assert/strict";
import {
  isExtractedTaskTriageShortcut,
  taskTriageFolders,
} from "./task-triage";

test("Cmd/Ctrl + E opens extracted task triage when tasks are available", () => {
  const shortcut = (
    overrides: Partial<Parameters<typeof isExtractedTaskTriageShortcut>[0]> = {},
  ) => isExtractedTaskTriageShortcut({
    altKey: false,
    extractedTaskCount: 2,
    key: "e",
    modalOpen: false,
    modifier: true,
    repeat: false,
    shiftKey: false,
    ...overrides,
  });

  assert.equal(shortcut(), true);
  assert.equal(shortcut({ key: "E" }), true);
  assert.equal(shortcut({ extractedTaskCount: 0 }), false);
  assert.equal(shortcut({ modalOpen: true }), false);
  assert.equal(shortcut({ modifier: false }), false);
  assert.equal(shortcut({ repeat: true }), false);
  assert.equal(shortcut({ shiftKey: true }), false);
  assert.equal(shortcut({ altKey: true }), false);
});

test("task triage folders follow saved hierarchy and order", () => {
  assert.deepEqual(taskTriageFolders({
    groups: ["Launch", "Work", "Research", "Personal"],
    order: ["Personal", "Work", "Research", "Launch"],
    parents: { Launch: "Work", Research: "Work" },
  }), [
    { depth: 0, label: "Personal", name: "Personal", path: "Personal" },
    { depth: 0, label: "Work", name: "Work", path: "Work" },
    { depth: 1, label: "Research", name: "Research", path: "Work / Research" },
    { depth: 1, label: "Launch", name: "Launch", path: "Work / Launch" },
  ]);
});

test("task triage folder search matches names and full paths", () => {
  const options = {
    groups: ["Work", "Research", "Personal"],
    order: [],
    parents: { Research: "Work" },
  };

  assert.deepEqual(
    taskTriageFolders({ ...options, query: "research" }).map(({ name }) => name),
    ["Research"],
  );
  assert.deepEqual(
    taskTriageFolders({ ...options, query: "work / res" }).map(({ name }) => name),
    ["Research"],
  );
});

test("task triage folders deduplicate case-insensitively", () => {
  assert.deepEqual(taskTriageFolders({
    groups: ["Work", " work ", "Personal"],
    order: [],
    parents: {},
  }).map(({ name }) => name), ["work", "Personal"]);
});

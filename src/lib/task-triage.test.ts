import test from "node:test";
import assert from "node:assert/strict";
import {
  taskTriageFolders,
  taskTriagePhase,
  taskTriageShortcutMode,
} from "./task-triage";

test("Cmd/Ctrl + E opens extraction, task triage, then Priority review", () => {
  const shortcut = (
    overrides: Partial<Parameters<typeof taskTriageShortcutMode>[0]> = {},
  ) => taskTriageShortcutMode({
    altKey: false,
    extractedTaskCount: 2,
    key: "e",
    modalOpen: false,
    modifier: true,
    normalTaskCount: 3,
    repeat: false,
    shiftKey: false,
    ...overrides,
  });

  assert.equal(shortcut(), "extracted");
  assert.equal(shortcut({ key: "E" }), "extracted");
  assert.equal(shortcut({ extractedTaskCount: 0 }), "normal");
  assert.equal(shortcut({ extractedTaskCount: 0, normalTaskCount: 0 }), "priority");
  assert.equal(shortcut({ modalOpen: true }), null);
  assert.equal(shortcut({ modifier: false }), null);
  assert.equal(shortcut({ repeat: true }), null);
  assert.equal(shortcut({ shiftKey: true }), null);
  assert.equal(shortcut({ altKey: true }), null);
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

test("review advances through extraction, task triage, and priority as queues empty", () => {
  assert.equal(taskTriagePhase("extracted", 2, 3), "extracted");
  assert.equal(taskTriagePhase("extracted", 0, 3), "normal");
  assert.equal(taskTriagePhase("extracted", 0, 0), "priority");
  assert.equal(taskTriagePhase("normal", 0, 1), "normal");
  assert.equal(taskTriagePhase("normal", 0, 0), "priority");
});

test("priority launch cannot skip pending queues and restores triage on rollback", () => {
  assert.equal(taskTriagePhase("priority", 0, 0), "priority");
  assert.equal(taskTriagePhase("priority", 0, 1), "normal");
  assert.equal(taskTriagePhase("priority", 1, 1), "extracted");
});

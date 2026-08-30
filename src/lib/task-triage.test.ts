import test from "node:test";
import assert from "node:assert/strict";
import { taskTriageFolders } from "./task-triage";

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

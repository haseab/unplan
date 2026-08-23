import assert from "node:assert/strict";
import test from "node:test";
import { resolveTodoistDestination, type TodoistProject, type TodoistSection } from "./todoist";

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

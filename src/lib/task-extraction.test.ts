import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarSource } from "./calendar-types";
import type { TodoistProject, TodoistTask } from "./todoist";
import {
  extractedTaskDescriptionMarkdown,
  findTaskExtractionProject,
  isExtractedTodoistTask,
  findTechnicalitiesCalendar,
  resolveTaskExtractionDestination,
} from "./task-extraction";

const projects: TodoistProject[] = [
  { id: "extract", inbox: false, name: " Task-Extraction ", parentId: null },
  { id: "inbox", inbox: true, name: "Inbox", parentId: null },
  { id: "work", inbox: false, name: "Work", parentId: null },
];

const calendar = (id: string, name: string, writable = true): CalendarSource => ({
  id,
  name,
  backgroundColor: "#000",
  foregroundColor: "#fff",
  provider: "google",
  writable,
});

test("finds the extraction project without case or surrounding whitespace", () => {
  assert.equal(findTaskExtractionProject(projects)?.id, "extract");
});

test("finds only a writable Technicalities calendar", () => {
  assert.equal(findTechnicalitiesCalendar([
    calendar("readonly", "Technicalities", false),
    calendar("target", " technicalities "),
  ])?.id, "target");
});

test("keeps tasks in the preferred project when it is not the extraction source", () => {
  assert.equal(
    resolveTaskExtractionDestination(projects, "extract", "work")?.id,
    "work",
  );
});

test("falls back to Inbox when extraction is the preferred project", () => {
  assert.equal(
    resolveTaskExtractionDestination(projects, "extract", "extract")?.id,
    "inbox",
  );
});

test("calendar scheduling distinguishes extraction tasks from stored tasks for rollback and completion", () => {
  const task: TodoistTask = { id: "extract-task", projectId: "extract", content: "Task", description: "", priority: 1, due: null };
  assert.equal(isExtractedTodoistTask(task, "extract"), true);
  assert.equal(isExtractedTodoistTask({ ...task, projectId: "inbox" }, "extract"), false);
  assert.equal(isExtractedTodoistTask(task, undefined), false);
});


test("legacy recording references become safe links at render time without changing stored text", () => {
  const description = "Recording source-id at 2026-10-28T17:46:21Z\n[DeepLog:tracking-id]";
  const formatted = extractedTaskDescriptionMarkdown(description);
  const href = /\]\(([^)]+)\)/.exec(formatted)![1];
  const target = new URL(href);
  assert.equal(target.origin, "https://deeplog.app");
  assert.equal(target.pathname, "/pendant");
  assert.equal(target.searchParams.get("q"), "2026-10-28T17:46:21.000Z to 2026-10-28T17:47:21.000Z");
  assert.equal(formatted, `[View transcript](${href})`);
  assert.equal(formatted.includes("tracking-id"), false);
  assert.equal(formatted.includes("source-id"), false);
  assert.equal(description, "Recording source-id at 2026-10-28T17:46:21Z\n[DeepLog:tracking-id]");
});

test("existing Markdown and bare links remain intact and invalid recording dates stay plain text", () => {
  for (const text of ["Read [source](https://example.test/source)", "Read https://example.test/source", "Recording source at 2026-13-99T99:99:99Z", "Plain task notes"]) {
    assert.equal(extractedTaskDescriptionMarkdown(text), text);
  }
});

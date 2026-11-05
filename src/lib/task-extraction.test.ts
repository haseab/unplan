import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarSource } from "./calendar-types";
import type { TodoistProject, TodoistTask } from "./todoist";
import {
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

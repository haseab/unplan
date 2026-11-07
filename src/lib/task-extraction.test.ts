import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarSource } from "./calendar-types";
import type { TodoistProject, TodoistTask } from "./todoist";
import {
  extractedTaskDescriptionMarkdown,
  extractedTaskDates,
  extractedTaskReviewAction,
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

const datedTask = (overrides: Partial<TodoistTask> = {}): TodoistTask => ({
  id: "dated", content: "Plan the lecture", description: "", priority: 1, projectId: "extract", due: null,
  ...overrides,
});

test("recording context uses the source timestamp in the viewer's timezone, separately from the deadline", () => {
  const dates = extractedTaskDates(datedTask({
    description: "Recording source-id at 2026-10-28T00:46:21Z [DeepLog:tracking-id]",
    createdAt: "2026-11-01T12:00:00Z",
    due: { date: "2026-10-29", datetime: "2026-10-29T20:00:00Z", recurring: false, string: "Thursday" },
  }), "America/Los_Angeles");
  assert.deepEqual(dates.map(({ label, dateTime }) => ({ label, dateTime })), [
    { label: "Recorded", dateTime: "2026-10-28T00:46:21.000Z" },
    { label: "Due", dateTime: "2026-10-29T20:00:00.000Z" },
  ]);
  assert.match(dates[0].text, /Oct 27, 2026/);
  assert.match(dates[0].text, /5:46 PM PDT/);
  assert.match(dates[1].text, /Oct 29, 2026/);
  assert.match(dates[1].text, /1:00 PM PDT/);
});

test("creation time is a labeled fallback and date-only deadlines never shift with the viewer's timezone", () => {
  const task = datedTask({
    createdAt: "2026-11-01T12:00:00Z",
    due: { date: "2026-11-02", recurring: false, string: "Monday" },
  });
  for (const zone of ["America/Los_Angeles", "Pacific/Kiritimati"]) {
    const dates = extractedTaskDates(task, zone);
    assert.equal(dates[0].label, "Created");
    assert.deepEqual(dates[1], { label: "Due", dateTime: "2026-11-02", text: "Nov 2, 2026" });
  }
});

test("missing or invalid dates are omitted and recording time never becomes a deadline", () => {
  assert.deepEqual(extractedTaskDates(datedTask()), []);
  assert.deepEqual(extractedTaskDates(datedTask({
    createdAt: "invalid", description: "Recording source at 2026-13-99T99:99:99Z",
    due: { date: "2026-02-30", datetime: "invalid", recurring: false, string: "invalid" },
  })), []);
  const recorded = extractedTaskDates(datedTask({ description: "Recording source at 2026-10-28T17:46:21Z" }));
  assert.deepEqual(recorded.map(({ label }) => label), ["Recorded"]);
});

test("extraction arrows skip, delete, or keep without interfering with editing or modified shortcuts", () => {
  const event = { key: "ArrowLeft", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false };
  assert.equal(extractedTaskReviewAction(event, false), "skip");
  assert.equal(extractedTaskReviewAction({ ...event, key: "ArrowUp" }, false), "delete");
  assert.equal(extractedTaskReviewAction({ ...event, key: "ArrowRight" }, false), "keep");
  assert.equal(extractedTaskReviewAction({ ...event, key: "ArrowDown" }, false), null);
  for (const key of ["ArrowLeft", "ArrowUp", "ArrowRight"]) {
    assert.equal(extractedTaskReviewAction({ ...event, key }, true), null);
    for (const change of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { shiftKey: true }, { repeat: true }, { isComposing: true }]) {
      assert.equal(extractedTaskReviewAction({ ...event, key, ...change }, false), null);
    }
  }
});

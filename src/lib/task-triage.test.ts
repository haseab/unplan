import test from "node:test";
import assert from "node:assert/strict";
import {
  describeTaskFollowUpInterval,
  orderTaskTriageTasks,
  isTaskTriageCalendarShortcut,
  taskTriageFolders,
  taskTriagePhase,
  taskTriagePreviousFolder,
  taskTriageShortcutMode,
} from "./task-triage";
import type { TodoistTask } from "./todoist";
import { todoistContentReturnedToTriage, todoistContentWithReviewAt } from "./todoist-calendar";
import { nextTaskReviewDate, parseTaskReviewPeriod } from "./task-review-period";

const task = (id: string, content = id): TodoistTask => ({
  id, content, description: "", due: null, priority: 1, projectId: "inbox",
});

test("follow-up intervals use compact days and hours, with minutes only below one day", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  const cases = [
    [1, "1 min"], [30, "30 min"], [60, "1h"], [61, "1h 1 min"],
    [120, "2h"], [1002, "16h 42 min"], [1439, "23h 59 min"],
    [1440, "1d"], [1441, "1d"], [1500, "1d 1h"], [2401, "1d 16h"],
    [9004, "6d 6h"], [10080, "7d"],
  ] as const;
  for (const [minutes, label] of cases) {
    const content = todoistContentWithReviewAt("Follow up", new Date(now.getTime() + minutes * 60_000), now);
    assert.equal(describeTaskFollowUpInterval(task("follow-up", content)), label);
  }
});

test("explicit periods use compact labels while calendar periods retain their units", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  for (const [input, label] of [
    ["9004 minutes", "6d 6h"], ["61 minutes", "1h 1 min"],
    ["1002 minutes", "16h 42 min"], ["49 hours", "2d 1h"],
    ["1 day", "1d"], ["2 weeks", "2w"], ["1 month", "1mo"], ["2 years", "2y"],
  ]) {
    const period = parseTaskReviewPeriod(input, now)!;
    const content = todoistContentWithReviewAt("Follow up", nextTaskReviewDate(period, now), now, period);
    assert.equal(describeTaskFollowUpInterval(task("follow-up", content)), label);
  }
});

test("follow-up labels round to the nearest minute and retain older tasks' folder defaults", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  for (const [seconds, label] of [[10, "1 min"], [3590, "1h"]] as const) {
    const content = todoistContentWithReviewAt("Follow up", new Date(now.getTime() + seconds * 1000), now);
    assert.equal(describeTaskFollowUpInterval(task("follow-up", content)), label);
  }
  assert.equal(describeTaskFollowUpInterval(task("legacy", todoistContentReturnedToTriage("Follow up", "Priority Tomorrow"))), "3d");
  assert.equal(describeTaskFollowUpInterval(task("legacy")), "7d");
});

test("refreshed tasks can keep their previous folder only while it exists", () => {
  for (const group of ["Work", "Priority Later"]) {
    const refreshed = task("refreshed", todoistContentReturnedToTriage("Plan", group));
    assert.equal(taskTriagePreviousFolder(refreshed, [group, "Other"]), group);
    assert.equal(taskTriagePreviousFolder(refreshed, ["Other"]), null);
  }
  assert.equal(taskTriagePreviousFolder(task("fresh"), ["Work"]), null);
  assert.equal(taskTriagePreviousFolder(null, ["Work"]), null);
});

test("fresh Todoist tasks precede monthly and priority returns without mutating the queue", () => {
  const monthly = task("monthly", todoistContentReturnedToTriage("Monthly", "Work"));
  const priority = task("priority", todoistContentReturnedToTriage("Priority", "Priority Later"));
  const direct = task("direct");
  const ungrouped = task("ungrouped", "Fresh [[unplan:v1;group=Ungrouped]]");
  const input = Object.freeze([monthly, direct, priority, ungrouped]);
  assert.deepEqual(orderTaskTriageTasks(input), [direct, ungrouped, priority, monthly]);
  assert.deepEqual(input, [monthly, direct, priority, ungrouped]);
  assert.deepEqual(orderTaskTriageTasks([monthly, priority]), [priority, monthly]);
  assert.deepEqual(orderTaskTriageTasks([]), []);
});

test("refreshed tasks stay grouped by category with Tomorrow before Later", () => {
  const returned = (id: string, group: string) =>
    task(id, todoistContentReturnedToTriage(id, group));
  const work = returned("work-1", "Work");
  const later = returned("later-1", "Priority Later");
  const personal = returned("personal", "Personal");
  const tomorrow = returned("tomorrow-1", "Priority Tomorrow");
  const work2 = returned("work-2", "Work");
  const tomorrow2 = returned("tomorrow-2", "Priority Tomorrow");
  const later2 = returned("later-2", "Priority Later");
  const fresh = task("fresh");
  const input = Object.freeze([work, later, personal, tomorrow, work2, tomorrow2, fresh, later2]);

  assert.deepEqual(orderTaskTriageTasks(input), [
    fresh, tomorrow, tomorrow2, later, later2, work, work2, personal,
  ]);
  assert.deepEqual(input, [work, later, personal, tomorrow, work2, tomorrow2, fresh, later2]);
});

test("refreshed category ordering recognizes nested and case-insensitive priority names", () => {
  const returned = (id: string, group: string) =>
    task(id, todoistContentReturnedToTriage(id, group));
  const work = returned("work", "Work");
  const later = returned("later", "Priority / PRIORITY LATER");
  const tomorrow = returned("tomorrow", "Priority / PRIORITY TOMORROW");
  const tomorrow2 = returned("tomorrow-2", "Priority / Priority Tomorrow");

  assert.deepEqual(orderTaskTriageTasks([work, later, tomorrow, tomorrow2]), [
    tomorrow, tomorrow2, later, work,
  ]);
});

test("new arrivals take precedence even after the fresh queue was exhausted", () => {
  const returned = task("returned", todoistContentReturnedToTriage("Old", "Later"));
  const incoming = task("incoming");
  assert.equal(orderTaskTriageTasks([returned])[0], returned);
  assert.equal(orderTaskTriageTasks([returned, incoming])[0], incoming);
  assert.equal(taskTriagePhase("extracted", 1, 2), "extracted");
});

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

test("the Follow-up triage banner opens priority review directly while Cmd E keeps its sequence", () => {
  assert.equal(taskTriagePhase("follow-up", 2, 3), "priority");
  assert.equal(taskTriagePhase("extracted", 2, 3), "extracted");
  assert.equal(taskTriagePhase("normal", 0, 3), "normal");
});

test("an active follow-up triage finishes before newly refreshed tasks are shown", () => {
  for (const mode of ["extracted", "normal", "priority", "follow-up"] as const) {
    assert.equal(taskTriagePhase(mode, 0, 0), "priority");
    assert.equal(taskTriagePhase(mode, 0, 1, "priority"), "priority");
    assert.equal(taskTriagePhase(mode, 1, 2, "priority"), "priority");
  }
  assert.equal(taskTriagePhase("normal", 0, 2, null), "normal", "completion releases the queued tasks");
  assert.equal(taskTriagePhase("extracted", 1, 2, null), "extracted", "a new session follows the usual order");
});

test("Cmd/Ctrl Shift Left schedules extraction and task triage; Cmd/Ctrl Left stays native", () => {
  const key = { key: "ArrowLeft", metaKey: false, ctrlKey: false, altKey: false, shiftKey: true, repeat: false, isComposing: false };
  for (const phase of ["extracted", "normal"] as const) {
    for (const modifier of [{ metaKey: true }, { ctrlKey: true }]) {
      const shortcut = { ...key, ...modifier };
      assert.equal(isTaskTriageCalendarShortcut(shortcut, phase, false), true);
      for (const change of [{ metaKey: false, ctrlKey: false }, { altKey: true }, { shiftKey: false }, { repeat: true }, { isComposing: true }, { key: "ArrowRight" }]) {
        assert.equal(isTaskTriageCalendarShortcut({ ...shortcut, ...change }, phase, false), false);
      }
      assert.equal(isTaskTriageCalendarShortcut(shortcut, phase, true), false);
    }
  }
  assert.equal(isTaskTriageCalendarShortcut({ ...key, metaKey: true }, "priority", false), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import type { TodoistTask } from "./todoist";
import { attentionTriageCounts } from "./attention-triage-counts";
import { todoistContentReturnedToTriage, todoistContentWithReviewAt } from "./todoist-calendar";
const now = new Date("2026-11-08T20:00:00Z");
const task = (id: string, projectId = "inbox", content = id): TodoistTask => ({ id, content, projectId, description: "", due: null, priority: 1 });
const projects = [
  { id: "inbox", name: "Inbox", inbox: true, parentId: null },
  { id: "extraction", name: "task-extraction", inbox: false, parentId: null },
  { id: "bucket", name: "unplan-calendar-2", inbox: false, parentId: null },
  { id: "other", name: "Unrelated", inbox: false, parentId: null },
];
test("counts the three Unplan triages, with purple using priority review rather than calendar reminders", () => {
  const tasks = [task("extract", "extraction"), task("fresh"), task("bucket", "bucket"), task("unrelated", "other"),
    task("review", "inbox", todoistContentReturnedToTriage("Review", "Priority Later")),
    task("future", "inbox", todoistContentWithReviewAt("Future", new Date(now.getTime() + 86400000), now)),
    { ...task("reminder"), description: "unplan-follow-up:v1\n[]" },
    { ...task("settings"), description: "unplan:task-refresh-settings:v1\n{}" }];
  assert.deepEqual(attentionTriageCounts(tasks, projects, {}, now), { extraction: 1, tasks: 2, followUps: 1 });
  assert.deepEqual(attentionTriageCounts(tasks, projects, {}, now, ["other"]), { extraction: 1, tasks: 3, followUps: 1 });
});
test("empty sources return zero rather than a missing extraction project matching undefined", () => {
  assert.deepEqual(attentionTriageCounts([], [], {}, now), { extraction: 0, tasks: 0, followUps: 0 });
});

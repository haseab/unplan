import { parseTaskReviewPeriod, readTaskReviewPeriod } from "./task-review-period";
import test from "node:test";
import assert from "node:assert/strict";
import { parseTaskReviewDate } from "./task-review-date";
import { calendarEventDetailsFromTodoistContent, todoistContentWithGroupChange, todoistContentWithReviewAt } from "./todoist-calendar";
import { taskAgingUpdate } from "./task-aging";
import { isNormalTaskTriageTask, taskTriageKeepContent } from "./task-triage";
import { priorityTaskContentWithReviewAt, priorityReviewTasks } from "./priority-task-review";
import type { TodoistTask } from "./todoist";

const now = new Date(2026, 7, 20, 14, 30);
const makeTask = (content: string): TodoistTask => ({ id: "review", content, description: "notes", due: null, priority: 1, projectId: "tasks" });

test("review dates parse compact and natural durations without discarding minutes", () => {
  for (const input of ["7d", "7 days", "in 7 days"]) {
    assert.equal(parseTaskReviewDate(input, now)?.getTime(), new Date(2026, 7, 27, 14, 30).getTime());
  }
  assert.equal(parseTaskReviewDate("61 min", now)?.getTime(), now.getTime() + 61 * 60_000);
  assert.equal(parseTaskReviewDate("2h", now)?.getTime(), now.getTime() + 120 * 60_000);
  assert.equal(parseTaskReviewDate("sep 1", now)?.getTime(), new Date(2026, 8, 1).getTime());
  assert.equal(parseTaskReviewDate("tomorrow at 9am", now)?.getTime(), new Date(2026, 7, 21, 9).getTime());
});

test("rejects invalid, past, and zero-length follow-ups", () => {
  for (const input of ["", "nonsense", "0d", "-7d", "yesterday", "Sep 1 2020", "7 days blah", "9999999999999999d"]) {
    assert.equal(parseTaskReviewDate(input, now), null, input);
  }
});

test("relative days preserve local time across daylight saving", () => {
  const before = new Date(2026, 9, 31, 14, 30);
  const after = parseTaskReviewDate("1d", before)!;
  assert.equal(after.getHours(), 14);
  assert.equal(after.getTime() - before.getTime(), 25 * 3_600_000);
});

for (const group of ["Priority Today", "Priority Later", "Launch"]) {
  test(`explicit follow-up overrides folder aging and returns ${group} at the exact boundary`, () => {
    const reviewAt = new Date(now.getTime() + 61 * 60_000);
    const content = todoistContentWithReviewAt(todoistContentWithGroupChange("Plan", group, new Date(2026, 0, 1)), reviewAt);
    const task = makeTask(content);
    assert.equal(calendarEventDetailsFromTodoistContent(content).reviewAt, reviewAt.toISOString());
    assert.equal(taskAgingUpdate(task, now), null);
    assert.deepEqual(priorityReviewTasks([task], { Launch: "Priority Today" }), []);
    const returned = taskAgingUpdate(task, reviewAt)!;
    assert.equal(returned.reason, "retriage-priority");
    const details = calendarEventDetailsFromTodoistContent(returned.content);
    assert.equal(details.group, "Ungrouped");
    assert.equal(details.triageSourceGroup, group);
    const parents = { Launch: "Priority Today" };
    assert.equal(isNormalTaskTriageTask(makeTask(returned.content), parents, reviewAt), true);
    assert.equal(isNormalTaskTriageTask(makeTask(todoistContentWithGroupChange(returned.content, "Ungrouped")), parents), true, "manual retriage is still available");
    assert.deepEqual(priorityReviewTasks([makeTask(returned.content)], parents), []);
    const snoozedAgain = makeTask(priorityTaskContentWithReviewAt(makeTask(returned.content), new Date(reviewAt.getTime() + 60_000)));
    assert.equal(calendarEventDetailsFromTodoistContent(snoozedAgain.content).group, group);
    assert.equal(calendarEventDetailsFromTodoistContent(snoozedAgain.content).triageSourceGroup, undefined);
    assert.equal(isNormalTaskTriageTask(snoozedAgain, parents), false);
    assert.deepEqual(priorityReviewTasks([snoozedAgain], parents), []);
    assert.equal(taskAgingUpdate(makeTask(returned.content), reviewAt), null, "returns only once");
    assert.equal(calendarEventDetailsFromTodoistContent(todoistContentWithGroupChange(returned.content, group)).reviewAt, undefined);
    assert.equal(taskAgingUpdate({ ...task, optimistic: true }, reviewAt), null, "does not race pending mutations");
  });
}

test("a default refresh asks for a follow-up date, then an assigned date returns to task triage", () => {
  const task = makeTask(todoistContentWithGroupChange("Default refresh", "Priority Tomorrow", new Date(now.getTime() - 3 * 86_400_000)));
  const refreshed = makeTask(taskAgingUpdate(task, now)!.content);
  assert.equal(isNormalTaskTriageTask(refreshed, {}, now), false);
  assert.deepEqual(priorityReviewTasks([refreshed], {}).map(({ id }) => id), [task.id]);
  const date = parseTaskReviewDate("61 min", now)!;
  const assigned = makeTask(priorityTaskContentWithReviewAt(refreshed, date));
  assert.equal(calendarEventDetailsFromTodoistContent(assigned.content).group, "Priority Tomorrow");
  assert.equal(taskAgingUpdate(assigned, now), null);
  assert.deepEqual(priorityReviewTasks([assigned], {}), []);
  const due = makeTask(taskAgingUpdate(assigned, date)!.content);
  assert.equal(isNormalTaskTriageTask(due, {}, date), true);
  assert.deepEqual(priorityReviewTasks([due], {}), []);
});

test("an older snooze stored in Ungrouped stays hidden until its assigned date", () => {
  const due = new Date(now.getTime() + 61 * 60_000);
  const task = makeTask(`Snoozed [[unplan:v1;group=Ungrouped;triageSourceGroup=Priority%20Today;reviewAt=${encodeURIComponent(due.toISOString())}]]`);
  assert.equal(isNormalTaskTriageTask(task, {}, now), false);
  assert.deepEqual(priorityReviewTasks([task], {}), []);
  assert.equal(isNormalTaskTriageTask(task, {}, due), true);
});


test("Right Arrow repeats the chosen interval from now; choosing even the same folder clears it", () => {
  for (const minutes of [61, 7 * 24 * 60]) {
    const date = new Date(now.getTime() + minutes * 60_000);
    const original = makeTask(todoistContentWithGroupChange("Repeat me", "Priority Today", now));
    const assigned = makeTask(priorityTaskContentWithReviewAt(original, date, now));
    const returned = makeTask(taskAgingUpdate(assigned, date)!.content);
    const reviewedAt = new Date(date.getTime() + 2 * 86_400_000);
    const repeated = makeTask(taskTriageKeepContent(returned, "Priority Today", reviewedAt));
    const details = calendarEventDetailsFromTodoistContent(repeated.content);
    assert.equal(details.reviewIntervalMs, minutes * 60_000);
    assert.equal(details.reviewAt, new Date(reviewedAt.getTime() + minutes * 60_000).toISOString());
    assert.equal(details.group, "Priority Today");
    assert.equal(isNormalTaskTriageTask(repeated, {}, reviewedAt), false);
    assert.deepEqual(priorityReviewTasks([repeated], {}), []);
    const chosen = makeTask(todoistContentWithGroupChange(returned.content, "Priority Today", reviewedAt));
    assert.equal(calendarEventDetailsFromTodoistContent(chosen.content).reviewIntervalMs, undefined);
    assert.equal(calendarEventDetailsFromTodoistContent(chosen.content).reviewAt, undefined);
    assert.deepEqual(priorityReviewTasks([chosen], {}).map(({ id }) => id), [original.id]);
  }
});


function assignedPeriodTask(input: string, start: Date) {
  const original = makeTask(todoistContentWithGroupChange("Calendar follow-up", "Priority Today", start));
  return makeTask(priorityTaskContentWithReviewAt(original, parseTaskReviewDate(input, start)!, start, parseTaskReviewPeriod(input, start)!));
}

function repeatAtDue(task: TodoistTask) {
  const due = new Date(calendarEventDetailsFromTodoistContent(task.content).reviewAt!);
  const returned = makeTask(taskAgingUpdate(task, due)!.content);
  return makeTask(taskTriageKeepContent(returned, "Priority Today", due));
}

test("monthly repeats preserve the 1st rather than repeating 31 elapsed days", () => {
  let task = assignedPeriodTask("1mo", new Date(2027, 0, 1, 10));
  for (const month of [1, 2, 3]) {
    assert.equal(calendarEventDetailsFromTodoistContent(task.content).reviewAt, new Date(2027, month, 1, 10).toISOString());
    assert.equal(calendarEventDetailsFromTodoistContent(task.content).reviewPeriod?.unit, "month");
    task = repeatAtDue(task);
  }
});

test("monthly anchors clamp for February and restore the 31st in March", () => {
  const task = assignedPeriodTask("1 month", new Date(2027, 0, 31, 10));
  assert.equal(calendarEventDetailsFromTodoistContent(task.content).reviewAt, new Date(2027, 1, 28, 10).toISOString());
  const next = repeatAtDue(task);
  assert.equal(calendarEventDetailsFromTodoistContent(next.content).reviewAt, new Date(2027, 2, 31, 10).toISOString());
  const refiling = todoistContentWithGroupChange(next.content, "Priority Today");
  assert.equal(calendarEventDetailsFromTodoistContent(refiling).reviewPeriod, undefined);
});

test("monthly repeats keep their day even when reviewed late", () => {
  const task = assignedPeriodTask("in a month", new Date(2027, 0, 1, 10));
  const returned = makeTask(taskAgingUpdate(task, new Date(2027, 1, 3, 10))!.content);
  const next = makeTask(taskTriageKeepContent(returned, "Priority Today", new Date(2027, 1, 3, 10)));
  assert.equal(calendarEventDetailsFromTodoistContent(next.content).reviewAt, new Date(2027, 2, 1, 10).toISOString());
});

test("annual repeats retain February 29 through non-leap years", () => {
  let task = assignedPeriodTask("1y", new Date(2028, 1, 29, 10));
  for (const year of [2029, 2030, 2031, 2032]) {
    const day = year === 2032 ? 29 : 28;
    assert.equal(calendarEventDetailsFromTodoistContent(task.content).reviewAt, new Date(year, 1, day, 10).toISOString());
    task = repeatAtDue(task);
  }
});

for (const input of ["7d", "1w"]) {
  test(`${input} repeats preserve local time across daylight saving`, () => {
    const task = assignedPeriodTask(input, new Date(2026, 9, 31, 10));
    assert.equal(calendarEventDetailsFromTodoistContent(task.content).reviewAt, new Date(2026, 10, 7, 10).toISOString());
    const next = repeatAtDue(task);
    assert.equal(calendarEventDetailsFromTodoistContent(next.content).reviewAt, new Date(2026, 10, 14, 10).toISOString());
  });
}

test("stored calendar rules reject malformed values and tolerate legacy records", () => {
  for (const value of [undefined, "{", "null", JSON.stringify({ amount: 1, unit: "month", dayOfMonth: 32, monthOfYear: 0 })]) {
    assert.equal(readTaskReviewPeriod(value), undefined);
  }
  assert.equal(parseTaskReviewPeriod("1constructor"), null);
});

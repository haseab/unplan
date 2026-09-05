import test from "node:test";
import assert from "node:assert/strict";
import type { TodoistTask } from "./todoist";
import {
  isTaskAgingReconciliationCoolingDown,
  oneCalendarMonthAfter,
  PRIORITY_LATER_MAX_AGE_MS,
  TASK_AGING_MAX_WRITES_PER_RUN,
  TASK_AGING_RECONCILIATION_COOLDOWN_MS,
  taskAgingBatch,
  taskAgingUpdate,
} from "./task-aging";
import {
  calendarEventDetailsFromTodoistContent,
  todoistContentWithGroupChange,
} from "./todoist-calendar";

const task = (content: string, optimistic = false, id = "task-1"): TodoistTask => ({
  id,
  content,
  description: "",
  due: null,
  optimistic,
  priority: 1,
  projectId: "inbox",
});

const now = new Date("2026-09-05T18:30:00.000Z");

test("stamps legacy filed tasks from the time they are first observed", () => {
  for (const group of ["Priority Later", "This month"]) {
    const update = taskAgingUpdate(
      task(`Plan [[unplan:v1;group=${encodeURIComponent(group)}]]`),
      now,
    );
    assert.equal(update?.reason, "stamp");
    assert.equal(
      calendarEventDetailsFromTodoistContent(update!.content).groupChangedAt,
      now.toISOString(),
    );
  }
});

test("leaves priority-later tasks alone before the three-day boundary", () => {
  const changedAt = new Date(now.getTime() - PRIORITY_LATER_MAX_AGE_MS + 1);
  assert.equal(taskAgingUpdate(
    task(todoistContentWithGroupChange("Plan", "Priority Later", changedAt)),
    now,
  ), null);
});

test("returns priority-later tasks to triage at the three-day boundary", () => {
  const changedAt = new Date(now.getTime() - PRIORITY_LATER_MAX_AGE_MS);
  const update = taskAgingUpdate(
    task(todoistContentWithGroupChange("Plan", "Priority Later", changedAt)),
    now,
  );

  assert.equal(update?.reason, "retriage-priority");
  assert.deepEqual(calendarEventDetailsFromTodoistContent(update!.content), {
    title: "Plan",
    group: "Ungrouped",
    groupChangedAt: now.toISOString(),
    triageSourceGroup: "Priority Later",
  });
});

test("returns non-priority tasks to triage after one calendar month", () => {
  const changedAt = new Date("2026-01-31T18:30:00.000Z");
  const beforeDeadline = new Date("2026-02-28T18:29:59.999Z");
  assert.equal(taskAgingUpdate(
    task(todoistContentWithGroupChange("Plan", "Work / Later", changedAt)),
    beforeDeadline,
  ), null);

  const update = taskAgingUpdate(
    task(todoistContentWithGroupChange("Plan", "Work / Later", changedAt)),
    new Date("2026-02-28T18:30:00.000Z"),
  );
  assert.equal(update?.reason, "retriage-monthly");
  assert.deepEqual(calendarEventDetailsFromTodoistContent(update!.content), {
    title: "Plan",
    group: "Ungrouped",
    groupChangedAt: "2026-02-28T18:30:00.000Z",
    triageSourceGroup: "Work / Later",
  });
});

test("clamps calendar-month deadlines to the target month's final day", () => {
  assert.equal(
    oneCalendarMonthAfter(new Date("2024-01-31T09:15:00.000Z")).toISOString(),
    "2024-02-29T09:15:00.000Z",
  );
});

test("clears refreshed-task context when the task is filed again", () => {
  const old = new Date(now.getTime() - PRIORITY_LATER_MAX_AGE_MS);
  const returned = taskAgingUpdate(
    task(todoistContentWithGroupChange("Plan", "Priority Later", old)),
    now,
  );
  const filed = todoistContentWithGroupChange(
    returned!.content,
    "This week",
    new Date(now.getTime() + 1_000),
  );

  assert.deepEqual(calendarEventDetailsFromTodoistContent(filed), {
    title: "Plan",
    group: "This week",
    groupChangedAt: "2026-09-05T18:30:01.000Z",
  });
});

test("does not age other priority folders, triage tasks, or optimistic tasks", () => {
  const old = new Date("2020-01-01T00:00:00.000Z");
  assert.equal(taskAgingUpdate(
    task(todoistContentWithGroupChange("Plan", "Priority Today", old)),
    now,
  ), null);
  assert.equal(taskAgingUpdate(
    task(todoistContentWithGroupChange("Plan", "Ungrouped", old)),
    now,
  ), null);
  assert.equal(taskAgingUpdate(
    task("Plan [[unplan:v1;group=This%20week]]", true),
    now,
  ), null);
});

test("enforces the fifteen-minute reconciliation cooldown", () => {
  const nowMs = now.getTime();
  assert.equal(isTaskAgingReconciliationCoolingDown(null, nowMs), false);
  assert.equal(isTaskAgingReconciliationCoolingDown(
    String(nowMs - TASK_AGING_RECONCILIATION_COOLDOWN_MS + 1),
    nowMs,
  ), true);
  assert.equal(isTaskAgingReconciliationCoolingDown(
    String(nowMs - TASK_AGING_RECONCILIATION_COOLDOWN_MS),
    nowMs,
  ), false);
});

test("caps each run and prioritizes real retriage work over legacy stamps", () => {
  const legacyTasks = Array.from(
    { length: TASK_AGING_MAX_WRITES_PER_RUN + 5 },
    (_, index) => task(
      `Legacy ${index} [[unplan:v1;group=Work]]`,
      false,
      `legacy-${index}`,
    ),
  );
  const expired = task(
    todoistContentWithGroupChange(
      "Expired",
      "Priority Later",
      new Date(now.getTime() - PRIORITY_LATER_MAX_AGE_MS),
    ),
    false,
    "expired",
  );
  const batch = taskAgingBatch([...legacyTasks, expired], now);

  assert.equal(batch.pending, TASK_AGING_MAX_WRITES_PER_RUN + 6);
  assert.equal(batch.updates.length, TASK_AGING_MAX_WRITES_PER_RUN);
  assert.equal(batch.deferred, 6);
  assert.equal(batch.updates[0].task.id, "expired");
  assert.equal(batch.updates[0].reason, "retriage-priority");
});

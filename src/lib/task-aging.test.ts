import { latestMonthEnd, parseTaskFolderActivity, taskFolderActivityState } from "./task-folder-activity";
import test from "node:test";
import assert from "node:assert/strict";
import type { TodoistTask } from "./todoist";
import {
  isTaskAgingReconciliationCoolingDown,
  PRIORITY_REFRESH_MAX_AGE_MS,
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
  for (const group of ["Priority Later", "Priority Tomorrow", "This month"]) {
    const update = taskAgingUpdate(
      task(`Plan [[unplan:v1;group=${encodeURIComponent(group)}]]`),
      now,
      { activity: { "This month": { active: true, changedAt: now.toISOString() } }, parents: {} },
    );
    assert.equal(update?.reason, "stamp");
    assert.equal(
      calendarEventDetailsFromTodoistContent(update!.content).groupChangedAt,
      now.toISOString(),
    );
  }
});

for (const group of ["Priority Later", "Priority Tomorrow", "Priority / PRIORITY TOMORROW"]) {
  test(`leaves ${group} tasks alone before the three-day boundary`, () => {
    const changedAt = new Date(now.getTime() - PRIORITY_REFRESH_MAX_AGE_MS + 1);
    assert.equal(taskAgingUpdate(
      task(todoistContentWithGroupChange("Plan", group, changedAt)),
      now,
    ), null);
  });

  test(`returns ${group} tasks to triage at the three-day boundary`, () => {
    const changedAt = new Date(now.getTime() - PRIORITY_REFRESH_MAX_AGE_MS);
    const update = taskAgingUpdate(
      task(todoistContentWithGroupChange("Plan", group, changedAt)),
      now,
    );

    assert.equal(update?.reason, "retriage-priority");
    assert.deepEqual(calendarEventDetailsFromTodoistContent(update!.content), {
      title: "Plan",
      group: "Ungrouped",
      groupChangedAt: now.toISOString(),
      triageSourceGroup: group,
    });
  });
}

const activeFolders = {
  activity: { Work: { active: true, changedAt: new Date(2026, 0, 15).toISOString() } },
  parents: { Research: "Work" },
};

test("only refreshes active non-priority folders at local month end", () => {
  const filed = new Date(2026, 1, 20, 12);
  const plan = task(todoistContentWithGroupChange("Plan", "Research", filed));
  assert.equal(taskAgingUpdate(plan, new Date(2026, 1, 27, 23, 59), activeFolders), null);
  const deadline = new Date(2026, 1, 28);
  const update = taskAgingUpdate(plan, deadline, activeFolders);
  assert.equal(update?.reason, "retriage-monthly");
  assert.deepEqual(calendarEventDetailsFromTodoistContent(update!.content), {
    title: "Plan", group: "Ungrouped", groupChangedAt: deadline.toISOString(), triageSourceGroup: "Research",
  });
  assert.equal(taskAgingUpdate(plan, deadline), null);
});

test("catches up missed month end, but does not refresh tasks filed after it", () => {
  const check = new Date(2026, 2, 4);
  const old = task(todoistContentWithGroupChange("Plan", "Work", new Date(2026, 1, 20)));
  assert.equal(taskAgingUpdate(old, check, activeFolders)?.reason, "retriage-monthly");
  const recent = task(todoistContentWithGroupChange("Plan", "Work", new Date(2026, 2, 1)));
  assert.equal(taskAgingUpdate(recent, check, activeFolders), null);
});

test("newly activated folders wait for their next month end", () => {
  const check = new Date(2026, 2, 4);
  const folders = { activity: { Work: { active: true, changedAt: check.toISOString() } }, parents: {} };
  const old = task(todoistContentWithGroupChange("Plan", "Work", new Date(2026, 0, 1)));
  assert.equal(taskAgingUpdate(old, check, folders), null);
  assert.equal(taskAgingUpdate(old, new Date(2026, 2, 31), folders)?.reason, "retriage-monthly");
});

test("month end follows local calendar dates including leap years", () => {
  assert.equal(latestMonthEnd(new Date(2024, 1, 29, 12)).getTime(), new Date(2024, 1, 29).getTime());
  assert.equal(latestMonthEnd(new Date(2024, 1, 28, 12)).getTime(), new Date(2024, 0, 31).getTime());
  assert.equal(latestMonthEnd(new Date(2026, 0, 1)).getTime(), new Date(2025, 11, 31).getTime());
});

test("active ancestors always activate descendants, even when the child is unmarked", () => {
  const activity = { ...activeFolders.activity, Research: { active: false, changedAt: now.toISOString() } };
  assert.equal(taskFolderActivityState("Research", activity, activeFolders.parents).active, true);
  assert.equal(taskFolderActivityState("Research", activity, activeFolders.parents).inherited, true);
  assert.equal(taskFolderActivityState("Research", activity, {}).active, false);
  assert.equal(taskFolderActivityState("Work / Nested", activity, {}).active, true);
  assert.equal(taskFolderActivityState("Other", activity, {}).active, false);
});

test("unmarking a parent preserves independently active children", () => {
  const activity = { Work: { active: false, changedAt: now.toISOString() }, Research: { active: true, changedAt: now.toISOString() } };
  assert.equal(taskFolderActivityState("Research", activity, activeFolders.parents).active, true);
  assert.equal(taskFolderActivityState("Work", activity, activeFolders.parents).active, false);
});

test("ignores invalid stored activity settings", () => {
  assert.deepEqual(parseTaskFolderActivity("broken"), {});
  assert.deepEqual(parseTaskFolderActivity('{"Work":{"active":true,"changedAt":"bad"}}'), {});
  assert.deepEqual(parseTaskFolderActivity(JSON.stringify(activeFolders.activity)), activeFolders.activity);
});

test("clears refreshed-task context when the task is filed again", () => {
  const old = new Date(now.getTime() - PRIORITY_REFRESH_MAX_AGE_MS);
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
      new Date(now.getTime() - PRIORITY_REFRESH_MAX_AGE_MS),
    ),
    false,
    "expired",
  );
  const batch = taskAgingBatch([...legacyTasks, expired], now, undefined, activeFolders);

  assert.equal(batch.pending, TASK_AGING_MAX_WRITES_PER_RUN + 6);
  assert.equal(batch.updates.length, TASK_AGING_MAX_WRITES_PER_RUN);
  assert.equal(batch.deferred, 6);
  assert.equal(batch.updates[0].task.id, "expired");
  assert.equal(batch.updates[0].reason, "retriage-priority");
});


test("active priority folders retain their own policy", () => {
  const folders = {
    activity: { Priority: { active: true, changedAt: new Date(2026, 0, 1).toISOString() } },
    parents: { "Priority Today": "Priority", "Priority Tomorrow": "Priority" },
  };
  const check = new Date(2026, 1, 28);
  const old = new Date(2026, 0, 1);
  assert.equal(taskAgingUpdate(task(todoistContentWithGroupChange("Today", "Priority Today", old)), check, folders), null);
  assert.equal(taskAgingUpdate(task(todoistContentWithGroupChange("Tomorrow", "Priority Tomorrow", old)), check, folders)?.reason, "retriage-priority");
});

test("unmarking an active folder stops month-end refresh", () => {
  const folders = { activity: { Work: { active: false, changedAt: now.toISOString() } }, parents: {} };
  const old = task(todoistContentWithGroupChange("Plan", "Work", new Date(2026, 0, 1)));
  assert.equal(taskAgingUpdate(old, new Date(2026, 8, 30), folders), null);
});

import type { TodoistTask } from "./todoist";
import {
  calendarEventDetailsFromTodoistContent,
  isPriorityLaterTodoistGroup,
  isPriorityTodoistGroup,
  isTodoistTriageGroup,
  todoistContentReturnedToTriage,
  todoistContentWithGroupChangedAt,
} from "./todoist-calendar";

export const PRIORITY_LATER_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1_000;
export const TASK_AGING_MAX_WRITES_PER_RUN = 30;
export const TASK_AGING_RECONCILIATION_COOLDOWN_MS = 15 * 60 * 1_000;
export const TASK_AGING_RECONCILIATION_STORAGE_KEY =
  "unplan:task-aging-reconciliation:last-checked-at:v1";

export type TaskAgingUpdate = {
  content: string;
  reason: "stamp" | "retriage-monthly" | "retriage-priority";
  task: TodoistTask;
};

export const oneCalendarMonthAfter = (date: Date) => {
  const deadline = new Date(date);
  const originalDay = deadline.getUTCDate();
  deadline.setUTCDate(1);
  deadline.setUTCMonth(deadline.getUTCMonth() + 1);
  const daysInTargetMonth = new Date(Date.UTC(
    deadline.getUTCFullYear(),
    deadline.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  deadline.setUTCDate(Math.min(originalDay, daysInTargetMonth));
  return deadline;
};

export const taskAgingUpdate = (
  task: TodoistTask,
  now: Date,
): TaskAgingUpdate | null => {
  if (task.optimistic) return null;
  const details = calendarEventDetailsFromTodoistContent(task.content);
  const group = details.group?.trim() ?? "";
  if (isTodoistTriageGroup(group)) return null;

  const changedAtMs = Date.parse(details.groupChangedAt ?? "");
  const nowMs = now.getTime();
  if (!Number.isFinite(changedAtMs) || changedAtMs > nowMs) {
    return {
      content: todoistContentWithGroupChangedAt(task.content, now),
      reason: "stamp",
      task,
    };
  }

  if (isPriorityTodoistGroup(group)) {
    if (
      isPriorityLaterTodoistGroup(group)
      && nowMs - changedAtMs >= PRIORITY_LATER_MAX_AGE_MS
    ) {
      return {
        content: todoistContentReturnedToTriage(task.content, group, now),
        reason: "retriage-priority",
        task,
      };
    }
    return null;
  }

  if (nowMs >= oneCalendarMonthAfter(new Date(changedAtMs)).getTime()) {
    return {
      content: todoistContentReturnedToTriage(task.content, group, now),
      reason: "retriage-monthly",
      task,
    };
  }

  return null;
};

export const taskAgingUpdates = (
  tasks: TodoistTask[],
  now: Date,
) => tasks.flatMap((task) => {
  const update = taskAgingUpdate(task, now);
  return update ? [update] : [];
});

const taskAgingReasonPriority: Record<TaskAgingUpdate["reason"], number> = {
  "retriage-priority": 0,
  "retriage-monthly": 1,
  stamp: 2,
};

export const taskAgingBatch = (
  tasks: TodoistTask[],
  now: Date,
  limit = TASK_AGING_MAX_WRITES_PER_RUN,
) => {
  const pending = taskAgingUpdates(tasks, now).sort(
    (left, right) => taskAgingReasonPriority[left.reason]
      - taskAgingReasonPriority[right.reason],
  );
  return {
    deferred: Math.max(pending.length - limit, 0),
    pending: pending.length,
    updates: pending.slice(0, Math.max(limit, 0)),
  };
};

export const isTaskAgingReconciliationCoolingDown = (
  storedLastCheckedAt: string | null,
  nowMs: number,
) => {
  const lastCheckedAt = Number(storedLastCheckedAt);
  return Number.isFinite(lastCheckedAt)
    && lastCheckedAt > 0
    && nowMs - lastCheckedAt >= 0
    && nowMs - lastCheckedAt < TASK_AGING_RECONCILIATION_COOLDOWN_MS;
};

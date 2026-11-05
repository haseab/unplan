"use client";

import * as React from "react";
import { isLocalTask } from "@/lib/local-tasks";
import { useTaskRefreshSettings } from "./use-task-refresh-settings";
import { calendarEventDetailsFromTodoistContent, isTodoistTriageGroup } from "@/lib/todoist-calendar";
import { useTodoistGroupPreferences } from "./use-todoist-group-preferences";
import type { TodoistTask, UpdateTodoistTaskInput } from "@/lib/todoist";
import {
  isTaskAgingReconciliationCoolingDown,
  TASK_AGING_RECONCILIATION_STORAGE_KEY,
  taskAgingBatch,
} from "@/lib/task-aging";

type TaskAgingReconciliationOptions = {
  enabled: boolean;
  token: string;
  refreshTasks: () => Promise<unknown>;
  tasks: TodoistTask[];
  updateTask: (
    taskId: string,
    input: UpdateTodoistTaskInput,
  ) => Promise<TodoistTask>;
};

export function useTaskAgingReconciliation({
  enabled,
  token,
  refreshTasks,
  tasks,
  updateTask,
}: TaskAgingReconciliationOptions) {
  const serverManaged = useTaskRefreshSettings(token);
  const { folderActivity, groupParents } = useTodoistGroupPreferences();
  const foldersRef = React.useRef({ activity: folderActivity, parents: groupParents });
  React.useEffect(() => {
    foldersRef.current = { activity: folderActivity, parents: groupParents };
  }, [folderActivity, groupParents]);
  const runningRef = React.useRef(false);
  const tasksRef = React.useRef(tasks);
  const updateTaskRef = React.useRef(updateTask);

  React.useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  React.useEffect(() => {
    updateTaskRef.current = updateTask;
  }, [updateTask]);

  const requestReconciliation = React.useCallback(async (reason: string) => {
    if (
      !enabled
      || document.visibilityState !== "visible"
      || runningRef.current
      || (!serverManaged && tasksRef.current.length === 0)
    ) return;

    runningRef.current = true;
    try {
      if (serverManaged) {
        // The fixed server cron owns synced tasks. The browser only reconciles local-only tasks.
        try { await refreshTasks(); } catch { /* The existing Todoist sync surfaces its own errors. */ }
      }
      const candidates = serverManaged !== false ? tasksRef.current.filter(isLocalTask) : tasksRef.current;
      if (!candidates.length) return;
      const now = new Date();
      const hasDueReview = candidates.some((task) => {
        const details = calendarEventDetailsFromTodoistContent(task.content);
        return !task.optimistic && !isTodoistTriageGroup(details.group)
          && Date.parse(details.reviewAt ?? "") <= now.getTime();
      });
      if (!hasDueReview && isTaskAgingReconciliationCoolingDown(
        window.localStorage.getItem(TASK_AGING_RECONCILIATION_STORAGE_KEY),
        now.getTime(),
      )) return;

      window.localStorage.setItem(
        TASK_AGING_RECONCILIATION_STORAGE_KEY,
        String(now.getTime()),
      );

      const { deferred, pending, updates } = taskAgingBatch(candidates, now, undefined, foldersRef.current);
      console.debug("[TASK-AGING:RECONCILE]", "check started", {
        deferred,
        pending,
        reason,
        scanned: tasksRef.current.length,
        selected: updates.length,
      });

      let failed = 0;
      let monthlyRetriaged = 0;
      let priorityRetriaged = 0;
      let stamped = 0;
      for (let index = 0; index < updates.length; index += 3) {
        const batch = updates.slice(index, index + 3);
        const results = await Promise.allSettled(batch.map(async (update) => {
          await updateTaskRef.current(update.task.id, {
            content: update.content,
            description: update.task.description,
          });
          if (update.reason === "retriage-monthly") monthlyRetriaged += 1;
          else if (update.reason === "retriage-priority") priorityRetriaged += 1;
          else stamped += 1;
        }));
        failed += results.filter(({ status }) => status === "rejected").length;
      }
      console.info("[TASK-AGING:RECONCILE]", "check completed", {
        deferred,
        failed,
        monthlyRetriaged,
        priorityRetriaged,
        reason,
        stamped,
      });
    } finally {
      runningRef.current = false;
    }
  }, [enabled, serverManaged, refreshTasks]);

  React.useEffect(() => {
    if (!enabled || serverManaged !== false || tasks.length === 0) return;
    void requestReconciliation("tasks-ready");
  }, [enabled, serverManaged, requestReconciliation, tasks, folderActivity, groupParents]);

  React.useEffect(() => {
    if (!enabled) return;
    if (serverManaged) void requestReconciliation("server-managed");
    const requestVisibleCheck = () => {
      if (document.visibilityState === "visible") {
        void requestReconciliation("tab-visible");
      }
    };
    const requestFocusCheck = () => void requestReconciliation("window-focus");
    document.addEventListener("visibilitychange", requestVisibleCheck);
    window.addEventListener("focus", requestFocusCheck);
    const timer = window.setInterval(() => void requestReconciliation("month-end-check"), 60_000);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", requestVisibleCheck);
      window.removeEventListener("focus", requestFocusCheck);
    };
  }, [enabled, serverManaged, requestReconciliation]);
}

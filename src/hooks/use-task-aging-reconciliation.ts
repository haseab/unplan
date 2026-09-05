"use client";

import * as React from "react";
import type { TodoistTask, UpdateTodoistTaskInput } from "@/lib/todoist";
import {
  isTaskAgingReconciliationCoolingDown,
  TASK_AGING_RECONCILIATION_STORAGE_KEY,
  taskAgingBatch,
} from "@/lib/task-aging";

type TaskAgingReconciliationOptions = {
  enabled: boolean;
  tasks: TodoistTask[];
  updateTask: (
    taskId: string,
    input: UpdateTodoistTaskInput,
  ) => Promise<TodoistTask>;
};

export function useTaskAgingReconciliation({
  enabled,
  tasks,
  updateTask,
}: TaskAgingReconciliationOptions) {
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
      || tasksRef.current.length === 0
    ) return;

    const now = new Date();
    if (isTaskAgingReconciliationCoolingDown(
      window.localStorage.getItem(TASK_AGING_RECONCILIATION_STORAGE_KEY),
      now.getTime(),
    )) return;

    runningRef.current = true;
    window.localStorage.setItem(
      TASK_AGING_RECONCILIATION_STORAGE_KEY,
      String(now.getTime()),
    );

    const { deferred, pending, updates } = taskAgingBatch(tasksRef.current, now);
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
    try {
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
  }, [enabled]);

  React.useEffect(() => {
    if (!enabled || tasks.length === 0) return;
    void requestReconciliation("tasks-ready");
  }, [enabled, requestReconciliation, tasks]);

  React.useEffect(() => {
    if (!enabled) return;
    const requestVisibleCheck = () => {
      if (document.visibilityState === "visible") {
        void requestReconciliation("tab-visible");
      }
    };
    const requestFocusCheck = () => void requestReconciliation("window-focus");
    document.addEventListener("visibilitychange", requestVisibleCheck);
    window.addEventListener("focus", requestFocusCheck);
    return () => {
      document.removeEventListener("visibilitychange", requestVisibleCheck);
      window.removeEventListener("focus", requestFocusCheck);
    };
  }, [enabled, requestReconciliation]);
}

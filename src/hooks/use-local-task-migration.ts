"use client";

import * as React from "react";
import { isLocalTask } from "@/lib/local-tasks";
import { getActionToastSyncProtectedResourceIds, subscribeActionToastSync } from "@/lib/action-toast";
import type { TodoistTask } from "@/lib/todoist";

export function useLocalTaskMigration({ ready, tasks, migrate, onError }: {
  ready: boolean;
  tasks: TodoistTask[];
  migrate: (task: TodoistTask) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const latest = React.useRef({ tasks, migrate, onError });
  React.useEffect(() => { latest.current = { tasks, migrate, onError }; }, [tasks, migrate, onError]);
  const running = React.useRef(false);
  const retryAfter = React.useRef(0);
  const attempt = React.useCallback(async () => {
    if (!ready || running.current || Date.now() < retryAfter.current) return;
    running.current = true;
    try {
      const protectedIds = getActionToastSyncProtectedResourceIds();
      for (const task of latest.current.tasks.filter(isLocalTask)) {
        if (protectedIds.includes(task.id)) continue;
        await latest.current.migrate(task);
      }
    } catch (error) {
      retryAfter.current = Date.now() + 30_000;
      latest.current.onError(error);
    } finally { running.current = false; }
  }, [ready]);
  React.useEffect(() => {
    if (!ready || !tasks.some(isLocalTask)) return;
    const timer = window.setTimeout(() => void attempt(), 0);
    return () => window.clearTimeout(timer);
  }, [ready, tasks, attempt]);
  React.useEffect(() => {
    if (!ready) return;
    const run = () => { void attempt(); };
    const unsubscribe = subscribeActionToastSync(run);
    const timer = window.setInterval(run, 30_000);
    window.addEventListener("focus", run);
    return () => { unsubscribe(); window.clearInterval(timer); window.removeEventListener("focus", run); };
  }, [ready, attempt]);
}

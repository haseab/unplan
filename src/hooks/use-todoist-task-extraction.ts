"use client";

import * as React from "react";
import {
  deleteTodoistTask,
  loadTodoistTasks,
  moveTodoistTask,
  type TodoistProject,
  type TodoistTask,
  updateTodoistTask,
} from "@/lib/todoist";
import { todoistContentWithCalendar } from "@/lib/todoist-calendar";
import {
  findTaskExtractionProject,
  resolveTaskExtractionDestination,
} from "@/lib/task-extraction";

const POLL_INTERVAL_MS = 5_000;

type UseTodoistTaskExtractionOptions = {
  preferredProjectId: string;
  projects: TodoistProject[];
  token: string;
};

export function useTodoistTaskExtraction({
  preferredProjectId,
  projects,
  token,
}: UseTodoistTaskExtractionOptions) {
  const [tasks, setTasks] = React.useState<TodoistTask[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const loadVersionRef = React.useRef(0);
  const resolvingTaskIdsRef = React.useRef(new Set<string>());
  const extractionProject = React.useMemo(
    () => findTaskExtractionProject(projects),
    [projects],
  );
  const destinationProject = React.useMemo(
    () => extractionProject
      ? resolveTaskExtractionDestination(
          projects,
          extractionProject.id,
          preferredProjectId,
        )
      : null,
    [extractionProject, preferredProjectId, projects],
  );

  const refresh = React.useCallback(async () => {
    if (!token || !extractionProject) {
      loadVersionRef.current += 1;
      setTasks([]);
      setLoading(false);
      return [];
    }
    const loadVersion = ++loadVersionRef.current;
    setLoading(true);
    try {
      const nextTasks = await loadTodoistTasks(token, extractionProject.id);
      if (loadVersion !== loadVersionRef.current) return nextTasks;
      setTasks(nextTasks.filter(({ id }) => !resolvingTaskIdsRef.current.has(id)));
      setError(null);
      return nextTasks;
    } catch (caught) {
      if (loadVersion !== loadVersionRef.current) return [];
      setError(caught instanceof Error ? caught.message : "Extracted tasks could not be loaded");
      return [];
    } finally {
      if (loadVersion === loadVersionRef.current) setLoading(false);
    }
  }, [extractionProject, token]);

  React.useEffect(() => {
    if (!token || !extractionProject) return;
    const initialTimer = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [extractionProject, refresh, token]);

  const optimisticallyRemoveTask = React.useCallback((taskId: string) => {
    resolvingTaskIdsRef.current.add(taskId);
    setTasks((current) => current.filter(({ id }) => id !== taskId));
  }, []);

  const restoreTask = React.useCallback((task: TodoistTask) => {
    resolvingTaskIdsRef.current.delete(task.id);
    setTasks((current) => current.some(({ id }) => id === task.id)
      ? current
      : [task, ...current]);
  }, []);

  const resolveTask = React.useCallback(async (
    task: TodoistTask,
    resolution: "delete" | "keep",
    taskCalendarId?: string,
  ) => {
    if (!token) throw new Error("Connect Todoist in Settings first");
    if (resolution === "delete") {
      await deleteTodoistTask(token, task.id);
      resolvingTaskIdsRef.current.delete(task.id);
      return null;
    } else {
      if (!taskCalendarId) {
        throw new Error("A writable task calendar is required");
      }
      if (!destinationProject) {
        throw new Error("Create another Todoist project to keep extracted tasks");
      }
      await updateTodoistTask(token, task.id, {
        content: todoistContentWithCalendar(task.content, taskCalendarId),
        description: task.description,
      });
      const movedTask = await moveTodoistTask(token, task.id, destinationProject.id);
      resolvingTaskIdsRef.current.delete(task.id);
      return movedTask;
    }
  }, [destinationProject, token]);

  return {
    destinationProject,
    error,
    extractionProject,
    loading,
    optimisticallyRemoveTask,
    refresh,
    resolveTask,
    restoreTask,
    tasks: token && extractionProject ? tasks : [],
  };
}

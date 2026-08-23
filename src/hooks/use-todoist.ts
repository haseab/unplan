"use client";

import * as React from "react";
import {
  closeTodoistTask,
  createTodoistTask,
  loadTodoistDestinations,
  loadTodoistTasks,
  resolveTodoistDestination,
  TODOIST_PROJECT_STORAGE_KEY,
  TODOIST_SECTION_STORAGE_KEY,
  TODOIST_TOKEN_STORAGE_KEY,
  type TodoistProject,
  type TodoistSection,
  type TodoistTask,
} from "@/lib/todoist";

export function useTodoist() {
  const [token, setToken] = React.useState("");
  const [tasks, setTasks] = React.useState<TodoistTask[]>([]);
  const [projects, setProjects] = React.useState<TodoistProject[]>([]);
  const [sections, setSections] = React.useState<TodoistSection[]>([]);
  const [preferredProjectId, setPreferredProjectId] = React.useState("");
  const [preferredSectionId, setPreferredSectionId] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async (candidateToken?: string) => {
    const activeToken = candidateToken ?? token;
    if (!activeToken) {
      setTasks([]);
      setProjects([]);
      setSections([]);
      return [];
    }
    setLoading(true);
    setError(null);
    try {
      const [nextTasks, destinations] = await Promise.all([
        loadTodoistTasks(activeToken),
        loadTodoistDestinations(activeToken),
      ]);
      const storedProjectId = window.localStorage.getItem(TODOIST_PROJECT_STORAGE_KEY) ?? "";
      const storedSectionId = window.localStorage.getItem(TODOIST_SECTION_STORAGE_KEY) ?? "";
      const { projectId: nextProjectId, sectionId: nextSectionId } = resolveTodoistDestination(
        destinations.projects,
        destinations.sections,
        storedProjectId,
        storedSectionId,
      );
      setTasks(nextTasks);
      setProjects(destinations.projects);
      setSections(destinations.sections);
      setPreferredProjectId(nextProjectId);
      setPreferredSectionId(nextSectionId);
      if (nextProjectId) window.localStorage.setItem(TODOIST_PROJECT_STORAGE_KEY, nextProjectId);
      else window.localStorage.removeItem(TODOIST_PROJECT_STORAGE_KEY);
      if (nextSectionId) window.localStorage.setItem(TODOIST_SECTION_STORAGE_KEY, nextSectionId);
      else window.localStorage.removeItem(TODOIST_SECTION_STORAGE_KEY);
      return nextTasks;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Todoist could not be loaded";
      setError(message);
      throw caught;
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setToken(
        window.localStorage.getItem(TODOIST_TOKEN_STORAGE_KEY)?.trim() ?? "",
      );
      setPreferredProjectId(
        window.localStorage.getItem(TODOIST_PROJECT_STORAGE_KEY) ?? "",
      );
      setPreferredSectionId(
        window.localStorage.getItem(TODOIST_SECTION_STORAGE_KEY) ?? "",
      );
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  React.useEffect(() => {
    if (!token) return;
    const timer = window.setTimeout(() => void refresh(token).catch(() => undefined), 0);
    return () => window.clearTimeout(timer);
  }, [refresh, token]);

  const saveToken = React.useCallback(async (candidate: string) => {
    const normalized = candidate.trim();
    if (!normalized) throw new Error("Enter a Todoist API token");
    const nextTasks = await refresh(normalized);
    window.localStorage.setItem(TODOIST_TOKEN_STORAGE_KEY, normalized);
    setToken(normalized);
    return nextTasks;
  }, [refresh]);

  const disconnect = React.useCallback(() => {
    window.localStorage.removeItem(TODOIST_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(TODOIST_PROJECT_STORAGE_KEY);
    window.localStorage.removeItem(TODOIST_SECTION_STORAGE_KEY);
    setToken("");
    setTasks([]);
    setProjects([]);
    setSections([]);
    setPreferredProjectId("");
    setPreferredSectionId("");
    setError(null);
  }, []);

  const addTask = React.useCallback(async (input: {
    content: string;
    description?: string;
    dueDatetime?: string;
  }) => {
    if (!token) throw new Error("Connect Todoist in Settings first");
    const task = await createTodoistTask(token, {
      ...input,
      ...(preferredProjectId ? { projectId: preferredProjectId } : {}),
      ...(preferredSectionId ? { sectionId: preferredSectionId } : {}),
    });
    setTasks((current) => [task, ...current]);
    return task;
  }, [preferredProjectId, preferredSectionId, token]);

  const setDestination = React.useCallback((projectId: string, sectionId = "") => {
    const normalizedSectionId = sections.some(
      (section) => section.id === sectionId && section.projectId === projectId,
    ) ? sectionId : "";
    setPreferredProjectId(projectId);
    setPreferredSectionId(normalizedSectionId);
    if (projectId) window.localStorage.setItem(TODOIST_PROJECT_STORAGE_KEY, projectId);
    else window.localStorage.removeItem(TODOIST_PROJECT_STORAGE_KEY);
    if (normalizedSectionId) window.localStorage.setItem(TODOIST_SECTION_STORAGE_KEY, normalizedSectionId);
    else window.localStorage.removeItem(TODOIST_SECTION_STORAGE_KEY);
  }, [sections]);

  const completeTask = React.useCallback(async (taskId: string) => {
    if (!token) throw new Error("Connect Todoist in Settings first");
    await closeTodoistTask(token, taskId);
    setTasks((current) => current.filter((task) => task.id !== taskId));
  }, [token]);

  return {
    addTask,
    completeTask,
    connected: Boolean(token),
    disconnect,
    error,
    loading,
    preferredProjectId,
    preferredSectionId,
    projects,
    refresh,
    saveToken,
    sections,
    setDestination,
    tasks,
    token,
  };
}

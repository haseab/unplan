"use client";

import * as React from "react";
import {
  parseTaskFolderActivity,
  TASK_FOLDER_ACTIVITY_STORAGE_KEY,
  type TaskFolderActivity,
} from "../lib/task-folder-activity";

import { TASK_FOLDERS_CHANGED } from "../lib/task-folder-creation";

import {
  TODOIST_COLLAPSED_GROUPS_STORAGE_KEY,
  TODOIST_CUSTOM_GROUPS_STORAGE_KEY,
  TODOIST_GROUP_ORDER_STORAGE_KEY,
  TODOIST_GROUP_PARENTS_STORAGE_KEY,
} from "../lib/todoist-folder-backup";

const notifyFoldersChanged = () => queueMicrotask(() => window.dispatchEvent(new Event(TASK_FOLDERS_CHANGED)));
const readActivity = () => parseTaskFolderActivity(window.localStorage.getItem(TASK_FOLDER_ACTIVITY_STORAGE_KEY));
const writeActivity = (activity: TaskFolderActivity) => {
  window.localStorage.setItem(TASK_FOLDER_ACTIVITY_STORAGE_KEY, JSON.stringify(activity));
  notifyFoldersChanged();
};

const readStoredNames = (key: string) => {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? value.filter((name): name is string => typeof name === "string")
      : [];
  } catch {
    return [];
  }
};

const writeStoredNames = (key: string, names: Iterable<string>) => {
  window.localStorage.setItem(key, JSON.stringify([...names]));
};

const readStoredParents = () => {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(
      window.localStorage.getItem(TODOIST_GROUP_PARENTS_STORAGE_KEY) ?? "{}",
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(
      (entry): entry is [string, string | null] =>
        typeof entry[0] === "string"
        && (typeof entry[1] === "string" || entry[1] === null),
    ));
  } catch {
    return {};
  }
};

const writeStoredParents = (parents: Record<string, string | null>) => {
  window.localStorage.setItem(TODOIST_GROUP_PARENTS_STORAGE_KEY, JSON.stringify(parents));
  notifyFoldersChanged();
};

export function useTodoistGroupPreferences() {
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [folderActivity, setFolderActivity] = React.useState<TaskFolderActivity>({});
  const [groupOrder, setGroupOrder] = React.useState<string[]>([]);
  const [groupParents, setGroupParents] = React.useState<Record<string, string | null>>({});

  React.useEffect(() => {
    // Restore browser-only preferences after the matching server/client render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsedGroups(new Set(readStoredNames(TODOIST_COLLAPSED_GROUPS_STORAGE_KEY)));
    setGroupOrder(readStoredNames(TODOIST_GROUP_ORDER_STORAGE_KEY));
    setGroupParents(readStoredParents());
    setFolderActivity(readActivity());
  }, []);

  React.useEffect(() => {
    const reload = () => {
      setGroupOrder(readStoredNames(TODOIST_GROUP_ORDER_STORAGE_KEY));
      setGroupParents(readStoredParents());
      setFolderActivity(readActivity());
    };
    window.addEventListener(TASK_FOLDERS_CHANGED, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(TASK_FOLDERS_CHANGED, reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  const toggleFolderActive = React.useCallback((group: string) => {
    const current = readActivity();
    const next = {
      ...current,
      [group]: { active: !current[group]?.active, changedAt: new Date().toISOString() },
    };
    writeActivity(next);
    setFolderActivity(next);
  }, []);

  const toggleGroup = React.useCallback((group: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      writeStoredNames(TODOIST_COLLAPSED_GROUPS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const expandGroup = React.useCallback((group: string) => {
    setCollapsedGroups((current) => {
      if (!current.has(group)) return current;
      const next = new Set(current);
      next.delete(group);
      writeStoredNames(TODOIST_COLLAPSED_GROUPS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const collapseGroup = React.useCallback((group: string) => {
    setCollapsedGroups((current) => {
      if (current.has(group)) return current;
      const next = new Set(current);
      next.add(group);
      writeStoredNames(TODOIST_COLLAPSED_GROUPS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const saveGroupOrder = React.useCallback((orderedGroups: string[]) => {
    console.debug("[BUG:FOLDER-REORDER]", "preferences:save-order", {
      orderedGroups,
    });
    setGroupOrder(orderedGroups);
    writeStoredNames(TODOIST_GROUP_ORDER_STORAGE_KEY, orderedGroups);
  }, []);

  const setGroupParent = React.useCallback((group: string, parent: string | null) => {
    console.debug("[BUG:FOLDER-REORDER]", "preferences:set-parent", {
      group,
      parent,
    });
    setGroupParents((current) => {
      const next = { ...current, [group]: parent };
      writeStoredParents(next);
      return next;
    });
  }, []);

  const renameGroupPreferences = React.useCallback((group: string, nextGroup: string) => {
    const activity = readActivity();
    if (activity[group]) {
      activity[nextGroup] = activity[group];
      delete activity[group];
      writeActivity(activity);
      setFolderActivity(activity);
    }
    setCollapsedGroups((current) => {
      if (!current.has(group)) return current;
      const next = new Set(current);
      next.delete(group);
      next.add(nextGroup);
      writeStoredNames(TODOIST_COLLAPSED_GROUPS_STORAGE_KEY, next);
      return next;
    });
    setGroupOrder((current) => {
      const next = current.map((candidate) => candidate === group ? nextGroup : candidate);
      writeStoredNames(TODOIST_GROUP_ORDER_STORAGE_KEY, next);
      return next;
    });
    setGroupParents((current) => {
      const next = Object.fromEntries(Object.entries(current).map(([candidate, parent]) => [
        candidate === group ? nextGroup : candidate,
        parent === group ? nextGroup : parent,
      ]));
      writeStoredParents(next);
      return next;
    });
  }, []);

  const removeGroupPreferences = React.useCallback((group: string) => {
    const activity = readActivity();
    delete activity[group];
    writeActivity(activity);
    setFolderActivity(activity);
    setCollapsedGroups((current) => {
      if (!current.has(group)) return current;
      const next = new Set(current);
      next.delete(group);
      writeStoredNames(TODOIST_COLLAPSED_GROUPS_STORAGE_KEY, next);
      return next;
    });
    setGroupOrder((current) => {
      const next = current.filter((candidate) => candidate !== group);
      writeStoredNames(TODOIST_GROUP_ORDER_STORAGE_KEY, next);
      return next;
    });
    setGroupParents((current) => {
      const deletedParent = current[group] ?? null;
      const next = Object.fromEntries(Object.entries(current).flatMap(([candidate, parent]) =>
        candidate === group
          ? []
          : [[candidate, parent === group ? deletedParent : parent]]
      ));
      writeStoredParents(next);
      return next;
    });
  }, []);

  return {
    folderActivity,
    toggleFolderActive,
    collapseGroup,
    collapsedGroups,
    expandGroup,
    groupOrder,
    groupParents,
    removeGroupPreferences,
    renameGroupPreferences,
    saveGroupOrder,
    setGroupParent,
    toggleGroup,
  };
}

export function useTodoistCustomGroups() {
  const [groups, setGroups] = React.useState<string[]>([]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore local storage after hydration.
    setGroups(readStoredNames(TODOIST_CUSTOM_GROUPS_STORAGE_KEY));
  }, []);

  return [groups, setGroups] as const;
}

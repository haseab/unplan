"use client";

import * as React from "react";
import { TODOIST_TOKEN_HEADER } from "@/lib/todoist";
import { parseTaskFolderActivity, TASK_FOLDER_ACTIVITY_STORAGE_KEY } from "@/lib/task-folder-activity";
import { readTodoistFolderPreferences, TODOIST_GROUP_PARENTS_STORAGE_KEY } from "@/lib/todoist-folder-backup";
import { TASK_FOLDERS_CHANGED } from "@/lib/task-folder-creation";
import { parseTaskRefreshSettings, TASK_REFRESH_SETTINGS_UPDATED_AT, type TaskRefreshSettings } from "@/lib/task-refresh-settings";
import { readJsonResponse } from "@/lib/http-client";

const fingerprint = (settings: TaskRefreshSettings) => JSON.stringify([settings.activity, settings.parents, settings.timeZone]);
const readLocal = (): TaskRefreshSettings => {
  const activity = parseTaskFolderActivity(localStorage.getItem(TASK_FOLDER_ACTIVITY_STORAGE_KEY));
  const dates = Object.values(activity).map((entry) => Date.parse(entry.changedAt));
  const latest = Math.max(0, ...dates);
  return {
    activity, parents: readTodoistFolderPreferences(localStorage).groupParents,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    updatedAt: localStorage.getItem(TASK_REFRESH_SETTINGS_UPDATED_AT) ?? new Date(latest).toISOString(),
  };
};
const applyLocal = (settings: TaskRefreshSettings) => {
  localStorage.setItem(TASK_FOLDER_ACTIVITY_STORAGE_KEY, JSON.stringify(settings.activity));
  localStorage.setItem(TODOIST_GROUP_PARENTS_STORAGE_KEY, JSON.stringify(settings.parents));
  localStorage.setItem(TASK_REFRESH_SETTINGS_UPDATED_AT, settings.updatedAt);
  window.dispatchEvent(new Event(TASK_FOLDERS_CHANGED));
};

type SettingsResponse = { settings: TaskRefreshSettings | null; serverManaged: boolean; serverConfigured?: boolean };

/** Sync the browser's existing folder rules to the same Todoist account as its tasks. */
export function useTaskRefreshSettings(token: string) {
  React.useEffect(() => {
    if (!token) return;
    let disposed = false;
    let queue = Promise.resolve();
    let observed = fingerprint(readLocal());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = async () => {
      if (disposed) return;
      try {
        const headers = { [TODOIST_TOKEN_HEADER]: token };
        const response = await readJsonResponse<SettingsResponse>(await fetch("/api/task-refresh/settings", { headers, cache: "no-store" }), "Could not read refresh settings");
        if (disposed) return;
        if (!response.serverManaged && !response.serverConfigured) return;
        const local = readLocal();
        const remote = parseTaskRefreshSettings(response.settings);
        const localWins = !remote || Date.parse(local.updatedAt) > Date.parse(remote.updatedAt);
        let chosen = remote;
        if (localWins && (!remote || fingerprint(local) !== fingerprint(remote))) {
          if (!remote && Date.parse(local.updatedAt) === 0) local.updatedAt = new Date().toISOString();
          const saved = await readJsonResponse<SettingsResponse>(await fetch("/api/task-refresh/settings", {
            method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(local),
          }), "Could not save refresh settings");
          chosen = parseTaskRefreshSettings(saved.settings);
        }
        if (disposed) return;
        if (chosen) {
          observed = fingerprint(chosen);
          // Do not overwrite an edit made while the request was running.
          if (Date.parse(readLocal().updatedAt) <= Date.parse(chosen.updatedAt)) applyLocal(chosen);
        }
      } catch (error) {
        if (!disposed) console.warn("[TASK-REFRESH:SETTINGS]", error instanceof Error ? error.message : "Settings sync failed");
      }
    };
    const enqueue = () => { queue = queue.then(sync).catch(() => undefined); };
    const changed = () => {
      const current = fingerprint(readLocal());
      if (current === observed) return;
      observed = current;
      localStorage.setItem(TASK_REFRESH_SETTINGS_UPDATED_AT, new Date().toISOString());
      clearTimeout(timer);
      timer = setTimeout(enqueue, 350);
    };
    const visible = () => { if (document.visibilityState === "visible") enqueue(); };
    enqueue();
    window.addEventListener(TASK_FOLDERS_CHANGED, changed);
    window.addEventListener("storage", changed);
    document.addEventListener("visibilitychange", visible);
    const poll = setInterval(visible, 60_000);
    return () => {
      disposed = true;
      clearTimeout(timer); clearInterval(poll);
      window.removeEventListener(TASK_FOLDERS_CHANGED, changed);
      window.removeEventListener("storage", changed);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [token]);
}

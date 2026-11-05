"use client";

import * as React from "react";
import { useTaskRefreshSettings } from "./use-task-refresh-settings";

/** Read server changes and sync folder settings. Expiration is exclusively server-owned. */
export function useTaskRefreshSync({ token, refreshTasks }: {
  token: string;
  refreshTasks: () => Promise<unknown>;
}) {
  useTaskRefreshSettings(token);
  React.useEffect(() => {
    if (!token) return;
    let running = false;
    const refresh = async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try { await refreshTasks(); } catch { /* Todoist sync displays its own errors. */ }
      finally { running = false; }
    };
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(visible, 60_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [token, refreshTasks]);
}

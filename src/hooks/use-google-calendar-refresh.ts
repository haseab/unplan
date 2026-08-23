"use client";

import * as React from "react";

const RECONCILIATION_INTERVAL_MS = 5 * 60 * 1000;

type UseGoogleCalendarRefreshOptions = {
  canRefresh?: () => boolean;
  enabled: boolean;
  onRefresh: () => void | Promise<void>;
};

export const useGoogleCalendarRefresh = ({
  canRefresh = () => true,
  enabled,
  onRefresh,
}: UseGoogleCalendarRefreshOptions) => {
  const canRefreshRef = React.useRef(canRefresh);
  const refreshRef = React.useRef(onRefresh);
  React.useEffect(() => {
    canRefreshRef.current = canRefresh;
    refreshRef.current = onRefresh;
  }, [canRefresh, onRefresh]);

  React.useEffect(() => {
    if (!enabled) return;
    let refreshTimer: number | null = null;
    const scheduleRefresh = (delay = 120) => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        if (!canRefreshRef.current()) {
          scheduleRefresh(500);
          return;
        }
        void refreshRef.current();
      }, delay);
    };
    const reconciliation = window.setInterval(() => {
      if (document.visibilityState === "visible") scheduleRefresh(0);
    }, RECONCILIATION_INTERVAL_MS);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh(0);
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);

    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      window.clearInterval(reconciliation);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [enabled]);
};

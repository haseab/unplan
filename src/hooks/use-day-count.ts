"use client";

import * as React from "react";

const DAY_COUNT_STORAGE_KEY = "unplan_visible_day_count";
export const MAX_VISIBLE_DAYS = 30;

export const normalizeDayCount = (value: number) =>
  Math.min(Math.max(Math.round(Number.isFinite(value) ? value : 7), 1), MAX_VISIBLE_DAYS);

export function useDayCount() {
  const [dayCount, setDayCountState] = React.useState(7);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = Number.parseInt(
        window.localStorage.getItem(DAY_COUNT_STORAGE_KEY) ?? "",
        10,
      );
      if (Number.isFinite(saved)) setDayCountState(normalizeDayCount(saved));
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  const setDayCount = React.useCallback((value: number) => {
    const normalized = normalizeDayCount(value);
    window.localStorage.setItem(DAY_COUNT_STORAGE_KEY, normalized.toString());
    setDayCountState(normalized);
  }, []);

  return { dayCount, setDayCount };
}

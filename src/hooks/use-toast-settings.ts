"use client";

import * as React from "react";

export const DEFAULT_TOAST_DURATION = 4000;
export const MAX_TOAST_DURATION = 10000;
export const TOAST_DURATION_STORAGE_KEY = "unplan_undo_toast_duration";
const TOAST_SETTINGS_EVENT = "unplan:toast-settings-change";

const normalizeDuration = (value: number) =>
  Math.min(Math.max(Number.isFinite(value) ? value : DEFAULT_TOAST_DURATION, 0), MAX_TOAST_DURATION);

const readDuration = () => {
  if (typeof window === "undefined") return DEFAULT_TOAST_DURATION;
  const saved = Number.parseInt(
    window.localStorage.getItem(TOAST_DURATION_STORAGE_KEY) ?? "",
    10,
  );
  return normalizeDuration(saved);
};

export function useToastSettings() {
  const [duration, setDurationState] = React.useState(DEFAULT_TOAST_DURATION);

  React.useEffect(() => {
    const updateFromStorage = () => setDurationState(readDuration());
    updateFromStorage();
    window.addEventListener("storage", updateFromStorage);
    window.addEventListener(TOAST_SETTINGS_EVENT, updateFromStorage);
    return () => {
      window.removeEventListener("storage", updateFromStorage);
      window.removeEventListener(TOAST_SETTINGS_EVENT, updateFromStorage);
    };
  }, []);

  const setDuration = React.useCallback((nextDuration: number) => {
    const normalized = normalizeDuration(nextDuration);
    window.localStorage.setItem(
      TOAST_DURATION_STORAGE_KEY,
      normalized.toString(),
    );
    setDurationState(normalized);
    window.dispatchEvent(new Event(TOAST_SETTINGS_EVENT));
  }, []);

  return { duration, setDuration };
}

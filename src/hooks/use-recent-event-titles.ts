"use client";

import * as React from "react";
import type { CalendarEvent } from "@/lib/calendar-types";
import {
  parseRecentEventTitles,
  reconcileRecentEventTitles,
  recordRecentEventTitleUse,
  type RecentEventTitle,
} from "@/lib/recent-event-titles";

const STORAGE_KEY = "unplan:recent-event-titles:v1";

const readStoredTitles = () => typeof window === "undefined"
  ? []
  : parseRecentEventTitles(window.localStorage.getItem(STORAGE_KEY));

export function useRecentEventTitles(initialEvents: CalendarEvent[]) {
  const [entries, setEntries] = React.useState<RecentEventTitle[]>(() =>
    reconcileRecentEventTitles(readStoredTitles(), initialEvents)
  );

  const updateEntries = React.useCallback((update: (current: RecentEventTitle[]) => RecentEventTitle[]) => {
    setEntries((current) => {
      const next = update(current);
      if (next !== current) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const rememberEvents = React.useCallback((
    nextEvents: CalendarEvent[],
    mode: "history-snapshot" | "observed" = "observed",
  ) => {
    updateEntries((current) => reconcileRecentEventTitles(current, nextEvents, mode));
  }, [updateEntries]);

  const recordUse = React.useCallback((entry: RecentEventTitle) => {
    updateEntries((current) => recordRecentEventTitleUse(current, entry));
  }, [updateEntries]);

  return { entries, recordUse, rememberEvents };
}

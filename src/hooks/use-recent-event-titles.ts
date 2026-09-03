"use client";

import * as React from "react";
import type { CalendarEvent } from "@/lib/calendar-types";
import {
  addRecentEventTitle,
  parseRecentEventTitles,
  reconcileRecentEventTitles,
  recordRecentEventTitleUse,
  type RecentEventTitle,
} from "@/lib/recent-event-titles";

const STORAGE_KEY = "unplan:recent-event-titles:v2";
const LEGACY_STORAGE_KEY = "unplan:recent-event-titles:v1";

const readStoredTitles = () => {
  if (typeof window === "undefined") return [];
  try {
    return parseRecentEventTitles(
      window.localStorage.getItem(STORAGE_KEY)
        ?? window.localStorage.getItem(LEGACY_STORAGE_KEY),
    );
  } catch (error) {
    console.error("[RECENT:CACHE] failed to load recent event titles", error);
    return [];
  }
};

export function useRecentEventTitles(initialEvents: CalendarEvent[]) {
  const [entries, setEntries] = React.useState<RecentEventTitle[]>(() =>
    reconcileRecentEventTitles(readStoredTitles(), initialEvents)
  );

  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      console.error("[RECENT:CACHE] failed to persist recent event titles", error);
    }
  }, [entries]);

  const updateEntries = React.useCallback((update: (current: RecentEventTitle[]) => RecentEventTitle[]) => {
    setEntries(update);
  }, []);

  const rememberEvents = React.useCallback((nextEvents: CalendarEvent[]) => {
    updateEntries((current) => reconcileRecentEventTitles(current, nextEvents));
  }, [updateEntries]);

  const recordUse = React.useCallback((entry: RecentEventTitle) => {
    updateEntries((current) => recordRecentEventTitleUse(current, entry));
  }, [updateEntries]);

  const rememberEvent = React.useCallback((event: CalendarEvent) => {
    updateEntries((current) => addRecentEventTitle(current, event));
  }, [updateEntries]);

  return { entries, recordUse, rememberEvent, rememberEvents };
}

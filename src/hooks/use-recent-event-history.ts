"use client";

import { subDays } from "date-fns";
import * as React from "react";
import type { CalendarEvent, CalendarSource } from "@/lib/calendar-types";
import { loadBrowserGoogleEvents } from "@/lib/google-calendar-client";

const BACKFILL_DAYS = 180;
const BACKFILL_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const STORAGE_KEY = "unplan:recent-event-history-backfills:v1";

const readBackfills = (): Record<string, number> => {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed as Record<string, number> : {};
  } catch {
    return {};
  }
};

export function useRecentEventHistory({
  calendars,
  enabled,
  onEvents,
}: {
  calendars: CalendarSource[];
  enabled: boolean;
  onEvents: (events: CalendarEvent[], mode: "history-snapshot") => void;
}) {
  const calendarKey = calendars.map(({ id }) => id).sort().join("|");
  const onEventsRef = React.useRef(onEvents);

  React.useEffect(() => {
    onEventsRef.current = onEvents;
  }, [onEvents]);

  React.useEffect(() => {
    if (!enabled || !calendarKey || !calendars.length) return;
    const backfills = readBackfills();
    if (Date.now() - (backfills[calendarKey] ?? 0) < BACKFILL_MAX_AGE_MS) return;

    const controller = new AbortController();
    const load = () => {
      const now = new Date();
      void loadBrowserGoogleEvents({
        calendars,
        signal: controller.signal,
        timeMin: subDays(now, BACKFILL_DAYS).toISOString(),
        timeMax: now.toISOString(),
      }).then((result) => {
        if (controller.signal.aborted) return;
        onEventsRef.current(result.events ?? [], "history-snapshot");
        if (!result.errors?.length) {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
            ...readBackfills(),
            [calendarKey]: Date.now(),
          }));
        }
        console.debug("[RECENT:BACKFILL] history enrichment completed", {
          calendarCount: calendars.length,
          eventCount: result.events?.length ?? 0,
          errorCount: result.errors?.length ?? 0,
        });
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn("[RECENT:BACKFILL] history enrichment failed", error);
      });
    };

    const idleWindow = window as Window & {
      cancelIdleCallback?: (handle: number) => void;
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    };
    const handle = idleWindow.requestIdleCallback
      ? idleWindow.requestIdleCallback(load, { timeout: 3_000 })
      : window.setTimeout(load, 1_200);
    return () => {
      controller.abort();
      if (idleWindow.cancelIdleCallback) idleWindow.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [calendarKey, calendars, enabled]);
}

"use client";

import * as React from "react";
import { frontendStorage } from "../runtime.js";
import type { CalendarSource } from "../lib/calendar-types.js";
import {
  eventCalendarForStart,
  FUTURE_EVENT_CALENDAR_KEY,
  PAST_EVENT_CALENDAR_KEY,
  resolveEventCalendar,
} from "../lib/event-calendar-defaults.js";

export function useEventCalendarDefaults(calendars: CalendarSource[]) {
  const [futureId, setFutureId] = React.useState<string | null>(() =>
    typeof window === "undefined" ? null : frontendStorage.getItem(FUTURE_EVENT_CALENDAR_KEY));
  const [pastId, setPastId] = React.useState<string | null>(() =>
    typeof window === "undefined" ? null : frontendStorage.getItem(PAST_EVENT_CALENDAR_KEY)
      ?? frontendStorage.getItem(FUTURE_EVENT_CALENDAR_KEY));
  const pastCalendar = React.useMemo(() => resolveEventCalendar(calendars, pastId), [calendars, pastId]);
  const futureCalendar = React.useMemo(() => resolveEventCalendar(calendars, futureId), [calendars, futureId]);
  const setPastCalendarId = React.useCallback((id: string) => {
    frontendStorage.setItem(PAST_EVENT_CALENDAR_KEY, id);
    setPastId(id);
  }, []);
  const setFutureCalendarId = React.useCallback((id: string) => {
    // Freeze the legacy choice for past events before changing the future default.
    if (!frontendStorage.getItem(PAST_EVENT_CALENDAR_KEY)) {
      const legacy = frontendStorage.getItem(FUTURE_EVENT_CALENDAR_KEY);
      if (legacy) frontendStorage.setItem(PAST_EVENT_CALENDAR_KEY, legacy);
    }
    frontendStorage.setItem(FUTURE_EVENT_CALENDAR_KEY, id);
    setFutureId(id);
  }, []);
  const calendarForStart = React.useCallback((start: Date) =>
    eventCalendarForStart(start, pastCalendar, futureCalendar), [pastCalendar, futureCalendar]);
  return { pastCalendar, futureCalendar, setPastCalendarId, setFutureCalendarId, calendarForStart };
}

"use client";

import * as React from "react";
import type { CalendarSource } from "../lib/calendar-types";
import {
  eventCalendarForStart,
  FUTURE_EVENT_CALENDAR_KEY,
  PAST_EVENT_CALENDAR_KEY,
  resolveEventCalendar,
} from "../lib/event-calendar-defaults";

export function useEventCalendarDefaults(calendars: CalendarSource[]) {
  const [futureId, setFutureId] = React.useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(FUTURE_EVENT_CALENDAR_KEY));
  const [pastId, setPastId] = React.useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(PAST_EVENT_CALENDAR_KEY)
      ?? window.localStorage.getItem(FUTURE_EVENT_CALENDAR_KEY));
  const pastCalendar = React.useMemo(() => resolveEventCalendar(calendars, pastId), [calendars, pastId]);
  const futureCalendar = React.useMemo(() => resolveEventCalendar(calendars, futureId), [calendars, futureId]);
  const setPastCalendarId = React.useCallback((id: string) => {
    window.localStorage.setItem(PAST_EVENT_CALENDAR_KEY, id);
    setPastId(id);
  }, []);
  const setFutureCalendarId = React.useCallback((id: string) => {
    // Freeze the legacy choice for past events before changing the future default.
    if (!window.localStorage.getItem(PAST_EVENT_CALENDAR_KEY)) {
      const legacy = window.localStorage.getItem(FUTURE_EVENT_CALENDAR_KEY);
      if (legacy) window.localStorage.setItem(PAST_EVENT_CALENDAR_KEY, legacy);
    }
    window.localStorage.setItem(FUTURE_EVENT_CALENDAR_KEY, id);
    setFutureId(id);
  }, []);
  const calendarForStart = React.useCallback((start: Date) =>
    eventCalendarForStart(start, pastCalendar, futureCalendar), [pastCalendar, futureCalendar]);
  return { pastCalendar, futureCalendar, setPastCalendarId, setFutureCalendarId, calendarForStart };
}

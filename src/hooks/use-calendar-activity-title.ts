"use client";

import { useEffect, useState } from "react";
import {
  calendarActivityTitle,
  type CalendarActivityState,
  type CalendarActivitySurface,
} from "@/lib/calendar-activity";

export function useCalendarActivityTitle(state: CalendarActivityState) {
  const [surface, setSurface] = useState<CalendarActivitySurface>("calendar");

  useEffect(() => {
    const trackSurface = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      // Both sidebars, including event details, are sidebar activity. Keep this
      // separate from the selection surface used by calendar editing shortcuts.
      if (event.target.closest(".sidebar, .right-sidebar")) {
        setSurface("sidebar");
      } else if (event.target.closest(".calendar-workspace")) {
        setSurface("calendar");
      }
    };
    document.addEventListener("pointerdown", trackSurface, true);
    document.addEventListener("focusin", trackSurface, true);
    return () => {
      document.removeEventListener("pointerdown", trackSurface, true);
      document.removeEventListener("focusin", trackSurface, true);
    };
  }, []);

  const title = calendarActivityTitle(state, surface);
  useEffect(() => {
    document.title = title;
  }, [title]);
}

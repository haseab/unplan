"use client";

import { useEffect } from "react";
import type { CalendarEvent } from "@/lib/calendar-types";
import { eventHistoryShortcut, pastEventHistoryUrl } from "@/lib/event-history";

export function useEventHistoryShortcuts({
  calendarActive,
  eventDetailsActive,
  selectedEvents,
}: {
  calendarActive: boolean;
  eventDetailsActive: boolean;
  selectedEvents: readonly CalendarEvent[];
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || selectedEvents.length !== 1) return;
      const destination = eventHistoryShortcut(event);
      if (!destination) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
      if (!calendarActive && !(eventDetailsActive && target?.closest(".right-sidebar"))) return;
      if (document.querySelector(".modal-backdrop, [role='dialog'][aria-modal='true']")) return;
      const url = pastEventHistoryUrl(selectedEvents[0], destination);
      if (!url) return;

      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (destination === "retrace") {
        window.open(url, "_self");
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [calendarActive, eventDetailsActive, selectedEvents]);
}

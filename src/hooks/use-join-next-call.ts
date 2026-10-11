"use client";
import * as React from "react";
import { toast } from "sonner";
import type { CalendarEvent } from "@/lib/calendar-types";
import { nextCalendarCall } from "@/lib/next-calendar-call";

export function useJoinNextCall(events: readonly CalendarEvent[]) {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey
        || event.key.toLowerCase() !== "j" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      const call = nextCalendarCall(events);
      if (!call) { toast.info("No upcoming call with a meeting link in the visible calendars"); return; }
      window.open(call.url, "_blank", "noopener,noreferrer");
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [events]);
}

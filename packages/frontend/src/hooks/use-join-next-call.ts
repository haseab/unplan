"use client";

import { addScopedKeyListener, removeScopedKeyListener } from "../runtime.js";

import * as React from "react";
import { toast } from "sonner";
import type { CalendarEvent } from "../lib/calendar-types.js";
import { nextCalendarCall } from "../lib/next-calendar-call.js";

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
    addScopedKeyListener(document, handleKeyDown, true);
    return () => removeScopedKeyListener(document, handleKeyDown, true);
  }, [events]);
}

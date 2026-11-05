import type { CalendarEvent } from "./calendar-types";

export type EventHistoryDestination = "limitless" | "retrace" | "deeplog";

type HistoryKey = Pick<KeyboardEvent,
  "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "isComposing"
>;

export function eventHistoryShortcut(event: HistoryKey): EventHistoryDestination | null {
  // Option+P produces π on macOS, so prefer the physical key code.
  if (event.isComposing || (event.code !== "KeyP" && event.key.toLowerCase() !== "p")) return null;
  if (event.altKey) {
    return !event.metaKey && !event.ctrlKey && !event.shiftKey ? "deeplog" : null;
  }
  if (!event.metaKey && !event.ctrlKey) return null;
  return event.shiftKey ? "retrace" : "limitless";
}

export function pastEventHistoryUrl(
  event: Pick<CalendarEvent, "start" | "end">,
  destination: EventHistoryDestination,
  now = Date.now(),
): string | null {
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(now)
    || end <= start || end > now) return null;

  if (destination === "retrace") return `retracedev://timeline?t=${start}`;

  // Explicit UTC instants preserve the range across timezones and DST changes.
  const from = new Date(start).toISOString();
  const to = new Date(end).toISOString();
  if (destination === "limitless") {
    return `https://deeplog.app/pendant?${new URLSearchParams({ q: `${from} to ${to}` })}`;
  }
  return `https://deeplog.app/?${new URLSearchParams({ from, to })}`;
}

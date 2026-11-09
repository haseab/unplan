import type { CalendarOccupancyEvent } from "./calendar-whitespace";

/** All-day labels and declined or cancelled events do not occupy the timed grid. */
export function currentActivity(events: CalendarOccupancyEvent[], now = Date.now()) {
  let active = false;
  for (const event of events) {
    if (event.status === "cancelled" || event.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
    if (!event.start?.dateTime && event.start?.date && event.end?.date) continue;
    const start = Date.parse(event.start?.dateTime ?? "");
    const end = Date.parse(event.end?.dateTime ?? "");
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("Invalid activity interval");
    if (start <= now && now < end) active = true;
  }
  return { active, checkedAt: new Date(now).toISOString() };
}

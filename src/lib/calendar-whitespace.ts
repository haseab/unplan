export type CalendarOccupancyEvent = {
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ self?: boolean; responseStatus?: string }>;
};

// All-day labels do not fill the timed calendar grid. Merge across calendars
// before subtracting so duplicate and overlapping entries occupy time only once.
export function calendarWhitespace(events: CalendarOccupancyEvent[], start: number, end: number) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("Invalid range");
  const intervals: Array<[number, number]> = [];
  for (const event of events) {
    if (event.status === "cancelled" || event.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
    if (!event.start?.dateTime && event.start?.date && event.end?.date) continue;
    const from = Date.parse(event.start?.dateTime ?? "");
    const to = Date.parse(event.end?.dateTime ?? "");
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) throw new Error("Invalid event interval");
    if (to > start && from < end) intervals.push([Math.max(start, from), Math.min(end, to)]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let cursor = start;
  let empty = 0;
  for (const [from, to] of intervals) {
    empty += Math.max(0, from - cursor);
    cursor = Math.max(cursor, to);
  }
  empty += end - cursor;
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), hours: empty / 3600000 };
}

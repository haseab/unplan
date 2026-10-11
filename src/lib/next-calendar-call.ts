import type { CalendarEvent } from "./calendar-types";

const safeMeetingUrl = (value: string | undefined) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
};

export const calendarEventMeetingUrl = (event: CalendarEvent): string | null => {
  const conference = safeMeetingUrl(event.conferenceLink);
  if (conference) return conference;
  const candidates = `${event.location ?? ""} ${event.description ?? ""}`.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  for (const candidate of candidates) {
    const link = safeMeetingUrl(candidate.replace(/[),.;]+$/, ""));
    if (!link) continue;
    const host = new URL(link).hostname;
    if (["meet.google.com", "zoom.us", "teams.microsoft.com", "teams.live.com", "webex.com", "whereby.com"]
      .some(domain => host === domain || host.endsWith(`.${domain}`))) return link;
  }
  return null;
};

export const nextCalendarCall = (events: readonly CalendarEvent[], now = new Date()) => {
  const currentTime = +now;
  return events.flatMap(event => {
    const start = +new Date(event.start), end = +new Date(event.end);
    if (event.allDay || !Number.isFinite(start) || !Number.isFinite(end) || end <= currentTime
      || event.attendees?.some(attendee => attendee.self && attendee.responseStatus === "declined")) return [];
    const url = calendarEventMeetingUrl(event);
    return url ? [{ event, url, start }] : [];
  }).sort((a, b) => a.start - b.start || a.event.id.localeCompare(b.event.id))[0] ?? null;
};

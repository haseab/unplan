import { calendarEventMeetingUrl } from "./next-calendar-call";

export type MeetingEvent = {
  summary?: string;
  status?: string;
  eventType?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  hangoutLink?: string;
  htmlLink?: string;
  description?: string;
  location?: string;
  conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
  attendees?: Array<{ self?: boolean; responseStatus?: string }>;
};

export function attentionMeeting(event: MeetingEvent, now: number) {
  const start = Date.parse(event.start?.dateTime ?? ""), end = Date.parse(event.end?.dateTime ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= now || end <= start
    || event.status === "cancelled" || (event.eventType && !["default", "fromGmail"].includes(event.eventType))
    || event.attendees?.some((attendee) => attendee.self && attendee.responseStatus === "declined")) return null;
  const url = calendarEventMeetingUrl({
    conferenceLink: event.hangoutLink || event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri,
    location: event.location, description: event.description,
  });
  if (!url && !event.attendees?.some((attendee) => !attendee.self && attendee.responseStatus !== "declined")) return null;
  return {
    title: event.summary?.slice(0, 1000) || "Untitled meeting",
    start: new Date(start).toISOString(), end: new Date(end).toISOString(),
    url: url || (event.htmlLink?.startsWith("https://") ? event.htmlLink : null),
  };
}

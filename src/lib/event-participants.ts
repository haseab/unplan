import type {
  CalendarEvent,
  CalendarEventAttendee,
  CalendarEventAttendeeResponseStatus,
} from "./calendar-types";

export type ParticipantResponseSummary = {
  accepted: number;
  awaiting: number;
  declined: number;
  tentative: number;
  total: number;
};

export const participantResponseSummary = (
  attendees: CalendarEventAttendee[],
): ParticipantResponseSummary => attendees.reduce<ParticipantResponseSummary>(
  (summary, attendee) => {
    const response = attendee.responseStatus ?? "needsAction";
    if (response === "accepted") summary.accepted += 1;
    else if (response === "declined") summary.declined += 1;
    else if (response === "tentative") summary.tentative += 1;
    else summary.awaiting += 1;
    summary.total += 1;
    return summary;
  },
  { accepted: 0, awaiting: 0, declined: 0, tentative: 0, total: 0 },
);

export const isEventUnaccepted = (event: CalendarEvent) => {
  if (event.organizerSelf) return false;
  const self = event.attendees?.find((attendee) => attendee.self);
  return Boolean(self && self.responseStatus !== "accepted");
};

export const shouldAutoCreateEventConference = ({
  conferenceLink,
  currentParticipantCount,
  nextParticipantCount,
  provider,
}: {
  conferenceLink?: string;
  currentParticipantCount: number;
  nextParticipantCount: number;
  provider: CalendarEvent["provider"];
}) => (
  provider === "google"
  && !conferenceLink
  && nextParticipantCount > currentParticipantCount
);

export const participantResponseSummaryLabel = (
  summary: ParticipantResponseSummary,
) => [
  summary.accepted ? `${summary.accepted} yes` : "",
  summary.declined ? `${summary.declined} no` : "",
  summary.tentative ? `${summary.tentative} maybe` : "",
  summary.awaiting ? `${summary.awaiting} awaiting` : "",
].filter(Boolean).join(", ") || "No responses yet";

export const participantInitials = (attendee: CalendarEventAttendee) => {
  const label = attendee.displayName?.trim() || attendee.email?.trim() || "Guest";
  const parts = label.includes("@")
    ? [label.slice(0, label.indexOf("@"))]
    : label.split(/\s+/);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
};

export const mergeParticipantEmails = (
  attendees: CalendarEventAttendee[],
  input: string,
) => {
  const existingEmails = new Set(
    attendees.flatMap(({ email }) => email ? [email.toLowerCase()] : []),
  );
  const additions = input
    .split(/[;,\s]+/)
    .map((email) => email.trim())
    .filter((email) => email.includes("@") && !existingEmails.has(email.toLowerCase()))
    .map((email) => {
      existingEmails.add(email.toLowerCase());
      return { email, responseStatus: "needsAction" as const };
    });
  return [...attendees, ...additions];
};

export const updateSelfParticipantResponse = (
  event: CalendarEvent,
  responseStatus: CalendarEventAttendeeResponseStatus,
): CalendarEvent => ({
  ...event,
  attendees: event.attendees?.map((attendee) => attendee.self
    ? { ...attendee, responseStatus }
    : attendee),
});

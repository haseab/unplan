import type { CalendarEvent } from "./calendar-types";
import { parseGoogleCalendarSourceId } from "./google-source-id";

export function noteIdentity(event: Pick<CalendarEvent, "calendarId" | "id" | "providerEventId">) {
  const source = parseGoogleCalendarSourceId(event.calendarId);
  if (!source) return null;
  const eventId = event.providerEventId ?? event.id;
  return { key: JSON.stringify([source.accountId, source.providerCalendarId, eventId]),
    accountId: source.accountId, calendarId: event.calendarId, eventId };
}

export const googleEventMutationKey = (event: Pick<CalendarEvent, "calendarId" | "id" | "providerEventId">) => {
  const identity = noteIdentity(event);
  // Stable across a calendar move, scoped to the connected account.
  return JSON.stringify([identity?.accountId ?? event.calendarId, identity?.eventId ?? event.id]);
};

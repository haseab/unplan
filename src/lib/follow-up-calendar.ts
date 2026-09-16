import type { CalendarSource } from "./calendar-types";
import { followUpEventAtPresent, type FollowUp } from "./follow-ups";
import { createGoogleEvent, createGoogleCompatibleEventId } from "./google-event-client";

/** Persists the calendar copy before the caller advances the follow-up. */
export async function scheduleFollowUp(item: FollowUp, calendar: CalendarSource, now = new Date()) {
  const providerEventId = calendar.provider === "google" ? createGoogleCompatibleEventId() : undefined;
  const event = followUpEventAtPresent(item.event, now, providerEventId ? `${calendar.id}:${providerEventId}` : `follow-up-${crypto.randomUUID()}`);
  event.calendarId = calendar.id;
  event.provider = calendar.provider;
  event.providerEventId = providerEventId;
  event.calendarColor = calendar.backgroundColor;
  if (event.provider === "google") {
    const created = await createGoogleEvent(event);
    if (!created.id) throw new Error("Google did not return an event ID");
    event.providerEventId = created.id;
    event.htmlLink = created.htmlLink;
  }
  return event;
}

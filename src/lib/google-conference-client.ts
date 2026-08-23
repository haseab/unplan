import type { CalendarEvent } from "@/lib/calendar-types";
import { readJsonResponse } from "@/lib/http-client";
import { googleCalendarAuthorizedFetch } from "@/lib/google-browser-auth";

type GoogleConferenceResult = {
  conferenceLink?: string;
  error?: string;
  status?: "pending" | "success";
};

const POLL_DELAYS_MS = [350, 500, 750, 1_000, 1_500, 2_000, 2_500, 3_000];

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const conferenceRequest = async (
  calendarSourceId: string,
  url: string,
  init?: RequestInit,
) => {
  const response = await googleCalendarAuthorizedFetch(calendarSourceId, url, init);
  const data = await readJsonResponse<GoogleConferenceResult>(
    response,
    "Google Meet returned an empty response",
  );
  if (!response.ok && response.status !== 202) {
    throw new Error(data.error ?? "Google Meet could not be created");
  }
  return data;
};

export const createGoogleMeet = async (event: CalendarEvent) => {
  const eventId = event.providerEventId ?? event.id;
  let result = await conferenceRequest(event.calendarId, "/api/google/events/conference", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ calendarSourceId: event.calendarId, eventId }),
  });
  if (result.conferenceLink) return result.conferenceLink;

  const query = new URLSearchParams({
    calendarSourceId: event.calendarId,
    eventId,
  });
  for (const delay of POLL_DELAYS_MS) {
    await wait(delay);
    result = await conferenceRequest(event.calendarId, `/api/google/events/conference?${query}`);
    if (result.conferenceLink) return result.conferenceLink;
  }
  throw new Error("Google is still creating the meeting. Try again in a moment.");
};

export const googleMeetCode = (conferenceLink: string) => {
  try {
    return new URL(conferenceLink).pathname.split("/").filter(Boolean).at(-1)
      ?? conferenceLink;
  } catch {
    return conferenceLink;
  }
};

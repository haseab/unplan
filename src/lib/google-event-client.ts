import type {
  CalendarEvent,
  CalendarEventRsvpStatus,
  GoogleCalendarEventResponsePayload,
  GoogleSendUpdates,
} from "@/lib/calendar-types";
import { googleEventMutationKey, noteIdentity } from "@/lib/event-description-identity";
import { relocateNote } from "@/lib/event-description-draft-store";
import { MutationQueue } from "@/lib/mutation-queue";
import { readJsonResponse } from "@/lib/http-client";
import type { RecurringDeleteScope } from "@/lib/recurring-delete";
import { googleCalendarAuthorizedFetch } from "@/lib/google-browser-auth";

type GoogleEventResult = {
  htmlLink?: string;
  id?: string;
};

type GoogleErrorPayload = {
  error?: string | {
    errors?: Array<{ reason?: string }>;
    message?: string;
  };
  retryable?: boolean;
};

class GoogleEventMutationError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

const retryableReasons = new Set([
  "backendError",
  "quotaExceeded",
  "rateLimitExceeded",
  "userRateLimitExceeded",
]);

const mutationQueue = new MutationQueue({
  concurrency: 4,
  maxAttempts: 6,
  maxRetryDelayMs: 32_000,
  minStartIntervalMs: 400,
  retryBaseDelayMs: 1_000,
  shouldRetry: (error) =>
    error instanceof GoogleEventMutationError && error.retryable,
});

const mutationKey = googleEventMutationKey;

export function enqueueGoogleEventMutation<T>(key: string, run: () => Promise<T>): Promise<T> {
  return mutationQueue.enqueue(key, async () => {
    if (typeof navigator !== "undefined" && navigator.locks) return await navigator.locks.request(`unplan-event:${key}`, run);
    return await run();
  });
}

const responseError = async (
  response: Response,
  fallback: string,
  retryNotFound = false,
) => {
  const data = (await response.json().catch(() => ({}))) as GoogleErrorPayload;
  const error = data.error;
  const message = typeof error === "string" ? error : error?.message;
  const reasons = typeof error === "string"
    ? []
    : error?.errors?.flatMap(({ reason }) => reason ? [reason] : []) ?? [];
  const retryable = data.retryable === true
    || (retryNotFound && response.status === 404)
    || response.status === 429
    || response.status >= 500
    || reasons.some((reason) => retryableReasons.has(reason));
  return new GoogleEventMutationError(message || fallback, retryable);
};

export const createGoogleCompatibleEventId = () =>
  `unplan${crypto.randomUUID().replaceAll("-", "")}`;

const mutateGoogleEvent = async (
  method: "PATCH" | "POST",
  event: CalendarEvent,
  sendUpdates: GoogleSendUpdates = "none",
  sourceCalendarSourceId?: string,
  retryNotFound = false,
) => {
  const response = await googleCalendarAuthorizedFetch(event.calendarId, "/api/google/events", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      calendarSourceId: event.calendarId,
      sourceCalendarSourceId,
      eventId: event.providerEventId ?? event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      colorId: method === "PATCH" ? event.colorId ?? null : event.colorId,
      customColor: event.customColor ?? "",
      ...(method === "POST" ? { description: event.description ?? "" } : {}),
      location: event.location ?? "",
      timeZone: event.timeZone,
      recurrence: event.recurrence,
      transparency: event.transparency ?? "opaque",
      visibility: event.visibility ?? "default",
      reminders: event.reminders ?? { useDefault: true },
      attachments: event.attachments ?? [],
      createConference: event.conferenceLink === "pending",
      attendees: event.attendees?.flatMap(({ email, self }) => email && !self ? [{ email }] : []) ?? [],
      sendUpdates,
    }),
  });
  if (sourceCalendarSourceId && sourceCalendarSourceId !== event.calendarId && response.headers.get("x-unplan-event-moved") === "true") {
    const sourceIdentity = noteIdentity({ ...event, calendarId: sourceCalendarSourceId });
    const destinationIdentity = noteIdentity(event);
    if (sourceIdentity && destinationIdentity) await relocateNote(sourceIdentity.key, destinationIdentity);
  }
  if (!response.ok) {
    throw await responseError(
      response,
      "Google Calendar rejected the change",
      retryNotFound,
    );
  }
  const result = await readJsonResponse<GoogleEventResult>(response, "Google Calendar returned an empty response");
  const identity = noteIdentity(event);
  if (identity && method === "POST") {
    const destination = noteIdentity({ ...event, providerEventId: result.id ?? identity.eventId })!;
    await relocateNote(identity.key, destination, event.description ?? "");
  }
  return result;
};

export const updateGoogleEvent = (
  event: CalendarEvent,
  sendUpdates: GoogleSendUpdates = "none",
  sourceCalendarSourceId?: string,
  retryNotFound = false,
) =>
  enqueueGoogleEventMutation(mutationKey(event), () =>
    mutateGoogleEvent(
      "PATCH",
      event,
      sendUpdates,
      sourceCalendarSourceId,
      retryNotFound,
    ),
  );

export const respondToGoogleEvent = (
  event: CalendarEvent,
  responseStatus: CalendarEventRsvpStatus,
) => enqueueGoogleEventMutation(mutationKey(event), async () => {
  const attendeeEmail = event.attendees?.find((attendee) => attendee.self)?.email;
  if (!attendeeEmail) throw new Error("Your attendee email is unavailable");
  const payload: GoogleCalendarEventResponsePayload = {
    attendeeEmail,
    calendarSourceId: event.calendarId,
    eventId: event.providerEventId ?? event.id,
    responseStatus,
  };
  const response = await googleCalendarAuthorizedFetch(
    event.calendarId,
    "/api/google/events",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    throw await responseError(response, "Google Calendar rejected the response");
  }
});

export const createGoogleEvent = (
  event: CalendarEvent,
  sendUpdates: GoogleSendUpdates = "none",
) =>
  enqueueGoogleEventMutation(mutationKey(event), () =>
    mutateGoogleEvent("POST", event, sendUpdates),
  );

export const deleteGoogleEvent = (
  event: CalendarEvent,
  sendUpdates: GoogleSendUpdates = "none",
  deleteScope: RecurringDeleteScope = "single",
) =>
  enqueueGoogleEventMutation(
    deleteScope === "following" && event.recurringEventId
      ? `${event.calendarId}:${event.recurringEventId}`
      : mutationKey(event),
    async () => {
    const response = await googleCalendarAuthorizedFetch(event.calendarId, "/api/google/events", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        calendarSourceId: event.calendarId,
        eventId: event.providerEventId ?? event.id,
        recurringEventId: event.recurringEventId,
        originalStart: event.originalStart ?? event.start,
        deleteScope,
        sendUpdates,
      }),
    });
    if (!response.ok) {
      throw await responseError(
        response,
        "Google Calendar rejected the deletion",
      );
    }
    },
  );

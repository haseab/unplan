import type { CalendarEvent, GoogleSendUpdates } from "@/lib/calendar-types";
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

const mutationKey = (event: CalendarEvent) =>
  `${event.calendarId}:${event.id}`;

const responseError = async (response: Response, fallback: string) => {
  const data = (await response.json().catch(() => ({}))) as GoogleErrorPayload;
  const error = data.error;
  const message = typeof error === "string" ? error : error?.message;
  const reasons = typeof error === "string"
    ? []
    : error?.errors?.flatMap(({ reason }) => reason ? [reason] : []) ?? [];
  const retryable = data.retryable === true
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
      colorId: event.colorId,
      description: event.description ?? "",
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
  if (!response.ok) {
    throw await responseError(response, "Google Calendar rejected the change");
  }
  return readJsonResponse<GoogleEventResult>(
    response,
    "Google Calendar returned an empty response",
  );
};

export const updateGoogleEvent = (
  event: CalendarEvent,
  sendUpdates: GoogleSendUpdates = "none",
  sourceCalendarSourceId?: string,
) =>
  mutationQueue.enqueue(mutationKey(event), () =>
    mutateGoogleEvent("PATCH", event, sendUpdates, sourceCalendarSourceId),
  );

export const createGoogleEvent = (
  event: CalendarEvent,
  sendUpdates: GoogleSendUpdates = "none",
) =>
  mutationQueue.enqueue(mutationKey(event), () =>
    mutateGoogleEvent("POST", event, sendUpdates),
  );

export const deleteGoogleEvent = (
  event: CalendarEvent,
  sendUpdates: GoogleSendUpdates = "none",
  deleteScope: RecurringDeleteScope = "single",
) =>
  mutationQueue.enqueue(
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

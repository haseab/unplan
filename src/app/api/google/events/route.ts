import type {
  CalendarEvent,
  CalendarEventAttendee,
  GoogleCalendarEventPayload,
  GoogleCalendarEventResponsePayload,
  GoogleSendUpdates,
} from "@/lib/calendar-types";
import { getEventTextColor } from "@/lib/event-color";
import { providerEventSearchQuery } from "@/lib/event-search";
import { googleFetch, hasGoogleAuthorization } from "@/lib/google-calendar";
import { buildGoogleEventsQuery } from "@/lib/google-events-query";
import { parseGoogleCalendarSourceId } from "@/lib/google-source-id";
import { enforceRateLimit } from "@/lib/request-rate-limit";
import { trimRecurrenceBefore } from "@/lib/recurring-delete";
import { format, parseISO } from "date-fns";
import { NextRequest } from "next/server";

type GoogleEvent = {
  id: string;
  created?: string;
  summary?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  colorId?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: { date?: string; dateTime?: string; timeZone?: string };
  transparency?: "opaque" | "transparent";
  visibility?: "default" | "public" | "private" | "confidential";
  reminders?: GoogleCalendarEventPayload["reminders"];
  attachments?: GoogleCalendarEventPayload["attachments"];
  status?: string;
  organizer?: { self?: boolean };
  attendees?: CalendarEventAttendee[];
};
type GoogleEventsResponse = {
  items?: GoogleEvent[];
  error?: string | { message?: string };
};
type GoogleColor = { background: string; foreground: string };
type GoogleColorsResponse = { event?: Record<string, GoogleColor> };

class GoogleProviderError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const settleWithConcurrency = async <Result,>(
  tasks: Array<() => Promise<Result>>,
  concurrency: number,
) => {
  const results: Array<PromiseSettledResult<Result>> = new Array(tasks.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    async () => {
      while (nextIndex < tasks.length) {
        const index = nextIndex++;
        try {
          results[index] = { status: "fulfilled", value: await tasks[index]() };
        } catch (reason) {
          results[index] = { status: "rejected", reason };
        }
      }
    },
  );
  await Promise.all(workers);
  return results;
};

const eventTimes = (body: GoogleCalendarEventPayload) => body.allDay
  ? { start: { date: format(parseISO(body.start), "yyyy-MM-dd") }, end: { date: format(parseISO(body.end), "yyyy-MM-dd") } }
  : {
      start: { dateTime: body.start, ...(body.timeZone ? { timeZone: body.timeZone } : {}) },
      end: { dateTime: body.end, ...(body.timeZone ? { timeZone: body.timeZone } : {}) },
    };

const editableEventFields = (body: GoogleCalendarEventPayload) => ({
  ...(body.title !== undefined ? { summary: body.title } : {}),
  ...(body.colorId !== undefined ? { colorId: body.colorId } : {}),
  ...(body.description !== undefined ? { description: body.description } : {}),
  ...(body.location !== undefined ? { location: body.location } : {}),
  ...(body.attendees !== undefined ? { attendees: body.attendees } : {}),
  ...(body.recurrence !== undefined ? { recurrence: body.recurrence } : {}),
  ...(body.transparency ? { transparency: body.transparency } : {}),
  ...(body.visibility ? { visibility: body.visibility } : {}),
  ...(body.reminders ? { reminders: body.reminders } : {}),
  ...(body.attachments !== undefined ? { attachments: body.attachments } : {}),
  ...(body.createConference ? {
    conferenceData: {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  } : {}),
  ...eventTimes(body),
});

const sendUpdatesQuery = (sendUpdates: GoogleSendUpdates | undefined) =>
  new URLSearchParams({ sendUpdates: sendUpdates === "all" ? "all" : "none" }).toString();

const googleEventRsvpStatuses = new Set(["accepted", "declined", "tentative"]);

const loadGoogleEventColors = async (request: NextRequest): Promise<Record<string, GoogleColor>> => {
  try {
    const response = await googleFetch(request, "/colors");
    if (!response.ok) return {};
    return ((await response.json()) as GoogleColorsResponse).event ?? {};
  } catch {
    return {};
  }
};

const loadGoogleEvents = async (
  request: NextRequest,
  accountId: string,
  providerCalendarId: string,
  timeMin: string | null,
  timeMax: string | null,
  searchQuery?: string,
) => {
  const query = buildGoogleEventsQuery({
    searchQuery,
    timeMax,
    timeMin,
  });
  const response = await googleFetch(
    request,
    `/calendars/${encodeURIComponent(providerCalendarId)}/events?${query}`,
  );
  const responseText = await response.text();
  let data: GoogleEventsResponse = {};
  try {
    data = responseText ? JSON.parse(responseText) as GoogleEventsResponse : {};
  } catch {
    // Preserve the HTTP status below when an upstream proxy returns non-JSON.
  }
  if (!response.ok) {
    const providerMessage = typeof data.error === "string"
      ? data.error
      : data.error?.message;
    const message = providerMessage
      ?? `Google events request failed (${response.status} ${response.statusText || "Unknown"})`;
    console.warn("[BUG:GOOGLE-PARTIAL-SYNC] Calendar event import failed", {
      accountId,
      message,
      status: response.status,
    });
    throw new GoogleProviderError(message, response.status);
  }
  return (data.items ?? []).filter((event) => event.status !== "cancelled");
};

const mapGoogleEvent = (
  event: GoogleEvent,
  calendarSourceId: string,
  calendarColor: string,
  eventColors: Record<string, GoogleColor>,
): CalendarEvent => {
  const eventColor = event.colorId ? eventColors[event.colorId] : undefined;
  return {
    id: `${calendarSourceId}:${event.id}`,
    providerEventId: event.id,
    calendarId: calendarSourceId,
    title: event.summary ?? "",
    start: event.start.dateTime ?? event.start.date!,
    end: event.end.dateTime ?? event.end.date!,
    createdAt: event.created,
    allDay: Boolean(event.start.date),
    calendarColor,
    color: eventColor?.background ?? calendarColor,
    colorId: event.colorId,
    description: event.description,
    textColor: getEventTextColor(eventColor?.background ?? calendarColor),
    location: event.location,
    htmlLink: event.htmlLink,
    conferenceLink: event.hangoutLink,
    timeZone: event.start.timeZone,
    recurrence: event.recurrence,
    recurringEventId: event.recurringEventId,
    originalStart: event.originalStartTime?.dateTime ?? event.originalStartTime?.date,
    transparency: event.transparency,
    visibility: event.visibility,
    reminders: event.reminders,
    attachments: event.attachments,
    organizerSelf: event.organizer?.self === true,
    attendees: event.attendees,
    provider: "google",
  };
};

export async function GET(request: NextRequest) {
  const rateLimited = await enforceRateLimit(request, {
    limit: 240,
    scope: "google-events-read",
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;
  if (!hasGoogleAuthorization(request)) {
    return Response.json({ error: "Google authorization is required" }, { status: 401 });
  }
  const sourceIds = request.nextUrl.searchParams.getAll("sourceId");
  const timeMin = request.nextUrl.searchParams.get("timeMin");
  const timeMax = request.nextUrl.searchParams.get("timeMax");
  const searchQuery = request.nextUrl.searchParams.get("search")?.trim();
  const searchStrategy = request.nextUrl.searchParams.get("searchStrategy") === "exact"
    ? "exact"
    : "broad";
  if (!sourceIds.length || (!timeMin && !timeMax && !searchQuery)) {
    return Response.json({ error: "Missing calendar range or search query" }, { status: 400 });
  }
  const sources = sourceIds.map(parseGoogleCalendarSourceId);
  if (sources.some((source) => !source)) {
    return Response.json({ error: "A calendar source is unavailable" }, { status: 404 });
  }
  const colors = request.nextUrl.searchParams.getAll("color");
  const resolvedSources = sources.flatMap((source, index) => source ? [{
    ...source,
    backgroundColor: colors[index] ?? "#4666e5",
    id: sourceIds[index],
  }] : []);
  const providerSearch = searchQuery
    ? searchStrategy === "exact"
      ? searchQuery
      : providerEventSearchQuery(searchQuery)
    : undefined;
  const accountIds = [...new Set(resolvedSources.map((source) => source.accountId))];
  if (accountIds.length !== 1) {
    return Response.json({ error: "Calendars must belong to one Google account per request" }, { status: 400 });
  }
  const eventColors = await loadGoogleEventColors(request);
  const results = await settleWithConcurrency(
    resolvedSources.map((source) => () =>
      loadGoogleEvents(request, source.accountId, source.providerCalendarId, timeMin, timeMax, providerSearch),
    ),
    6,
  );
  const events = results.flatMap((result, index) => result.status === "fulfilled"
    ? result.value.map((event) => mapGoogleEvent(
      event,
      resolvedSources[index].id,
      colors[index] ?? resolvedSources[index].backgroundColor,
      eventColors,
    ))
    : []);
  const errors = results.flatMap((result, index) => result.status === "rejected"
    ? [{
        accountId: resolvedSources[index].accountId,
        message: result.reason instanceof Error ? result.reason.message : "Event import failed",
        sourceId: resolvedSources[index].id,
        status: result.reason instanceof GoogleProviderError ? result.reason.status : 502,
      }]
    : []);
  if (errors.length === results.length) {
    return Response.json(
      { error: errors[0]?.message ?? "Event import failed", errors },
      { status: errors[0]?.status ?? 502 },
    );
  }
  return Response.json({ events, errors });
}

const resolveMutationSources = (body: GoogleCalendarEventPayload) => {
  const destination = parseGoogleCalendarSourceId(body.calendarSourceId);
  const source = body.sourceCalendarSourceId
    ? parseGoogleCalendarSourceId(body.sourceCalendarSourceId)
    : destination;
  return destination && source ? { destination, source } : null;
};

export async function PATCH(request: NextRequest) {
  const rateLimited = await enforceRateLimit(request, {
    limit: 120,
    scope: "google-events-write",
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;
  const body = (await request.json()) as
    | GoogleCalendarEventPayload
    | GoogleCalendarEventResponsePayload;
  if ("responseStatus" in body) {
    if (
      !body.calendarSourceId
      || !body.eventId
      || !body.attendeeEmail
      || !googleEventRsvpStatuses.has(body.responseStatus)
    ) {
      return Response.json({ error: "Invalid event response" }, { status: 400 });
    }
    const source = parseGoogleCalendarSourceId(body.calendarSourceId);
    if (!source) {
      return Response.json({ error: "Calendar source not found" }, { status: 404 });
    }
    const response = await googleFetch(
      request,
      `/calendars/${encodeURIComponent(source.providerCalendarId)}/events/${encodeURIComponent(body.eventId)}?sendUpdates=none`,
      {
        method: "PATCH",
        body: JSON.stringify({
          attendees: [{
            email: body.attendeeEmail,
            responseStatus: body.responseStatus,
          }],
          attendeesOmitted: true,
        }),
      },
    );
    return Response.json(await response.json(), { status: response.status });
  }
  if (!body.calendarSourceId || !body.eventId || !body.start || !body.end) {
    return Response.json({ error: "Invalid event update" }, { status: 400 });
  }
  const sources = resolveMutationSources(body);
  if (!sources) return Response.json({ error: "Calendar source not found" }, { status: 404 });
  if (sources.source.accountId !== sources.destination.accountId) {
    return Response.json({ error: "Moving events between Google accounts is not supported yet" }, { status: 400 });
  }
  if (body.sourceCalendarSourceId && body.sourceCalendarSourceId !== body.calendarSourceId) {
    const moveQuery = new URLSearchParams({
      destination: sources.destination.providerCalendarId,
      sendUpdates: body.sendUpdates === "all" ? "all" : "none",
    });
    const moved = await googleFetch(
      request,
      `/calendars/${encodeURIComponent(sources.source.providerCalendarId)}/events/${encodeURIComponent(body.eventId)}/move?${moveQuery}`,
      { method: "POST" },
    );
    if (!moved.ok) return Response.json(await moved.json(), { status: moved.status });
  }
  const updateQuery = `${sendUpdatesQuery(body.sendUpdates)}&conferenceDataVersion=1&supportsAttachments=true`;
  const response = await googleFetch(
    request,
    `/calendars/${encodeURIComponent(sources.destination.providerCalendarId)}/events/${encodeURIComponent(body.eventId)}?${updateQuery}`,
    { method: "PATCH", body: JSON.stringify(editableEventFields(body)) },
  );
  return Response.json(await response.json(), { status: response.status });
}

export async function POST(request: NextRequest) {
  const rateLimited = await enforceRateLimit(request, {
    limit: 120,
    scope: "google-events-write",
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;
  const body = (await request.json()) as GoogleCalendarEventPayload;
  if (!body.calendarSourceId || !body.start || !body.end) {
    return Response.json({ error: "Invalid event copy" }, { status: 400 });
  }
  const sources = resolveMutationSources(body);
  if (!sources) return Response.json({ error: "Calendar source not found" }, { status: 404 });
  const insertQuery = `${sendUpdatesQuery(body.sendUpdates)}&conferenceDataVersion=1&supportsAttachments=true`;
  const response = await googleFetch(
    request,
    `/calendars/${encodeURIComponent(sources.destination.providerCalendarId)}/events?${insertQuery}`,
    {
      method: "POST",
      body: JSON.stringify({ ...(body.eventId ? { id: body.eventId } : {}), ...editableEventFields(body) }),
    },
  );
  if (response.status === 409 && body.eventId) {
    const existing = await googleFetch(
      request,
      `/calendars/${encodeURIComponent(sources.destination.providerCalendarId)}/events/${encodeURIComponent(body.eventId)}`,
    );
    return Response.json(await existing.json(), { status: existing.status });
  }
  return Response.json(await response.json(), { status: response.status });
}

export async function DELETE(request: NextRequest) {
  const rateLimited = await enforceRateLimit(request, {
    limit: 120,
    scope: "google-events-write",
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;
  const body = (await request.json()) as GoogleCalendarEventPayload;
  if (!body.calendarSourceId || !body.eventId) {
    return Response.json({ error: "Invalid event deletion" }, { status: 400 });
  }
  const sources = resolveMutationSources(body);
  if (!sources) return Response.json({ error: "Calendar source not found" }, { status: 404 });
  if (body.deleteScope === "following") {
    if (!body.recurringEventId || !body.originalStart) {
      return Response.json(
        { error: "Missing recurring event information" },
        { status: 400 },
      );
    }
    const recurringEventPath = `/calendars/${encodeURIComponent(sources.destination.providerCalendarId)}/events/${encodeURIComponent(body.recurringEventId)}`;
    const recurringResponse = await googleFetch(
      request,
      recurringEventPath,
    );
    const recurringEvent = await recurringResponse.json().catch(() => ({})) as {
      recurrence?: string[];
      error?: unknown;
    };
    if (!recurringResponse.ok) {
      return Response.json(recurringEvent, { status: recurringResponse.status });
    }

    let recurrence: string[];
    try {
      recurrence = trimRecurrenceBefore(
        recurringEvent.recurrence ?? [],
        body.originalStart,
      );
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Could not trim recurring event" },
        { status: 422 },
      );
    }

    const trimResponse = await googleFetch(
      request,
      `${recurringEventPath}?${sendUpdatesQuery(body.sendUpdates)}`,
      { method: "PATCH", body: JSON.stringify({ recurrence }) },
    );
    if (trimResponse.ok) return new Response(null, { status: 204 });
    return Response.json(
      await trimResponse.json().catch(() => ({})),
      { status: trimResponse.status },
    );
  }
  const response = await googleFetch(
    request,
    `/calendars/${encodeURIComponent(sources.destination.providerCalendarId)}/events/${encodeURIComponent(body.eventId)}?${sendUpdatesQuery(body.sendUpdates)}`,
    { method: "DELETE" },
  );
  if (response.ok || response.status === 404 || response.status === 410) {
    return new Response(null, { status: 204 });
  }
  const data = await response.json().catch(() => ({})) as {
    error?: { errors?: Array<{ reason?: string }>; message?: string } | string;
  };
  const message = typeof data.error === "string" ? data.error : data.error?.message;
  const reasons = typeof data.error === "string"
    ? []
    : data.error?.errors?.flatMap(({ reason }) => reason ? [reason] : []) ?? [];
  const retryable = response.status === 429 || response.status >= 500 || reasons.some((reason) => [
    "backendError", "quotaExceeded", "rateLimitExceeded", "userRateLimitExceeded",
  ].includes(reason));
  return Response.json({ error: message || "Event deletion failed", retryable }, { status: response.status });
}

import { googleFetch } from "@/lib/google-calendar";
import { parseGoogleCalendarSourceId } from "@/lib/google-source-id";
import { enforceRateLimit } from "@/lib/request-rate-limit";
import type { NextRequest } from "next/server";

type GoogleConferenceEvent = {
  conferenceData?: {
    createRequest?: { status?: { statusCode?: "failure" | "pending" | "success" } };
    entryPoints?: Array<{
      entryPointType?: string;
      uri?: string;
    }>;
  };
  error?: string | { message?: string };
  hangoutLink?: string;
};

const providerError = (data: GoogleConferenceEvent, fallback: string) =>
  typeof data.error === "string" ? data.error : data.error?.message ?? fallback;

const conferenceResult = (event: GoogleConferenceEvent) => {
  const conferenceLink = event.hangoutLink
    ?? event.conferenceData?.entryPoints?.find(
      (entryPoint) => entryPoint.entryPointType === "video",
    )?.uri;
  const providerStatus = event.conferenceData?.createRequest?.status?.statusCode;
  return {
    conferenceLink,
    status: conferenceLink ? "success" : providerStatus ?? "pending",
  };
};

const resolveEvent = (
  calendarSourceId: string | null | undefined,
  eventId: string | null | undefined,
) => {
  if (!calendarSourceId || !eventId) return null;
  const source = parseGoogleCalendarSourceId(calendarSourceId);
  return source ? { eventId, source } : null;
};

export async function POST(request: NextRequest) {
  const rateLimited = await enforceRateLimit(request, {
    limit: 30,
    scope: "google-conference-write",
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;
  const body = await request.json().catch(() => null) as {
    calendarSourceId?: string;
    eventId?: string;
  } | null;
  const resolved = resolveEvent(body?.calendarSourceId, body?.eventId);
  if (!resolved) {
    return Response.json({ error: "Calendar event is unavailable" }, { status: 404 });
  }

  const response = await googleFetch(
    request,
    `/calendars/${encodeURIComponent(resolved.source.providerCalendarId)}/events/${encodeURIComponent(resolved.eventId)}?conferenceDataVersion=1&sendUpdates=none`,
    {
      method: "PATCH",
      body: JSON.stringify({
        conferenceData: {
          createRequest: {
            conferenceSolutionKey: { type: "hangoutsMeet" },
            requestId: crypto.randomUUID(),
          },
        },
      }),
    },
  );
  const data = await response.json().catch(() => ({})) as GoogleConferenceEvent;
  if (!response.ok) {
    return Response.json(
      { error: providerError(data, "Google Meet could not be created") },
      { status: response.status },
    );
  }
  const result = conferenceResult(data);
  if (result.status === "failure") {
    return Response.json({ error: "Google could not create this meeting" }, { status: 502 });
  }
  return Response.json(result, { status: result.status === "success" ? 200 : 202 });
}

export async function GET(request: NextRequest) {
  const rateLimited = await enforceRateLimit(request, {
    limit: 120,
    scope: "google-conference-read",
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;
  const resolved = resolveEvent(
    request.nextUrl.searchParams.get("calendarSourceId"),
    request.nextUrl.searchParams.get("eventId"),
  );
  if (!resolved) {
    return Response.json({ error: "Calendar event is unavailable" }, { status: 404 });
  }
  const response = await googleFetch(
    request,
    `/calendars/${encodeURIComponent(resolved.source.providerCalendarId)}/events/${encodeURIComponent(resolved.eventId)}`,
  );
  const data = await response.json().catch(() => ({})) as GoogleConferenceEvent;
  if (!response.ok) {
    return Response.json(
      { error: providerError(data, "Google Meet status could not be checked") },
      { status: response.status },
    );
  }
  const result = conferenceResult(data);
  if (result.status === "failure") {
    return Response.json({ error: "Google could not create this meeting" }, { status: 502 });
  }
  return Response.json(result, { status: result.status === "success" ? 200 : 202 });
}

import { googleFetch } from "@/lib/google-calendar";
import { createGoogleCalendarSourceId, parseGoogleCalendarSourceId } from "@/lib/google-source-id";
import { enforceRateLimit } from "@/lib/request-rate-limit";
import type { NextRequest } from "next/server";

type GoogleCalendarList = {
  items?: Array<{
    accessRole?: string;
    backgroundColor?: string;
    foregroundColor?: string;
    id: string;
    primary?: boolean;
    selected?: boolean;
    summary: string;
  }>;
  error?: { message?: string };
};

export async function GET(request: NextRequest) {
  const rateLimited = await enforceRateLimit(request, {
    limit: 120,
    scope: "google-calendars-read",
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;
  const accountId = request.nextUrl.searchParams.get("accountId")?.trim();
  if (!accountId) {
    return Response.json({ error: "Google account identity is required" }, { status: 400 });
  }

  const response = await googleFetch(request, "/users/me/calendarList");
  const data = await response.json().catch(() => ({})) as GoogleCalendarList;
  if (!response.ok) return Response.json(data, { status: response.status });

  return Response.json({
    calendars: (data.items ?? []).map((calendar) => ({
      accountId,
      backgroundColor: calendar.backgroundColor ?? "#4666e5",
      foregroundColor: calendar.foregroundColor ?? "#ffffff",
      id: createGoogleCalendarSourceId(accountId, calendar.id),
      name: calendar.summary,
      primary: calendar.primary ?? false,
      provider: "google" as const,
      providerCalendarId: calendar.id,
      selected: calendar.selected ?? calendar.primary ?? false,
      writable: ["owner", "writer"].includes(calendar.accessRole ?? ""),
    })),
  });
}

export async function PATCH(request: NextRequest) {
  const rateLimited = await enforceRateLimit(request, {
    limit: 60,
    scope: "google-calendars-write",
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;
  const body = await request.json().catch(() => null) as {
    calendarSourceId?: string;
    selected?: boolean;
  } | null;
  const source = body?.calendarSourceId
    ? parseGoogleCalendarSourceId(body.calendarSourceId)
    : null;
  if (!source || typeof body?.selected !== "boolean") {
    return Response.json({ error: "Invalid calendar visibility update" }, { status: 400 });
  }

  const response = await googleFetch(
    request,
    `/users/me/calendarList/${encodeURIComponent(source.providerCalendarId)}`,
    { method: "PATCH", body: JSON.stringify({ selected: body.selected }) },
  );
  const data = await response.json().catch(() => ({}));
  return Response.json(data, { status: response.status });
}

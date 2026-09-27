import { NextRequest } from "next/server";
import { googleFetch, hasGoogleAuthorization } from "@/lib/google-calendar";
import { parseGoogleCalendarSourceId } from "@/lib/google-source-id";
import { syncGoogleDescription } from "@/lib/google-description-sync";
import { enforceRateLimit } from "@/lib/request-rate-limit";

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, { limit: 120, scope: "google-events-write", windowMs: 60_000 });
  if (limited) return limited;
  if (!hasGoogleAuthorization(request)) return Response.json({ error: "Reconnect your Google account." }, { status: 401 });
  try {
    const body = await request.json();
    const source = typeof body.calendarId === "string" ? parseGoogleCalendarSourceId(body.calendarId) : null;
    if (!source || source.accountId !== body.accountId || typeof body.eventId !== "string" || !body.eventId
      || typeof body.base !== "string" || typeof body.local !== "string"
      || (body.sendUpdates !== undefined && body.sendUpdates !== "all" && body.sendUpdates !== "none")
      || (body.reviewOnly !== undefined && typeof body.reviewOnly !== "boolean")) {
      return Response.json({ error: "Invalid notes update" }, { status: 400 });
    }
    const path = `/calendars/${encodeURIComponent(source.providerCalendarId)}/events/${encodeURIComponent(body.eventId)}`;
    return await syncGoogleDescription(body, (init) => googleFetch(request,
      init?.method === "PATCH" ? `${path}?sendUpdates=${body.sendUpdates === "all" ? "all" : "none"}` : path,
      { ...init, signal: request.signal }));
  } catch (error) {
    console.error("[GOOGLE:NOTES] Description sync failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "Notes sync failed. Your local draft is retained." }, { status: 503 });
  }
}

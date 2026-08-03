import { googleFetch } from "@/lib/google-calendar";
import type { CalendarEvent, GoogleCalendarEventPayload } from "@/lib/calendar-types";
import { format, parseISO } from "date-fns";
import { NextRequest } from "next/server";

type GoogleEvent = { id: string; summary?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string }; location?: string; htmlLink?: string; status?: string };
type GoogleEventsResponse = { items?: GoogleEvent[]; error?: { message?: string } };

const eventTimes = (body: GoogleCalendarEventPayload) => body.allDay
  ? { start: { date: format(parseISO(body.start), "yyyy-MM-dd") }, end: { date: format(parseISO(body.end), "yyyy-MM-dd") } }
  : { start: { dateTime: body.start }, end: { dateTime: body.end } };

export async function GET(request: NextRequest) {
  const calendarIds = request.nextUrl.searchParams.getAll("calendarId");
  const timeMin = request.nextUrl.searchParams.get("timeMin");
  const timeMax = request.nextUrl.searchParams.get("timeMax");
  if (!calendarIds.length || !timeMin || !timeMax) return Response.json({ error: "Missing calendar range" }, { status: 400 });
  const colors = request.nextUrl.searchParams.getAll("color");
  const textColors = request.nextUrl.searchParams.getAll("textColor");

  try {
    const responses = await Promise.all(calendarIds.map(async (calendarId, index) => {
      const query = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "2500" });
      const response = await googleFetch(`/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`);
      const data = (await response.json()) as GoogleEventsResponse;
      if (!response.ok) throw new Error(data.error?.message ?? "Event import failed");
      return (data.items ?? []).filter((event) => event.status !== "cancelled").map((event): CalendarEvent => ({
        id: event.id,
        calendarId,
        title: event.summary || "Untitled event",
        start: event.start.dateTime ?? event.start.date!,
        end: event.end.dateTime ?? event.end.date!,
        allDay: Boolean(event.start.date),
        location: event.location,
        htmlLink: event.htmlLink,
        color: colors[index] ?? "#4666e5",
        textColor: textColors[index] ?? "#ffffff",
        provider: "google",
      }));
    }));
    return Response.json({ events: responses.flat() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Event import failed" }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as GoogleCalendarEventPayload;
  if (!body.calendarId || !body.eventId || !body.start || !body.end) return Response.json({ error: "Invalid event update" }, { status: 400 });
  const response = await googleFetch(`/calendars/${encodeURIComponent(body.calendarId)}/events/${encodeURIComponent(body.eventId)}`, { method: "PATCH", body: JSON.stringify(eventTimes(body)) });
  const data = await response.json();
  return Response.json(data, { status: response.status });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as GoogleCalendarEventPayload;
  if (!body.calendarId || !body.start || !body.end) return Response.json({ error: "Invalid event copy" }, { status: 400 });
  const response = await googleFetch(`/calendars/${encodeURIComponent(body.calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify({ summary: body.title || "Untitled event", ...eventTimes(body) }),
  });
  const data = await response.json();
  return Response.json(data, { status: response.status });
}

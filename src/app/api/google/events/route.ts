import { googleFetch } from "@/lib/google-calendar";
import type { CalendarEvent, GoogleCalendarEventPayload } from "@/lib/calendar-types";
import { format, parseISO } from "date-fns";
import { NextRequest } from "next/server";

type GoogleEvent = {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  colorId?: string;
  location?: string;
  htmlLink?: string;
  status?: string;
};
type GoogleEventsResponse = { items?: GoogleEvent[]; error?: { message?: string } };
type GoogleColor = { background: string; foreground: string };
type GoogleColorsResponse = { event?: Record<string, GoogleColor> };

const eventTimes = (body: GoogleCalendarEventPayload) => body.allDay
  ? { start: { date: format(parseISO(body.start), "yyyy-MM-dd") }, end: { date: format(parseISO(body.end), "yyyy-MM-dd") } }
  : { start: { dateTime: body.start }, end: { dateTime: body.end } };

const loadGoogleEventColors = async (): Promise<Record<string, GoogleColor>> => {
  try {
    const response = await googleFetch("/colors");
    if (!response.ok) return {};
    return ((await response.json()) as GoogleColorsResponse).event ?? {};
  } catch {
    return {};
  }
};

const loadGoogleEvents = async (
  calendarId: string,
  timeMin: string,
  timeMax: string,
) => {
  const query = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "2500",
  });
  const response = await googleFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`,
  );
  const data = (await response.json()) as GoogleEventsResponse;
  if (!response.ok) throw new Error(data.error?.message ?? "Event import failed");
  return (data.items ?? []).filter((event) => event.status !== "cancelled");
};

const mapGoogleEvent = (
  event: GoogleEvent,
  calendarId: string,
  calendarColor: string,
  calendarTextColor: string,
  eventColors: Record<string, GoogleColor>,
): CalendarEvent => {
  const eventColor = event.colorId ? eventColors[event.colorId] : undefined;
  return {
    id: event.id,
    calendarId,
    title: event.summary || "Untitled event",
    start: event.start.dateTime ?? event.start.date!,
    end: event.end.dateTime ?? event.end.date!,
    allDay: Boolean(event.start.date),
    calendarColor,
    color: eventColor?.background ?? calendarColor,
    colorId: event.colorId,
    textColor: eventColor?.foreground ?? calendarTextColor,
    location: event.location,
    htmlLink: event.htmlLink,
    provider: "google",
  };
};

export async function GET(request: NextRequest) {
  const calendarIds = request.nextUrl.searchParams.getAll("calendarId");
  const timeMin = request.nextUrl.searchParams.get("timeMin");
  const timeMax = request.nextUrl.searchParams.get("timeMax");
  if (!calendarIds.length || !timeMin || !timeMax) return Response.json({ error: "Missing calendar range" }, { status: 400 });
  const colors = request.nextUrl.searchParams.getAll("color");
  const textColors = request.nextUrl.searchParams.getAll("textColor");

  try {
    const [eventColors, responses] = await Promise.all([
      loadGoogleEventColors(),
      Promise.all(
        calendarIds.map((calendarId) =>
          loadGoogleEvents(calendarId, timeMin, timeMax),
        ),
      ),
    ]);
    const events = responses.flatMap((calendarEvents, index) => {
      const calendarColor = colors[index] ?? "#4666e5";
      const calendarTextColor = textColors[index] ?? "#ffffff";
      return calendarEvents.map((event) =>
        mapGoogleEvent(
          event,
          calendarIds[index],
          calendarColor,
          calendarTextColor,
          eventColors,
        ),
      );
    });
    return Response.json({ events });
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
    body: JSON.stringify({
      summary: body.title || "Untitled event",
      ...(body.colorId ? { colorId: body.colorId } : {}),
      ...eventTimes(body),
    }),
  });
  const data = await response.json();
  return Response.json(data, { status: response.status });
}

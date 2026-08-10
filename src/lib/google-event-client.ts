import type { CalendarEvent } from "@/lib/calendar-types";

type GoogleEventResult = {
  htmlLink?: string;
  id?: string;
};

const mutateGoogleEvent = async (
  method: "PATCH" | "POST",
  event: CalendarEvent,
) => {
  const response = await fetch("/api/google/events", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      calendarId: event.calendarId,
      eventId: method === "PATCH" ? event.id : undefined,
      title: event.title,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      colorId: event.colorId,
    }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Google Calendar rejected the change");
  }
  return response.json() as Promise<GoogleEventResult>;
};

export const updateGoogleEvent = (event: CalendarEvent) =>
  mutateGoogleEvent("PATCH", event);

export const createGoogleEvent = (event: CalendarEvent) =>
  mutateGoogleEvent("POST", event);

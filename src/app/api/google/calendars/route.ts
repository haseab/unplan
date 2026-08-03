import { googleFetch } from "@/lib/google-calendar";

type GoogleCalendarList = {
  items?: Array<{ id: string; summary: string; backgroundColor?: string; foregroundColor?: string; primary?: boolean; accessRole?: string; selected?: boolean }>;
  error?: { message?: string };
};

export async function GET() {
  const response = await googleFetch("/users/me/calendarList");
  const data = (await response.json()) as GoogleCalendarList;
  if (!response.ok) {
    return Response.json({ error: data.error?.message ?? "Could not load Google calendars" }, { status: response.status });
  }
  return Response.json({
    calendars: (data.items ?? []).map((calendar) => ({
      id: calendar.id,
      name: calendar.summary,
      backgroundColor: calendar.backgroundColor ?? "#4666e5",
      foregroundColor: calendar.foregroundColor ?? "#ffffff",
      primary: calendar.primary,
      writable: ["owner", "writer"].includes(calendar.accessRole ?? ""),
      provider: "google" as const,
      selected: calendar.selected ?? calendar.primary ?? false,
    })),
  });
}

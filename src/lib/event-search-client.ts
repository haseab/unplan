import type { CalendarEvent, CalendarSource } from "./calendar-types";
import { readJsonResponse } from "./http-client";
import { googleAuthorizedFetch } from "./google-browser-auth";
import { parseGoogleCalendarSourceId } from "./google-source-id";

type EventSearchResponse = {
  error?: string;
  events?: CalendarEvent[];
};

export type GoogleEventSearchStrategy = "broad" | "exact";

export const searchGooglePastEvents = async (
  query: string,
  calendars: CalendarSource[],
  now: Date,
  signal: AbortSignal,
  strategy: GoogleEventSearchStrategy,
) => {
  if (!calendars.length) return [];
  const byAccount = new Map<string, CalendarSource[]>();
  calendars.forEach((calendar) => {
    const source = parseGoogleCalendarSourceId(calendar.id);
    if (!source) return;
    const group = byAccount.get(source.accountId) ?? [];
    group.push(calendar);
    byAccount.set(source.accountId, group);
  });

  const results = await Promise.allSettled([...byAccount].map(async ([accountId, accountCalendars]) => {
    const params = new URLSearchParams({
      search: query,
      searchStrategy: strategy,
      timeMax: now.toISOString(),
    });
    accountCalendars.forEach((calendar) => {
      params.append("sourceId", calendar.id);
      params.append("color", calendar.backgroundColor);
    });
    const response = await googleAuthorizedFetch(
      accountId,
      `/api/google/events?${params.toString()}`,
      { signal },
    );
    const data = await readJsonResponse<EventSearchResponse>(
      response,
      "Past events could not be searched",
    );
    if (!response.ok) {
      throw new Error(data.error || "Past events could not be searched");
    }
    return data.events ?? [];
  }));
  const successful = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  if (!successful.length && results.length) {
    const failure = results.find((result) => result.status === "rejected");
    throw failure?.reason ?? new Error("Past events could not be searched");
  }
  return successful.flat();
};

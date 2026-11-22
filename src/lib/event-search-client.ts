import type { CalendarEvent, CalendarSource } from "./calendar-types";
import { readJsonResponse } from "./http-client";
import { googleAuthorizedFetch } from "./google-browser-auth";
import { parseGoogleCalendarSourceId } from "./google-source-id";
import type { EventSearchTimeRange } from "./event-search";

type EventSearchResponse = {
  error?: string;
  errors?: Array<{ message: string }>;
  events?: CalendarEvent[];
};

export class IncompleteEventSearchError extends Error {
  constructor(message: string, readonly events: CalendarEvent[]) {
    super(message);
    this.name = "IncompleteEventSearchError";
  }
}

export type GoogleEventSearchStrategy = "broad" | "exact";

export const searchGoogleEvents = async (
  query: string,
  calendars: CalendarSource[],
  now: Date,
  signal: AbortSignal,
  strategy: GoogleEventSearchStrategy,
  timeRange: EventSearchTimeRange,
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

  const ranges = timeRange === "all" ? ["future", "past"] as const : [timeRange];
  const results = await Promise.allSettled(
    [...byAccount].flatMap(([accountId, accountCalendars]) => ranges.map(async (range) => {
      const params = new URLSearchParams({
        search: query,
        searchStrategy: strategy,
      });
      if (range === "fortnight") params.set("timeMin", new Date(now.getTime() - 14 * 86400000).toISOString());
      params.set(range === "past" || range === "fortnight" ? "timeMax" : "timeMin", now.toISOString());
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
        "Events could not be searched",
      );
      if (!response.ok || data.errors?.length) {
        throw new IncompleteEventSearchError(data.error || data.errors?.[0]?.message || "Events could not be searched", data.events ?? []);
      }
      return data.events ?? [];
    })),
  );
  const successful = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  if (successful.length !== results.length) {
    const failure = results.find((result) => result.status === "rejected");
    const reason: unknown = failure?.reason;
    const partial = results.flatMap(result => result.status === "rejected" && result.reason instanceof IncompleteEventSearchError ? result.reason.events : []);
    throw new IncompleteEventSearchError(
      reason instanceof Error ? reason.message : "Events could not be searched",
      [...successful.flat(), ...partial],
    );
  }
  return successful.flat();
};

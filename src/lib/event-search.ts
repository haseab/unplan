import type { CalendarEvent } from "./calendar-types";

export type EventSearchTimeRange = "all" | "future" | "past";

const searchableEventText = (event: CalendarEvent) => [
  event.title,
  event.description,
  event.location,
  ...event.attendees?.flatMap(({ displayName, email }) => [displayName, email]) ?? [],
]
  .filter(Boolean)
  .join(" ")
  .replace(/\s+/g, " ")
  .toLocaleLowerCase();

const normalizeSearchQuery = (query: string) =>
  query.trim().replace(/\s+/g, " ").toLocaleLowerCase();

export const providerEventSearchQuery = (query: string) => {
  const terms = normalizeSearchQuery(query).split(" ").filter(Boolean);
  return terms.length > 1 ? terms.slice(0, -1).join(" ") : terms[0] ?? "";
};

const matchesTimeRange = (
  event: CalendarEvent,
  now: Date,
  timeRange: EventSearchTimeRange,
) => {
  if (timeRange === "all") return true;
  const isPast = new Date(event.end).getTime() <= now.getTime();
  return timeRange === "past" ? isPast : !isPast;
};

export const sortEventSearchResults = (
  events: CalendarEvent[],
  now: Date,
) => [...events].sort((first, second) => {
  const firstStart = new Date(first.start).getTime();
  const secondStart = new Date(second.start).getTime();
  const firstIsPast = new Date(first.end).getTime() <= now.getTime();
  const secondIsPast = new Date(second.end).getTime() <= now.getTime();
  if (firstIsPast !== secondIsPast) return firstIsPast ? 1 : -1;
  return firstIsPast ? secondStart - firstStart : firstStart - secondStart;
});

export const searchLoadedEvents = (
  events: CalendarEvent[],
  query: string,
  now: Date,
  timeRange: EventSearchTimeRange = "all",
) => {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) return [];
  return sortEventSearchResults(
    events.filter((event) =>
      matchesTimeRange(event, now, timeRange)
      && searchableEventText(event).includes(normalizedQuery),
    ),
    now,
  );
};

export const mergeCalendarSearchResults = (
  resultGroups: CalendarEvent[][],
  now: Date,
  timeRange: EventSearchTimeRange = "all",
) => {
  const unique = new Map<string, CalendarEvent>();
  resultGroups.flat().forEach((event) => {
    if (matchesTimeRange(event, now, timeRange)) {
      unique.set(`${event.calendarId}:${event.id}`, event);
    }
  });
  return sortEventSearchResults([...unique.values()], now);
};

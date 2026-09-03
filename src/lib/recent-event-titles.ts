import type { CalendarEvent, CalendarSource } from "./calendar-types";

export type RecentEventTitle = {
  calendarColor: string;
  calendarId: string;
  durationMinutes: number;
  eventId: string;
  lastUsedAt: number;
  normalizedTitle: string;
  title: string;
  usageCount: number;
};

export const normalizeRecentEventTitle = (title: string) =>
  title.trim().replace(/\s+/g, " ").toLocaleLowerCase();

export const recentEventTitleKey = (calendarId: string, normalizedTitle: string) =>
  JSON.stringify([calendarId, normalizedTitle]);

const parseRecentEventTitle = (value: unknown): RecentEventTitle | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<RecentEventTitle> & { selectionCount?: number };
  if (
    typeof candidate.title !== "string"
    || typeof candidate.lastUsedAt !== "number"
    || typeof candidate.durationMinutes !== "number"
    || typeof candidate.calendarId !== "string"
    || typeof candidate.calendarColor !== "string"
  ) return null;
  return {
    calendarColor: candidate.calendarColor,
    calendarId: candidate.calendarId,
    durationMinutes: candidate.durationMinutes,
    eventId: typeof candidate.eventId === "string" ? candidate.eventId : "",
    lastUsedAt: candidate.lastUsedAt,
    normalizedTitle: normalizeRecentEventTitle(candidate.title),
    title: candidate.title.trim().replace(/\s+/g, " "),
    usageCount: typeof candidate.usageCount === "number"
      ? candidate.usageCount
      : candidate.selectionCount ?? 0,
  };
};

export const parseRecentEventTitles = (value: string | null): RecentEventTitle[] => {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.flatMap((entry) => {
        const recent = parseRecentEventTitle(entry);
        return recent ? [recent] : [];
      })
      : [];
  } catch {
    return [];
  }
};

const durationMinutes = (event: CalendarEvent) => Math.max(
  0,
  Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000),
);

const recentEventTitleFromEvent = (event: CalendarEvent): RecentEventTitle => ({
  calendarColor: event.color || event.calendarColor,
  calendarId: event.calendarId,
  durationMinutes: durationMinutes(event),
  eventId: event.id,
  lastUsedAt: new Date(event.start).getTime(),
  normalizedTitle: normalizeRecentEventTitle(event.title),
  title: event.title.trim().replace(/\s+/g, " "),
  usageCount: 0,
});

export const reconcileRecentEventTitles = (
  current: RecentEventTitle[],
  events: CalendarEvent[],
  now = Date.now(),
) => {
  const pastEvents = events.filter((event) => {
    const normalizedTitle = normalizeRecentEventTitle(event.title);
    return normalizedTitle && new Date(event.end).getTime() <= now;
  });

  const fetchedEventsById = new Map(events.map((event) => [event.id, event]));
  const reconciled: RecentEventTitle[] = [];
  const indexByKey = new Map<string, number>();

  for (const cached of current) {
    const key = recentEventTitleKey(cached.calendarId, cached.normalizedTitle);
    const fetched = cached.eventId ? fetchedEventsById.get(cached.eventId) : undefined;
    if (fetched) {
      const fetchedKey = recentEventTitleKey(
        fetched.calendarId,
        normalizeRecentEventTitle(fetched.title),
      );
      if (fetchedKey !== key) continue;
    }

    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) {
      reconciled[existingIndex].usageCount = Math.max(
        reconciled[existingIndex].usageCount,
        cached.usageCount,
      );
      continue;
    }
    indexByKey.set(key, reconciled.length);
    reconciled.push({ ...cached });
  }

  const newEntries: RecentEventTitle[] = [];
  const newEntryKeys = new Set<string>();
  for (const event of pastEvents) {
    const entry = recentEventTitleFromEvent(event);
    const key = recentEventTitleKey(entry.calendarId, entry.normalizedTitle);
    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) {
      if (!reconciled[existingIndex].eventId) reconciled[existingIndex].eventId = event.id;
      continue;
    }
    if (newEntryKeys.has(key)) continue;
    newEntryKeys.add(key);
    newEntries.unshift(entry);
  }

  return [...newEntries, ...reconciled];
};

export const addRecentEventTitle = (
  current: RecentEventTitle[],
  event: CalendarEvent,
) => {
  const entry = recentEventTitleFromEvent(event);
  if (!entry.normalizedTitle) return current;
  const key = recentEventTitleKey(entry.calendarId, entry.normalizedTitle);
  const duplicate = current.find((candidate) =>
    recentEventTitleKey(candidate.calendarId, candidate.normalizedTitle) === key
  );
  if (duplicate) return current;
  return [entry, ...current.filter((candidate) => candidate.eventId !== entry.eventId)];
};

export const recordRecentEventTitleUse = (
  current: RecentEventTitle[],
  entry: Pick<RecentEventTitle, "calendarId" | "title">,
) => {
  const normalizedTitle = normalizeRecentEventTitle(entry.title);
  if (!normalizedTitle) return current;
  const key = recentEventTitleKey(entry.calendarId, normalizedTitle);
  const existing = current.find((candidate) =>
    recentEventTitleKey(candidate.calendarId, candidate.normalizedTitle) === key
  );
  if (!existing) return current;
  return current.map((candidate) =>
    recentEventTitleKey(candidate.calendarId, candidate.normalizedTitle) === key
      ? { ...candidate, usageCount: candidate.usageCount + 1 }
      : candidate
  );
};

const fuzzyScore = (query: string, title: string) => {
  if (!query) return 0;
  let queryIndex = 0;
  let lastMatchIndex = -1;
  let score = 0;
  for (let index = 0; index < title.length && queryIndex < query.length; index += 1) {
    if (title[index] !== query[queryIndex]) continue;
    score += index === 0 || /[\s-]/.test(title[index - 1]) ? 5 : 1;
    if (lastMatchIndex === index - 1) score += 5;
    lastMatchIndex = index;
    queryIndex += 1;
  }
  return queryIndex === query.length ? score : -1;
};

export const searchRecentEventTitles = (
  entries: RecentEventTitle[],
  query: string,
  options: {
    excludeCalendarId?: string;
    excludeTitle?: string;
    limit?: number;
  } = {},
) => {
  const normalizedQuery = normalizeRecentEventTitle(query);
  const excluded = normalizeRecentEventTitle(options.excludeTitle ?? "");
  const candidates = entries.filter((entry) => !(
    excluded
    && entry.normalizedTitle === excluded
    && (!options.excludeCalendarId || entry.calendarId === options.excludeCalendarId)
  ));
  if (!normalizedQuery) {
    return [...candidates]
      .sort((first, second) => second.usageCount - first.usageCount)
      .slice(0, options.limit ?? 5);
  }
  return candidates
    .flatMap((entry) => {
      const matchScore = fuzzyScore(normalizedQuery, entry.normalizedTitle);
      if (matchScore < 0) return [];
      return [{ entry, score: matchScore }];
    })
    .sort((first, second) =>
      second.score - first.score || second.entry.usageCount - first.entry.usageCount
    )
    .slice(0, options.limit ?? 5)
    .map(({ entry }) => entry);
};

export const recentEventPreviewDurationMinutes = ({
  allDay,
  currentDurationMinutes,
  recentDurationMinutes,
}: {
  allDay: boolean;
  currentDurationMinutes: number;
  recentDurationMinutes: number;
}) => {
  if (allDay) {
    return recentDurationMinutes >= 24 * 60
      ? Math.max(24 * 60, Math.round(recentDurationMinutes / (24 * 60)) * 24 * 60)
      : currentDurationMinutes;
  }
  return recentDurationMinutes > 0 && recentDurationMinutes < 24 * 60
    ? recentDurationMinutes
    : currentDurationMinutes;
};

export const recentEventEditDurationMinutes = ({
  pendingCreation,
  ...durations
}: Parameters<typeof recentEventPreviewDurationMinutes>[0] & {
  pendingCreation: boolean;
}) => pendingCreation
  ? recentEventPreviewDurationMinutes(durations)
  : durations.currentDurationMinutes;

export const applyRecentEventTitleSelection = ({
  calendar,
  current,
  pendingCreation,
  recent,
}: {
  calendar?: CalendarSource;
  current: CalendarEvent;
  pendingCreation: boolean;
  recent: RecentEventTitle;
}): CalendarEvent => {
  const start = new Date(current.start);
  const currentDurationMinutes = Math.max(
    0,
    Math.round((new Date(current.end).getTime() - start.getTime()) / 60_000),
  );
  const nextDurationMinutes = recentEventEditDurationMinutes({
    allDay: current.allDay === true,
    currentDurationMinutes,
    pendingCreation,
    recentDurationMinutes: recent.durationMinutes,
  });

  return {
    ...current,
    title: recent.title,
    ...(calendar ? {
      calendarId: calendar.id,
      calendarColor: calendar.backgroundColor,
      color: current.colorId ? current.color : calendar.backgroundColor,
      textColor: current.colorId ? current.textColor : calendar.foregroundColor,
    } : {}),
    end: pendingCreation
      ? new Date(start.getTime() + nextDurationMinutes * 60_000).toISOString()
      : current.end,
  };
};

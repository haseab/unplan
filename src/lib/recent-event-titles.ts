import type { CalendarEvent } from "./calendar-types";

export type RecentEventTitle = {
  calendarColor: string;
  calendarId: string;
  durationMinutes: number;
  historyCount: number;
  lastUsedAt: number;
  normalizedTitle: string;
  selectionCount: number;
  title: string;
};

const MAX_RECENT_EVENT_TITLES = 250;

export const normalizeRecentEventTitle = (title: string) =>
  title.trim().replace(/\s+/g, " ").toLocaleLowerCase();

const isRecentEventTitle = (value: unknown): value is RecentEventTitle => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RecentEventTitle>;
  return typeof candidate.title === "string"
    && typeof candidate.normalizedTitle === "string"
    && typeof candidate.lastUsedAt === "number"
    && typeof candidate.historyCount === "number"
    && typeof candidate.selectionCount === "number"
    && typeof candidate.durationMinutes === "number"
    && typeof candidate.calendarId === "string"
    && typeof candidate.calendarColor === "string";
};

export const parseRecentEventTitles = (value: string | null): RecentEventTitle[] => {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isRecentEventTitle) : [];
  } catch {
    return [];
  }
};

const durationMinutes = (event: CalendarEvent) => Math.max(
  0,
  Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000),
);

const sortedAndLimited = (entries: RecentEventTitle[]) => [...entries]
  .sort((first, second) => second.lastUsedAt - first.lastUsedAt)
  .slice(0, MAX_RECENT_EVENT_TITLES);

export const reconcileRecentEventTitles = (
  current: RecentEventTitle[],
  events: CalendarEvent[],
  mode: "history-snapshot" | "observed" = "observed",
  now = Date.now(),
) => {
  const pastEvents = events.filter((event) => {
    const normalizedTitle = normalizeRecentEventTitle(event.title);
    return normalizedTitle && new Date(event.end).getTime() <= now;
  });
  if (!pastEvents.length) return current;

  const grouped = new Map<string, CalendarEvent[]>();
  pastEvents.forEach((event) => {
    const normalizedTitle = normalizeRecentEventTitle(event.title);
    const group = grouped.get(normalizedTitle) ?? [];
    group.push(event);
    grouped.set(normalizedTitle, group);
  });

  const byTitle = new Map(current.map((entry) => [entry.normalizedTitle, entry]));
  grouped.forEach((group, normalizedTitle) => {
    const latest = [...group].sort(
      (first, second) => new Date(second.start).getTime() - new Date(first.start).getTime(),
    )[0];
    const existing = byTitle.get(normalizedTitle);
    byTitle.set(normalizedTitle, {
      calendarColor: latest.color || latest.calendarColor,
      calendarId: latest.calendarId,
      durationMinutes: durationMinutes(latest),
      historyCount: mode === "history-snapshot"
        ? group.length
        : Math.max(existing?.historyCount ?? 0, group.length),
      lastUsedAt: Math.max(existing?.lastUsedAt ?? 0, new Date(latest.start).getTime()),
      normalizedTitle,
      selectionCount: existing?.selectionCount ?? 0,
      title: latest.title.trim().replace(/\s+/g, " "),
    });
  });

  return sortedAndLimited([...byTitle.values()]);
};

export const recordRecentEventTitleUse = (
  current: RecentEventTitle[],
  entry: Pick<RecentEventTitle, "calendarColor" | "calendarId" | "durationMinutes" | "title">,
  usedAt = Date.now(),
) => {
  const normalizedTitle = normalizeRecentEventTitle(entry.title);
  if (!normalizedTitle) return current;
  const existing = current.find((candidate) => candidate.normalizedTitle === normalizedTitle);
  const next: RecentEventTitle = {
    ...entry,
    normalizedTitle,
    historyCount: existing?.historyCount ?? 0,
    lastUsedAt: usedAt,
    selectionCount: (existing?.selectionCount ?? 0) + 1,
    title: entry.title.trim().replace(/\s+/g, " "),
  };
  return sortedAndLimited([
    next,
    ...current.filter((candidate) => candidate.normalizedTitle !== normalizedTitle),
  ]);
};

const fuzzyScore = (query: string, title: string) => {
  if (!query) return 0;
  let queryIndex = 0;
  let lastMatchIndex = -2;
  let score = 0;
  for (let index = 0; index < title.length && queryIndex < query.length; index += 1) {
    if (title[index] !== query[queryIndex]) continue;
    score += index === 0 || /[\s\-_/]/.test(title[index - 1]) ? 8 : 2;
    if (lastMatchIndex === index - 1) score += 6;
    lastMatchIndex = index;
    queryIndex += 1;
  }
  return queryIndex === query.length ? score : -1;
};

export const searchRecentEventTitles = (
  entries: RecentEventTitle[],
  query: string,
  options: { excludeTitle?: string; limit?: number; now?: number } = {},
) => {
  const normalizedQuery = normalizeRecentEventTitle(query);
  const excluded = normalizeRecentEventTitle(options.excludeTitle ?? "");
  const now = options.now ?? Date.now();
  return entries
    .flatMap((entry) => {
      if (excluded && entry.normalizedTitle === excluded) return [];
      const matchScore = normalizedQuery
        ? fuzzyScore(normalizedQuery, entry.normalizedTitle)
        : 0;
      if (matchScore < 0) return [];
      const ageDays = Math.max(0, (now - entry.lastUsedAt) / 86_400_000);
      const recencyScore = Math.max(0, 30 - Math.log2(ageDays + 1) * 7);
      const frequencyScore = Math.log2(entry.historyCount + 1) * 8;
      const selectionScore = entry.selectionCount * 18;
      const prefixScore = normalizedQuery && entry.normalizedTitle.startsWith(normalizedQuery)
        ? 60
        : 0;
      return [{ entry, score: matchScore + prefixScore + recencyScore + frequencyScore + selectionScore }];
    })
    .sort((first, second) => second.score - first.score || second.entry.lastUsedAt - first.entry.lastUsedAt)
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

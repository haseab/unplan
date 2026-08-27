"use client";

import type { CalendarEvent, CalendarSource } from "./calendar-types";
import {
  expireGoogleAccount,
  googleAuthorizedFetch,
  readGoogleAccounts,
  type BrowserGoogleAccount,
  type GoogleConnectedAccount,
} from "./google-browser-auth";
import { readJsonResponse } from "./http-client";
import { parseGoogleCalendarSourceId } from "./google-source-id";

const googleAccountIdForSource = (sourceId: string) =>
  parseGoogleCalendarSourceId(sourceId)?.accountId ?? null;

export const reconcileImportedGoogleCalendars = (
  current: CalendarSource[],
  imported: CalendarSource[],
  failedAccountIds: ReadonlySet<string>,
) => {
  const importedIds = new Set(imported.map((calendar) => calendar.id));
  const retained = current.filter((calendar) =>
    calendar.provider === "google"
    && Boolean(calendar.accountId && failedAccountIds.has(calendar.accountId))
    && !importedIds.has(calendar.id),
  );
  return [...imported, ...retained];
};

export const reconcileImportedGoogleVisibility = (
  current: ReadonlySet<string>,
  imported: CalendarSource[],
  failedAccountIds: ReadonlySet<string>,
) => new Set([
  ...imported.filter((calendar) => calendar.selected).map((calendar) => calendar.id),
  ...[...current].filter((sourceId) => {
    const accountId = googleAccountIdForSource(sourceId);
    return Boolean(accountId && failedAccountIds.has(accountId));
  }),
]);

export const retainEventsForFailedGoogleAccounts = (
  current: CalendarEvent[],
  failedAccountIds: ReadonlySet<string>,
) => current.filter((event) => {
  const accountId = googleAccountIdForSource(event.calendarId);
  return Boolean(accountId && failedAccountIds.has(accountId));
});

export const mergeGoogleEventsAfterPartialSync = (
  current: CalendarEvent[],
  loaded: CalendarEvent[],
  failedAccountIds: ReadonlySet<string>,
) => {
  if (!failedAccountIds.size) return loaded;
  const loadedIds = new Set(loaded.map((event) => event.id));
  return [
    ...loaded,
    ...retainEventsForFailedGoogleAccounts(current, failedAccountIds).filter(
      (event) => !loadedIds.has(event.id),
    ),
  ];
};

export const browserGoogleStatus = () => {
  const stored = readGoogleAccounts();
  const accounts: GoogleConnectedAccount[] = stored.map((account) => ({
    email: account.email,
    id: account.id,
    provider: "google",
    status: account.expiresAt > Date.now() + 30_000 || account.refreshToken
      ? "active"
      : "expired",
  }));
  return {
    accounts,
    configured: Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim()),
    connected: accounts.some((account) => account.status === "active"),
  };
};

type CalendarsResponse = {
  calendars?: CalendarSource[];
  error?: string | { message?: string };
};

const messageFromError = (error: CalendarsResponse["error"], fallback: string) =>
  typeof error === "string" ? error : error?.message ?? fallback;

export const loadBrowserGoogleCalendars = async (
  accounts: BrowserGoogleAccount[] = readGoogleAccounts(),
) => {
  const active = accounts.filter((account) =>
    account.expiresAt > Date.now() + 30_000 || Boolean(account.refreshToken),
  );
  const results = await Promise.allSettled(active.map(async (account) => {
    const params = new URLSearchParams({ accountId: account.id });
    const response = await googleAuthorizedFetch(
      account.id,
      `/api/google/calendars?${params}`,
    );
    const data = await readJsonResponse<CalendarsResponse>(
      response,
      "Could not import Google calendars",
    );
    if (!response.ok) {
      if (response.status === 401) expireGoogleAccount(account.id);
      throw new Error(messageFromError(data.error, "Could not import Google calendars"));
    }
    return {
      account,
      calendars: (data.calendars ?? []).map((calendar) => ({
        ...calendar,
        accountEmail: account.email,
      })),
    };
  }));
  return {
    calendars: results.flatMap((result) => result.status === "fulfilled"
      ? result.value.calendars
      : []),
    errors: results.flatMap((result, index) => result.status === "rejected"
      ? [{
          accountId: active[index].id,
          message: result.reason instanceof Error ? result.reason.message : "Could not import calendars",
        }]
      : []),
  };
};

type EventsResponse = {
  error?: string;
  errors?: Array<{ accountId: string; message: string; sourceId: string }>;
  events?: CalendarEvent[];
};

export const loadBrowserGoogleEvents = async ({
  calendars,
  search,
  searchStrategy,
  signal,
  timeMax,
  timeMin,
}: {
  calendars: CalendarSource[];
  search?: string;
  searchStrategy?: "broad" | "exact";
  signal?: AbortSignal;
  timeMax: string;
  timeMin?: string;
}) => {
  const byAccount = new Map<string, CalendarSource[]>();
  calendars.forEach((calendar) => {
    const source = parseGoogleCalendarSourceId(calendar.id);
    if (!source) return;
    const group = byAccount.get(source.accountId) ?? [];
    group.push(calendar);
    byAccount.set(source.accountId, group);
  });

  const results = await Promise.allSettled([...byAccount].map(async ([accountId, sources]) => {
    const params = new URLSearchParams({ timeMax });
    if (timeMin) params.set("timeMin", timeMin);
    if (search) params.set("search", search);
    if (searchStrategy) params.set("searchStrategy", searchStrategy);
    sources.forEach((calendar) => {
      params.append("sourceId", calendar.id);
      params.append("color", calendar.backgroundColor);
    });
    const response = await googleAuthorizedFetch(
      accountId,
      `/api/google/events?${params}`,
      { signal },
    );
    const data = await readJsonResponse<EventsResponse>(response, "Could not load events");
    if (!response.ok) {
      if (response.status === 401) expireGoogleAccount(accountId);
      throw new Error(data.error || "Could not load events");
    }
    return { accountId, data };
  }));

  return {
    events: results.flatMap((result) => result.status === "fulfilled"
      ? result.value.data.events ?? []
      : []),
    errors: results.flatMap((result, index) => {
      const accountId = [...byAccount.keys()][index];
      if (result.status === "rejected") {
        return [{
          accountId,
          message: result.reason instanceof Error ? result.reason.message : "Event import failed",
          sourceId: "",
        }];
      }
      return result.value.data.errors ?? [];
    }),
  };
};

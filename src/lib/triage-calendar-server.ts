import "server-only";
import { createHash } from "node:crypto";
import { attentionCalendarTargets } from "./attention-calendar-targets";
import { serverGoogleAccessToken } from "./google-auth-server";
import { createGoogleCalendarSourceId } from "./google-source-id";
import { latestQuarterHour, nextAvailableEventStart } from "./calendar-utils";
import { calendarEventDetailsFromTodoistContent } from "./todoist-calendar";
import type { CalendarEvent, CalendarSource } from "./calendar-types";
import type { TodoistTask } from "./todoist";
import { TriageError } from "./triage-contract";

type Calendar = { id: string; summary?: string; backgroundColor?: string; foregroundColor?: string; primary?: boolean; selected?: boolean; deleted?: boolean; accessRole?: string };
type Event = { id: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; status?: string };
type Providers = {
  targets: typeof attentionCalendarTargets;
  accessToken: typeof serverGoogleAccessToken;
  fetch: typeof fetch;
};
export function createTriageCalendar(signal: AbortSignal, providers: Providers = { targets: attentionCalendarTargets, accessToken: serverGoogleAccessToken, fetch }) {
  let targetPromise: ReturnType<typeof attentionCalendarTargets> | undefined;
  const targets = () => targetPromise ??= providers.targets();
  async function google(accountId: string, path: string, init: RequestInit = {}) {
    const account = (await targets()).find((a) => a.id === accountId);
    if (!account) throw new TriageError("Calendar account is unavailable", 403);
    let token = await providers.accessToken(account.ownerId, account.id);
    const send = () => providers.fetch(`https://www.googleapis.com/calendar/v3${path}`, { ...init,
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
      cache: "no-store", redirect: "error", signal,
    });
    let response = await send();
    if (response.status === 401) { await response.body?.cancel(); token = await providers.accessToken(account.ownerId, account.id, token); response = await send(); }
    return response;
  }
  async function pages<T>(accountId: string, path: string, query: Record<string, string>): Promise<T[]> {
    const items: T[] = []; let cursor: string | undefined;
    for (let i = 0; i < 20; i++) {
      const params = new URLSearchParams({ ...query, ...(cursor ? { pageToken: cursor } : {}) });
      const response = await google(accountId, `${path}?${params}`);
      if (!response.ok) throw new TriageError("Google Calendar is unavailable; reconnect in Unplan", 503);
      const data = await response.json() as { items?: T[]; nextPageToken?: string };
      items.push(...(data.items ?? [])); cursor = data.nextPageToken;
      if (!cursor) return items;
    }
    throw new TriageError("Calendar results exceeded the safe limit", 503);
  }
  async function calendars(): Promise<CalendarSource[]> {
    const lists = await Promise.all((await targets()).map(async (account) => (await pages<Calendar>(account.id, "/users/me/calendarList", { maxResults: "250" }))
      .filter((c) => !c.deleted).map((c): CalendarSource => ({
        id: createGoogleCalendarSourceId(account.id, c.id), accountId: account.id, accountEmail: account.email,
        providerCalendarId: c.id, provider: "google", name: c.summary ?? c.id,
        backgroundColor: c.backgroundColor ?? "#4666e5", foregroundColor: c.foregroundColor ?? "#ffffff",
        primary: !!c.primary, selected: c.selected ?? !!c.primary, writable: c.accessRole === "owner" || c.accessRole === "writer",
      }))));
    return lists.flat();
  }
  async function schedule(task: TodoistTask, calendar: CalendarSource) {
    if (!calendar.writable || !calendar.accountId || !calendar.providerCalendarId) throw new TriageError("A writable calendar is required");
    // Deterministic provider ID makes a retry after a lost response safe: one event per task.
    const id = createHash("sha256").update(`unplan-triage:${task.id}`).digest("hex");
    const path = `/calendars/${encodeURIComponent(calendar.providerCalendarId)}/events`;
    const existing = await google(calendar.accountId, `${path}/${id}`);
    if (existing.ok) {
      const event = await existing.json() as { extendedProperties?: { private?: { unplanTaskId?: string } }; status?: string };
      if (event.status !== "cancelled" && event.extendedProperties?.private?.unplanTaskId === task.id) return;
      throw new TriageError("The earlier scheduled event was removed. Review this task in Unplan.", 409);
    }
    if (existing.status !== 404) throw new TriageError("Could not verify the calendar event", 503);
    const now = new Date(), details = calendarEventDetailsFromTodoistContent(task.content);
    const duration = details.durationMinutes ?? 30;
    const sources = (await calendars()).filter((c) => c.selected || c.id === calendar.id);
    if (sources.length > 32) throw new TriageError("Too many calendars to check safely", 503);
    const occupied = (await Promise.all(sources.map(async (source) => {
      const events = await pages<Event>(source.accountId!, `/calendars/${encodeURIComponent(source.providerCalendarId!)}/events`, {
        timeMin: latestQuarterHour(now).toISOString(), timeMax: new Date(now.getTime() + 30 * 86400000).toISOString(), singleEvents: "true", maxResults: "250",
      });
      return events.filter((e) => e.status !== "cancelled" && e.start?.dateTime && e.end?.dateTime).map((e) => ({ start: e.start!.dateTime!, end: e.end!.dateTime!, allDay: false } as CalendarEvent));
    }))).flat();
    const start = nextAvailableEventStart(occupied, latestQuarterHour(now), duration);
    if (start.getTime() + duration * 60000 > now.getTime() + 30 * 86400000) throw new TriageError("No available slot in the next 30 days");
    const response = await google(calendar.accountId, path, { method: "POST", body: JSON.stringify({
      id, summary: details.title || task.content, description: task.description,
      start: { dateTime: start.toISOString() }, end: { dateTime: new Date(start.getTime() + duration * 60000).toISOString() },
      extendedProperties: { private: { unplanTaskId: task.id } },
    }) });
    if (response.status === 409) {
      const check = await google(calendar.accountId, `${path}/${id}`);
      if (check.ok && ((await check.json()) as { extendedProperties?: { private?: { unplanTaskId?: string } } }).extendedProperties?.private?.unplanTaskId === task.id) return;
    }
    if (!response.ok) throw new TriageError("Could not create the calendar event; task remains open", 503);
  }
  return { calendars, schedule };
}

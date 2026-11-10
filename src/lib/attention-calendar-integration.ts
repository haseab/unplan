import { currentActivity } from "@/lib/current-activity";
import { calendarWhitespace, type CalendarOccupancyEvent } from "@/lib/calendar-whitespace";
import { createHash, timingSafeEqual } from "node:crypto";
import { attentionCalendarTargets } from "./attention-calendar-targets";
import { serverGoogleAccessToken } from "@/lib/google-auth-server";
import { attentionMeeting, type MeetingEvent } from "@/lib/attention-next-meeting";
import { AttentionAccountSelectionError } from "@/lib/attention-calendar-accounts";

const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});
type Meeting = NonNullable<ReturnType<typeof attentionMeeting>>;
const caches = new Map<string, { owner: string; at: number; body: unknown }>();

export async function integrationCalendar(request: Request, mode: "meeting" | "whitespace" | "current") {
  const expected = process.env.ATTENTION_API_KEY;
  const whitespaceAccount = mode === "whitespace" ? (process.env.ATTENTION_WHITESPACE_ACCOUNT_EMAIL ?? process.env.ATTENTION_WHITESPACE_CALENDAR_ID)?.trim().toLowerCase() : undefined;
  if (mode === "whitespace" && !whitespaceAccount) return json({ error: "Whitespace account is not configured" }, 503);
  const owner = mode === "whitespace" ? undefined : process.env.ATTENTION_GOOGLE_OWNER_ID;
  const email = process.env.ATTENTION_GOOGLE_EMAIL;
  const emails = whitespaceAccount ? [whitespaceAccount] : [...new Set((process.env.ATTENTION_GOOGLE_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();
  if (!expected || expected.length < 32 || (!owner && !email && !emails.length)) return json({ error: "Integration is not configured" }, 503);
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${expected}`))) return json({ error: "Unauthorized" }, 401);
  const identity = JSON.stringify({ owner, email, emails, whitespaceAccount });
  const cache = caches.get(mode);
  if (cache?.owner === identity && Date.now() - cache.at < 30_000) return json(cache.body);
  try {
    const targets = await attentionCalendarTargets(whitespaceAccount);
    const now = Date.now();
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]);
    const meetings: Meeting[] = [];
    const events: CalendarOccupancyEvent[] = [];
    const start = now - 7 * 86400_000;
    // Google ignores milliseconds in timeMin/timeMax. Fetch a real window, then
    // currentActivity applies the exact start <= now < end check locally.
    const rangeStart = mode === "whitespace" ? start : mode === "current" ? now - 60_000 : now;
    const rangeEnd = mode === "whitespace" ? now : mode === "current" ? now + 60_000 : now + 30 * 86400_000;
    let calendarCount = 0;
    for (const account of targets) {
      let token = await serverGoogleAccessToken(account.ownerId, account.id);
      async function google(path: string) {
        const send = () => fetch(`https://www.googleapis.com/calendar/v3${path}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", redirect: "error", signal,
        });
        let response = await send();
        if (response.status === 401) {
          await response.body?.cancel();
          token = await serverGoogleAccessToken(account.ownerId, account.id, token);
          response = await send();
        }
        if (!response.ok) throw new Error("Google Calendar unavailable");
        return response;
      }
      const calendars: string[] = [];
      let calendarPage: string | undefined;
      for (let page = 0; page < 10; page++) {
        const query = new URLSearchParams({ maxResults: "250", fields: "items(id,selected,primary,deleted),nextPageToken" });
        if (calendarPage) query.set("pageToken", calendarPage);
        const data = await (await google(`/users/me/calendarList?${query}`)).json() as { items?: Array<{ id: string; selected?: boolean; primary?: boolean; deleted?: boolean }>; nextPageToken?: string };
        for (const calendar of data.items ?? []) {
          if (!calendar.deleted && (mode === "whitespace" || (calendar.selected ?? calendar.primary))) calendars.push(calendar.id);
        }
        calendarPage = data.nextPageToken;
        if (!calendarPage) break;
      }
      if (calendarPage || calendars.length > 32) throw new Error("Calendar limit reached");
      calendarCount += calendars.length;
      let nextIndex = 0;
      await Promise.all(Array.from({ length: Math.min(4, calendars.length) }, async () => {
        while (nextIndex < calendars.length) {
          const calendar = calendars[nextIndex++];
          let eventPage: string | undefined;
          for (let page = 0; page < 20; page++) {
            const query = new URLSearchParams({
              timeMin: new Date(rangeStart).toISOString(), timeMax: new Date(rangeEnd).toISOString(),
              singleEvents: "true", orderBy: "startTime", showDeleted: "false", maxResults: "100",
              fields: "items(summary,status,eventType,start,end,hangoutLink,htmlLink,description,location,conferenceData,attendees(self,responseStatus)),nextPageToken",
            });
            if (eventPage) query.set("pageToken", eventPage);
            const data = await (await google(`/calendars/${encodeURIComponent(calendar)}/events?${query}`)).json() as { items?: MeetingEvent[]; nextPageToken?: string };
            if (mode !== "meeting") events.push(...(data.items ?? []));
            const first = (data.items ?? []).map((event) => attentionMeeting(event, now)).find((meeting) => meeting !== null);
            if (mode === "meeting" && first) { meetings.push(first); eventPage = undefined; break; }
            eventPage = data.nextPageToken;
            if (!eventPage) break;
          }
          if (eventPage) throw new Error("Event limit reached");
        }
      }));
    }
    const meeting = meetings.sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0] ?? null;
    if (mode !== "meeting" && calendarCount === 0) throw new Error("No calendars available");
    const body = mode === "meeting" ? { meeting } : mode === "current"
      ? currentActivity(events, now) : {
        calendarId: whitespaceAccount, // Legacy field; this identifies the account, not one calendar.
        accountEmail: whitespaceAccount,
        calendarCount,
        weekly: calendarWhitespace(events, start, now),
        recent: calendarWhitespace(events, now - 86400_000, now),
      };
    caches.set(mode, { owner: identity, at: Date.now(), body });
    return json(body);
  } catch (error) {
    const code = error instanceof AttentionAccountSelectionError ? error.code : "calendar_unavailable";
    console.warn("[ATTENTION:CALENDAR] Read unavailable", { code });
    return json({ error: "Google Calendar connection is unavailable; check Unplan", errorCode: code }, 503);
  }
}

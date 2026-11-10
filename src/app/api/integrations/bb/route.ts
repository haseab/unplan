import { attentionCalendarTargets } from "@/lib/attention-calendar-targets";
import { listStoredGoogleAccounts } from "@/lib/google-account-store";
import { selectBbApiAccount } from "@/lib/bb-api-policy";
import { invalidateTriageCounts } from "@/lib/triage-revision";
import { NextRequest } from "next/server";
import * as accounts from "@/app/api/google/accounts/route";
import * as calendars from "@/app/api/google/calendars/route";
import * as events from "@/app/api/google/events/route";
import * as conference from "@/app/api/google/events/conference/route";
import * as description from "@/app/api/google/events/description/route";
import * as destinations from "@/app/api/todoist/destinations/route";
import * as tasks from "@/app/api/todoist/tasks/route";
import * as localTasks from "@/app/api/todoist/local-tasks/route";
import * as refreshSettings from "@/app/api/task-refresh/settings/route";
import { bbApiAuthorized, parseBbApiInput } from "@/lib/bb-api-policy";
import { withBbApiOwner } from "@/lib/bb-api-context";
import { enforceRateLimit } from "@/lib/request-rate-limit";
import { TODOIST_TOKEN_HEADER } from "@/lib/todoist";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Handler = (request: NextRequest) => Promise<Response>;
const routes: Record<string, Record<string, Handler>> = {
  "/api/google/accounts": { GET: accounts.GET, DELETE: accounts.DELETE },
  "/api/google/calendars": { GET: calendars.GET, PATCH: calendars.PATCH },
  "/api/google/events": { GET: events.GET, POST: events.POST, PATCH: events.PATCH, DELETE: events.DELETE },
  "/api/google/events/conference": { GET: conference.GET, POST: conference.POST },
  "/api/google/events/description": { POST: description.POST },
  "/api/todoist/destinations": { GET: destinations.GET, POST: destinations.POST },
  "/api/todoist/tasks": { GET: tasks.GET, POST: tasks.POST },
  "/api/todoist/local-tasks": { POST: localTasks.POST },
  "/api/task-refresh/settings": { GET: refreshSettings.GET, PUT: refreshSettings.PUT },
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: NextRequest) {
  // This key grants the same writes as the website. Never accept ATTENTION_API_KEY,
  // which belongs to the separate Sidebar integration. Owners are resolved only on the server.
  if (!process.env.BB_API_KEY || process.env.BB_API_KEY.length < 32 || process.env.BB_API_KEY === process.env.ATTENTION_API_KEY) {
    return json({ error: "The BB API connection is not configured" }, 503);
  }
  if (!bbApiAuthorized(request.headers.get("authorization"), process.env.BB_API_KEY)) return json({ error: "Unauthorized" }, 401);
  const limited = await enforceRateLimit(request, { scope: "bb-api", limit: 600, windowMs: 60_000 });
  if (limited) return limited;
  if (Number(request.headers.get("content-length")) > 2_100_000) return json({ error: "Request too large" }, 413);
  const input = parseBbApiInput(await request.json().catch(() => null));
  if (!input) return json({ error: "Invalid BB API request" }, 400);
  const path = new URL(input.path, request.url);
  const handler = routes[path.pathname]?.[input.method];
  if (!handler) return json({ error: "Unsupported BB API request" }, 400);
  // Use the already configured integration accounts unless an explicit owner
  // is supplied. Never select ownership from browser input.
  const explicitOwner = process.env.BB_GOOGLE_OWNER_ID?.trim();
  let owner: string | undefined;
  if (path.pathname.startsWith("/api/google/")) {
    try {
      const accounts = explicitOwner
        ? (await listStoredGoogleAccounts(explicitOwner)).map(account => ({ ...account, ownerId: explicitOwner }))
        : await attentionCalendarTargets();
      if (path.pathname === "/api/google/accounts" && input.method === "GET") {
        return json({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ accounts: accounts.map(({id,email,status}) => ({id,email,status})) }) });
      }
      const account = selectBbApiAccount(accounts, input.headers["x-unplan-google-account"] || path.searchParams.get("accountId"));
      if (!account) return json({ status: 403, headers: {}, body: JSON.stringify({ error: "This Google account is not configured for BB" }) });
      owner = account.ownerId;
    } catch {
      return json({ status: 503, headers: {}, body: JSON.stringify({ error: "Reconnect the integration's Google accounts in Unplan" }) });
    }
  }
  const headers = new Headers(input.headers);
  headers.set("origin", new URL(process.env.APP_ORIGIN || request.url).origin);
  headers.set("x-requested-with", "XmlHttpRequest");
  // Use the server's existing Todoist integration. Browser input cannot select
  // another credential, owner, URL, or handler.
  if (path.pathname.startsWith("/api/todoist/") || path.pathname === "/api/task-refresh/settings") {
    const token = process.env.TODOIST_API_KEY?.trim();
    if (!token) return json({ status: 503, headers: {}, body: JSON.stringify({ error: "Connect Todoist in Unplan" }) });
    headers.set(TODOIST_TOKEN_HEADER, token);
  }
  const forwarded = new NextRequest(path, { method: input.method, headers, body: input.body, signal: request.signal });
  try {
    const response = await (owner ? withBbApiOwner(owner, () => handler(forwarded)) : handler(forwarded));
    if (response.ok && input.method !== "GET") invalidateTriageCounts();
    const responseHeaders: Record<string, string> = {};
    for (const name of ["content-type", "retry-after", "x-unplan-event-moved"]) {
      const value = response.headers.get(name); if (value) responseHeaders[name] = value;
    }
    return json({ status: response.status, headers: responseHeaders, body: await response.text() });
  } catch {
    console.warn("[BB:API] Provider request failed", { path: path.pathname, method: input.method });
    return json({ status: 502, headers: {}, body: JSON.stringify({ error: "Unplan is temporarily unavailable" }) });
  }
}

import { createHash } from "node:crypto";

type Snapshot = { body: string; status: number; statusText: string; headers: [string, string][] };
type ReadEntry = { value: Promise<Snapshot>; expiresAt: number };
type Account = { reads: Map<string, ReadEntry>; blockedUntil: number };
const API_URL = "https://api.todoist.com/api/v1";
const READ_CACHE_MS = 60_000;
const FALLBACK_COOLDOWN_MS = 60_000;

export function todoistRetryAfterMs(value: string | null, now = Date.now()) {
  if (!value?.trim()) return FALLBACK_COOLDOWN_MS;
  const seconds = Number(value);
  const duration = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(value) - now;
  return Number.isFinite(duration) && duration > 0 ? Math.ceil(duration) : FALLBACK_COOLDOWN_MS;
}

/** One provider boundary for browser imports, settings, counters, and cron.
 * List pages share a bounded 60-second cache; individual task reads stay fresh
 * for the cron's read-before-write check. Writes invalidate before and after.
 */
export class TodoistRequestCoordinator {
  private accounts = new Map<string, Account>();

  constructor(private fetcher: typeof fetch = fetch, private now = Date.now) {}

  private account(token: string) {
    const key = createHash("sha256").update(token).digest("hex");
    let account = this.accounts.get(key);
    if (!account) {
      if (this.accounts.size >= 100) this.accounts.delete(this.accounts.keys().next().value!);
      account = { reads: new Map(), blockedUntil: 0 };
    }
    this.accounts.delete(key);
    this.accounts.set(key, account);
    return account;
  }

  async request(token: string, path: string, init: RequestInit = {}): Promise<Response> {
    init.signal?.throwIfAborted();
    const account = this.account(token);
    const method = (init.method ?? "GET").toUpperCase();
    const url = new URL(API_URL + path);
    url.searchParams.sort();
    const cacheable = method === "GET" && ["/api/v1/tasks", "/api/v1/projects", "/api/v1/sections"].includes(url.pathname);
    const key = url.href;
    const cached = cacheable ? account.reads.get(key) : undefined;
    if (cached && cached.expiresAt > this.now()) return this.readResponse(cached.value, init.signal);
    if (account.blockedUntil > this.now()) {
      return Response.json({ error: "Todoist is cooling down after a rate limit" }, {
        status: 429, headers: { "Retry-After": String(Math.ceil((account.blockedUntil - this.now()) / 1_000)) },
      });
    }
    const send = async () => {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${token}`);
      if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
      const response = await this.fetcher(url.href, {
        ...init, method, headers, cache: "no-store",
        // A canceled browser import must not cancel a read shared with cron or another tab.
        signal: method === "GET" ? AbortSignal.timeout(20_000) : init.signal,
      });
      if (response.status !== 429) return response;
      const delay = todoistRetryAfterMs(response.headers.get("retry-after"), this.now());
      account.blockedUntil = Math.max(account.blockedUntil, this.now() + delay);
      console.warn("[BUG:TODOIST-RATE-LIMIT]", "Provider cooldown started", { retryAfterMs: delay });
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("Retry-After", String(Math.ceil(delay / 1_000)));
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
    };
    if (method !== "GET") {
      account.reads.clear();
      try { return await send(); }
      finally { account.reads.clear(); }
    }
    if (!cacheable) return send();
    const entry: ReadEntry = {
      expiresAt: Infinity,
      value: send().then(async (response) => {
        const snapshot: Snapshot = {
          body: await response.text(), status: response.status, statusText: response.statusText,
          headers: [...response.headers.entries()],
        };
        if (response.ok) entry.expiresAt = this.now() + READ_CACHE_MS;
        else if (account.reads.get(key) === entry) account.reads.delete(key);
        return snapshot;
      }).catch((error: unknown) => {
        if (account.reads.get(key) === entry) account.reads.delete(key);
        throw error;
      }),
    };
    // Evict completed entries first; normal accounts have only a few list pages.
    if (account.reads.size >= 128) {
      for (const [oldKey, oldEntry] of account.reads) {
        if (oldEntry.expiresAt !== Infinity) { account.reads.delete(oldKey); break; }
      }
    }
    if (account.reads.size < 128) account.reads.set(key, entry);
    return this.readResponse(entry.value, init.signal);
  }

  private async readResponse(value: Promise<Snapshot>, signal?: AbortSignal | null) {
    let abort: (() => void) | undefined;
    try {
      const snapshot = await (signal ? Promise.race([
        value,
        new Promise<never>((_, reject) => {
          abort = () => reject(signal.reason);
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) abort();
        }),
      ]) : value);
      return new Response(snapshot.body || null, { status: snapshot.status, statusText: snapshot.statusText, headers: snapshot.headers });
    } finally {
      if (signal && abort) signal.removeEventListener("abort", abort);
    }
  }
}

export function todoistErrorResponse(error: Error & { status?: number; retryAfterMs?: number }) {
  return Response.json({ error: error.message }, {
    status: error.status ?? 502,
    ...(error.retryAfterMs ? { headers: { "Retry-After": String(Math.ceil(error.retryAfterMs / 1_000)) } } : {}),
  });
}

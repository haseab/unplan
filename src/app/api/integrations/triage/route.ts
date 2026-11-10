import { invalidateTriageCounts } from "@/lib/triage-revision";
import { enforceRateLimit } from "@/lib/request-rate-limit";
import { readTaskRefreshState, saveTaskRefreshSettings, secretMatches } from "@/lib/task-refresh-server";
import { readTodoistProviderResponse, todoistTokenFetch } from "@/lib/todoist-server";
import { createTriageService } from "@/lib/triage-service";
import { createTriageCalendar } from "@/lib/triage-calendar-server";
import { parseTriageAction, TriageError } from "@/lib/triage-contract";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
// Serialize check-and-write operations in this server process, including folder settings.
let writes: Promise<unknown> = Promise.resolve();
async function handle(request: Request, write: boolean) {
  const key = process.env.ATTENTION_API_KEY;
  if (!key || key.length < 32) return json({ error: "Triage integration is not configured" }, 503);
  if (!secretMatches(request.headers.get("authorization"), `Bearer ${key}`)) return json({ error: "Unauthorized" }, 401);
  const limited = await enforceRateLimit(request, { limit: write ? 90 : 120, scope: `integration-triage-${write ? "write" : "read"}`, windowMs: 60000 });
  if (limited) return limited;
  const token = process.env.TODOIST_API_KEY?.trim();
  if (!token) return json({ error: "Todoist is not configured" }, 503);
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60000)]);
    const calendar = createTriageCalendar(signal);
    const service = createTriageService({
      readState: () => readTaskRefreshState(token), saveSettings: (s) => saveTaskRefreshSettings(token, s),
      extraBucketIds: (process.env.ATTENTION_TODOIST_BUCKET_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      calendars: async () => (await calendar.calendars()).filter((c) => c.writable), schedule: calendar.schedule,
      todoist: async (path, body, method = "POST") => readTodoistProviderResponse(await todoistTokenFetch(token, path, {
        method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal,
      })),
    });
    if (write) {
      const action = parseTriageAction(await request.json().catch(() => null));
      const pending = writes.catch(() => undefined).then(() => service.mutate(action));
      writes = pending; await pending; invalidateTriageCounts();
      // Mutation success is independent of a subsequent read. BB refreshes separately.
      return json({ ok: true });
    }
    return json(await service.snapshot());
  } catch (error) {
    if (error instanceof TriageError) return json({ error: error.message }, error.status);
    console.warn("[TRIAGE:API] Request failed");
    return json({ error: "Triage could not be saved or loaded. Refresh to check the task's current state." }, 502);
  }
}
export const GET = (request: Request) => handle(request, false);
export const POST = (request: Request) => handle(request, true);

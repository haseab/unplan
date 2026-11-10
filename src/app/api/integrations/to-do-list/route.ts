import { integrationCalendar } from "@/lib/attention-calendar-integration";
import { priorityTodayItems } from "@/lib/attention-to-do-list";
import { readTaskRefreshState, secretMatches } from "@/lib/task-refresh-server";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const failure = (message: string) => ({ status: "error" as const, value: null, message });
async function readList(request: Request) {
  const calendar = async () => {
    try {
      const response = await integrationCalendar(request, "todo");
      if (!response.ok) return failure("Calendar tasks are unavailable; check Google Calendar in Unplan");
      return { status: "connected" as const, value: await response.json(), message: null };
    } catch { return failure("Calendar tasks are unavailable; check Google Calendar in Unplan"); }
  };
  const today = async () => {
    const token = process.env.TODOIST_API_KEY?.trim();
    if (!token) return { status: "disconnected" as const, value: null, message: "Connect Todoist in Unplan" };
    try {
      const state = await readTaskRefreshState(token);
      const bucketIds = (process.env.ATTENTION_TODOIST_BUCKET_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
      return { status: "connected" as const, value: { tasks: priorityTodayItems(state.tasks, state.projects, state.record?.settings.parents ?? {}, bucketIds), checkedAt: new Date().toISOString() }, message: null };
    } catch { return failure("Priority Today is unavailable; check Todoist in Unplan"); }
  };
  const [calendarList, priorityToday] = await Promise.all([calendar(), today()]);
  return { calendar: calendarList, priorityToday };
}
// Include configuration in the cache key so credential/account changes take effect immediately.
let cached: { key: string; at: number; value: Awaited<ReturnType<typeof readList>> } | null = null;
let pending: { key: string; value: ReturnType<typeof readList> } | null = null;
export async function GET(request: Request) {
  const expected = process.env.ATTENTION_API_KEY;
  if (!expected || expected.length < 32) return json({ error: "Integration is not configured" }, 503);
  if (!secretMatches(request.headers.get("authorization"), `Bearer ${expected}`)) return json({ error: "Unauthorized" }, 401);
  const key = JSON.stringify([expected, process.env.TODOIST_API_KEY, process.env.ATTENTION_TODOIST_BUCKET_IDS, process.env.ATTENTION_GOOGLE_OWNER_ID, process.env.ATTENTION_GOOGLE_EMAIL, process.env.ATTENTION_GOOGLE_EMAILS]);
  if (cached?.key === key && Date.now() - cached.at < 15_000) return json(cached.value);
  if (pending?.key !== key) {
    const value = readList(request).then((value) => { cached = { key, at: Date.now(), value }; return value; })
      .finally(() => { if (pending?.key === key) pending = null; });
    pending = { key, value };
  }
  return json(await pending.value);
}

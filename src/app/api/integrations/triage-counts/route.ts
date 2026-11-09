import { attentionTriageCounts } from "@/lib/attention-triage-counts";
import { readTaskRefreshState, secretMatches } from "@/lib/task-refresh-server";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
type Counts = ReturnType<typeof attentionTriageCounts>;
let cached: { key: string; at: number; value: Counts } | null = null;
let pending: { key: string; value: Promise<Counts> } | null = null;

export async function GET(request: Request) {
  const expected = process.env.ATTENTION_API_KEY;
  if (!expected || expected.length < 32) return json({ error: "Integration is not configured" }, 503);
  if (!secretMatches(request.headers.get("authorization"), `Bearer ${expected}`)) return json({ error: "Unauthorized" }, 401);
  const token = process.env.TODOIST_API_KEY?.trim();
  if (!token) return json({ error: "Todoist is not configured" }, 503);
  const extraBucketIds = (process.env.ATTENTION_TODOIST_BUCKET_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const key = JSON.stringify([token, extraBucketIds]);
  if (cached?.key === key && Date.now() - cached.at < 15_000) return json(cached.value);
  try {
    if (pending?.key !== key) {
      const value = readTaskRefreshState(token).then((state) => {
        const value = attentionTriageCounts(state.tasks, state.projects, state.record?.settings.parents ?? {}, new Date(), extraBucketIds);
        cached = { key, at: Date.now(), value };
        return value;
      }).finally(() => { if (pending?.key === key) pending = null; });
      pending = { key, value };
    }
    return json(await pending.value);
  } catch {
    console.warn("[ATTENTION:TRIAGE] Read unavailable");
    return json({ error: "Triage counts are unavailable; check Todoist in Unplan" }, 503);
  }
}

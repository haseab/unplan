import { runTaskRefresh, secretMatches } from "@/lib/task-refresh-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let running: ReturnType<typeof runTaskRefresh> | null = null;

export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("authorization"), process.env.TASK_REFRESH_SECRET ? `Bearer ${process.env.TASK_REFRESH_SECRET}` : undefined)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = process.env.TODOIST_API_KEY?.trim();
  if (!token) return Response.json({ error: "Task refresh is not configured" }, { status: 503 });
  try {
    if (!running) running = runTaskRefresh(token).finally(() => { running = null; });
    const result = await running;
    console.info("[TASK-REFRESH:CRON]", result);
    return Response.json(result, { status: result.failed ? 502 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[TASK-REFRESH:CRON]", error instanceof Error ? error.message : "Refresh failed");
    return Response.json({ error: "Task refresh failed" }, { status: 502 });
  }
}

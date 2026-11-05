import { TODOIST_TOKEN_HEADER } from "@/lib/todoist";
import { parseTaskRefreshSettings } from "@/lib/task-refresh-settings";
import { readTaskRefreshState, saveTaskRefreshSettings, secretMatches } from "@/lib/task-refresh-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managed = (token: string) => !!process.env.TASK_REFRESH_SECRET && secretMatches(token, process.env.TODOIST_API_KEY?.trim());

export async function GET(request: Request) {
  const token = request.headers.get(TODOIST_TOKEN_HEADER)?.trim();
  if (!token) return Response.json({ error: "Todoist connection required" }, { status: 401 });
  if (!managed(token)) return Response.json({ settings: null, serverManaged: false }, { headers: { "Cache-Control": "no-store" } });
  try {
    const state = await readTaskRefreshState(token);
    return Response.json({ settings: state.record?.settings ?? null, serverManaged: managed(token) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Refresh settings could not be read" }, { status: 502 });
  }
}

export async function PUT(request: Request) {
  const token = request.headers.get(TODOIST_TOKEN_HEADER)?.trim();
  if (!token) return Response.json({ error: "Todoist connection required" }, { status: 401 });
  if (!managed(token)) return Response.json({ error: "Server refresh is not configured for this account" }, { status: 403 });
  const settings = parseTaskRefreshSettings(await request.json().catch(() => null));
  if (!settings) return Response.json({ error: "Invalid refresh settings" }, { status: 400 });
  try {
    return Response.json({ settings: await saveTaskRefreshSettings(token, settings), serverManaged: managed(token) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Refresh settings could not be saved" }, { status: 502 });
  }
}

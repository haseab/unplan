import type { NextRequest } from "next/server";
import { enforceRateLimit } from "@/lib/request-rate-limit";
import { readTodoistProviderResponse, todoistProviderFetch } from "@/lib/todoist-server";
import { migrateLocalTask } from "@/lib/local-task-migration-server";

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, { limit: 90, scope: "todoist-local-migration", windowMs: 60_000 });
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.localId !== "string" || !body.localId.startsWith("local-") || typeof body.content !== "string" || !body.content.trim() || typeof body.projectId !== "string" || !body.projectId.trim()) {
    return Response.json({ error: "A valid local task and Todoist destination are required" }, { status: 400 });
  }
  try {
    const task = await migrateLocalTask({
      localId: body.localId, content: body.content, description: typeof body.description === "string" ? body.description : "",
      priority: [1,2,3,4].includes(body.priority) ? body.priority : 1, projectId: body.projectId,
      ...(typeof body.sectionId === "string" ? { sectionId: body.sectionId } : {}),
      ...(typeof body.dueDate === "string" ? { dueDate: body.dueDate } : {}),
      ...(typeof body.dueDatetime === "string" ? { dueDatetime: body.dueDatetime } : {}),
    }, async <T,>(path: string, init?: RequestInit) => {
      const response = todoistProviderFetch(request, path, init);
      if (!response) throw Object.assign(new Error("Connect Todoist in Settings first"), { status: 401 });
      return await readTodoistProviderResponse(await response) as T;
    });
    return Response.json({ task });
  } catch (caught) {
    const error = caught as Error & { status?: number };
    console.warn("[TODOIST:LOCAL-MIGRATION] Upload failed", { status: error.status });
    return Response.json({ error: error.message }, { status: error.status ?? 502 });
  }
}

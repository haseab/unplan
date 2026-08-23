import { enforceRateLimit } from "@/lib/request-rate-limit";
import { readTodoistProviderResponse, todoistProviderFetch } from "@/lib/todoist-server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const rateLimited = await enforceRateLimit(request, {
    limit: 120,
    scope: "todoist-tasks-read",
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;
  const response = todoistProviderFetch(request, "/tasks?limit=200");
  if (!response) return Response.json({ error: "Todoist API token is required" }, { status: 401 });
  try {
    const data = await readTodoistProviderResponse(await response) as { results?: unknown[] } | unknown[];
    return Response.json({ tasks: Array.isArray(data) ? data : data.results ?? [] });
  } catch (caught) {
    const error = caught as Error & { status?: number };
    console.warn("[TODOIST:API] Task import failed", { status: error.status });
    return Response.json({ error: error.message }, { status: error.status ?? 502 });
  }
}

export async function POST(request: NextRequest) {
  const rateLimited = await enforceRateLimit(request, {
    limit: 90,
    scope: "todoist-tasks-write",
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;
  const body = await request.json().catch(() => null) as {
    action?: "close" | "create";
    content?: string;
    description?: string;
    dueDatetime?: string;
    projectId?: string;
    sectionId?: string;
    taskId?: string;
  } | null;
  if (!body) return Response.json({ error: "Invalid Todoist request" }, { status: 400 });

  const path = body.action === "close" && body.taskId
    ? `/${encodeURIComponent(body.taskId)}/close`
    : "";
  const payload = body.action === "create" && body.content?.trim()
    ? {
        content: body.content.trim(),
        ...(body.description?.trim() ? { description: body.description.trim() } : {}),
        ...(body.dueDatetime ? { due_datetime: body.dueDatetime } : {}),
        ...(body.projectId ? { project_id: body.projectId } : {}),
        ...(body.sectionId ? { section_id: body.sectionId } : {}),
      }
    : null;
  if (body.action !== "close" && !payload) {
    return Response.json({ error: "A Todoist task title is required" }, { status: 400 });
  }
  if (body.action === "close" && !body.taskId) {
    return Response.json({ error: "A Todoist task ID is required" }, { status: 400 });
  }

  const response = todoistProviderFetch(request, `/tasks${path}`, {
    method: "POST",
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  if (!response) return Response.json({ error: "Todoist API token is required" }, { status: 401 });
  try {
    const data = await readTodoistProviderResponse(await response);
    return Response.json(body.action === "create" ? { task: data } : { ok: true });
  } catch (caught) {
    const error = caught as Error & { status?: number };
    console.warn("[TODOIST:API] Task mutation failed", { action: body.action, status: error.status });
    return Response.json({ error: error.message }, { status: error.status ?? 502 });
  }
}

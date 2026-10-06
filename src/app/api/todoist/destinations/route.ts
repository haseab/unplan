import { enforceRateLimit } from "@/lib/request-rate-limit";
import { collectTodoistPages, type TodoistPage } from "@/lib/todoist";
import { readTodoistProviderResponse, todoistProviderFetch } from "@/lib/todoist-server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const rateLimited = await enforceRateLimit(request, {
    limit: 120,
    scope: "todoist-destinations-read",
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  try {
    const [projects, sections] = await Promise.all([
      collectTodoistPages<unknown>(async (cursor) => {
        const params = new URLSearchParams({ limit: "200" });
        if (cursor) params.set("cursor", cursor);
        const response = todoistProviderFetch(request, `/projects?${params}`);
        if (!response) {
          throw Object.assign(new Error("Todoist API token is required"), { status: 401 });
        }
        return await readTodoistProviderResponse(await response) as TodoistPage<unknown>;
      }),
      collectTodoistPages<unknown>(async (cursor) => {
        const params = new URLSearchParams({ limit: "200" });
        if (cursor) params.set("cursor", cursor);
        const response = todoistProviderFetch(request, `/sections?${params}`);
        if (!response) {
          throw Object.assign(new Error("Todoist API token is required"), { status: 401 });
        }
        return await readTodoistProviderResponse(await response) as TodoistPage<unknown>;
      }),
    ]);
    return Response.json({ projects, sections });
  } catch (caught) {
    const error = caught as Error & { status?: number };
    console.warn("[TODOIST:API] Destination import failed", { status: error.status });
    return Response.json({ error: error.message }, { status: error.status ?? 502 });
  }
}

export async function POST(request: NextRequest) {
  const rateLimited = await enforceRateLimit(request, {
    limit: 20,
    scope: "todoist-project-create",
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => null) as { kind?: string; name?: string; projectId?: string } | null;
  const kind = body?.kind ?? "project";
  if (kind !== "project" && kind !== "section") {
    return Response.json({ error: "Invalid Todoist destination kind" }, { status: 400 });
  }
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
  if (!name) {
    return Response.json({ error: `A Todoist ${kind} name is required` }, { status: 400 });
  }
  if (kind === "section" && !projectId) {
    return Response.json({ error: "A Todoist project ID is required for a section" }, { status: 400 });
  }
  const response = todoistProviderFetch(request, kind === "section" ? "/sections" : "/projects", {
    method: "POST",
    body: JSON.stringify({ name, ...(kind === "section" ? { project_id: projectId } : {}) }),
  });
  if (!response) {
    return Response.json({ error: "Todoist API token is required" }, { status: 401 });
  }
  try {
    const destination = await readTodoistProviderResponse(await response);
    return Response.json({ [kind]: destination });
  } catch (caught) {
    const error = caught as Error & { status?: number };
    console.warn("[TODOIST:DESTINATION] Destination creation failed", {
      kind,
      name,
      status: error.status,
    });
    return Response.json({ error: error.message }, { status: error.status ?? 502 });
  }
}

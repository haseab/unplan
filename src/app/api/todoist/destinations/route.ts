import { enforceRateLimit } from "@/lib/request-rate-limit";
import { readTodoistProviderResponse, todoistProviderFetch } from "@/lib/todoist-server";
import type { NextRequest } from "next/server";

type TodoistPage = { results?: unknown[] } | unknown[];

const pageResults = (page: TodoistPage) => Array.isArray(page) ? page : page.results ?? [];

export async function GET(request: NextRequest) {
  const rateLimited = await enforceRateLimit(request, {
    limit: 120,
    scope: "todoist-destinations-read",
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  const projectResponse = todoistProviderFetch(request, "/projects?limit=200");
  const sectionResponse = todoistProviderFetch(request, "/sections?limit=200");
  if (!projectResponse || !sectionResponse) {
    return Response.json({ error: "Todoist API token is required" }, { status: 401 });
  }

  try {
    const [projects, sections] = await Promise.all([
      projectResponse.then(readTodoistProviderResponse) as Promise<TodoistPage>,
      sectionResponse.then(readTodoistProviderResponse) as Promise<TodoistPage>,
    ]);
    return Response.json({
      projects: pageResults(projects),
      sections: pageResults(sections),
    });
  } catch (caught) {
    const error = caught as Error & { status?: number };
    console.warn("[TODOIST:API] Destination import failed", { status: error.status });
    return Response.json({ error: error.message }, { status: error.status ?? 502 });
  }
}

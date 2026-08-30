import { enforceRateLimit } from "@/lib/request-rate-limit";
import { collectTodoistPages, type TodoistPage } from "@/lib/todoist";
import { readTodoistProviderResponse, todoistProviderFetch } from "@/lib/todoist-server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const rateLimited = await enforceRateLimit(request, {
    limit: 120,
    scope: "todoist-tasks-read",
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;
  const projectId = request.nextUrl.searchParams.get("projectId")?.trim();
  if (!projectId) {
    return Response.json({ error: "A Todoist project ID is required" }, { status: 400 });
  }
  try {
    const tasks = await collectTodoistPages<unknown>(async (cursor) => {
      const params = new URLSearchParams({ limit: "200", project_id: projectId });
      if (cursor) params.set("cursor", cursor);
      const response = todoistProviderFetch(request, `/tasks?${params}`);
      if (!response) {
        throw Object.assign(new Error("Todoist API token is required"), { status: 401 });
      }
      return await readTodoistProviderResponse(await response) as TodoistPage<unknown>;
    });
    return Response.json({ tasks });
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
    action?: "close" | "create" | "delete" | "move" | "reorder" | "update";
    content?: string;
    description?: string;
    dueDatetime?: string;
    projectId?: string;
    sectionId?: string;
    taskId?: string;
    items?: Array<{ childOrder?: number; id?: string }>;
  } | null;
  if (!body) return Response.json({ error: "Invalid Todoist request" }, { status: 400 });

  if (body.action === "reorder") {
    const items = body.items;
    if (
      !items?.length ||
      items.length > 500 ||
      items.some(({ childOrder, id }) =>
        typeof id !== "string" ||
        !id.trim() ||
        !Number.isInteger(childOrder) ||
        Number(childOrder) < 1
      ) ||
      new Set(items.map(({ id }) => id)).size !== items.length ||
      new Set(items.map(({ childOrder }) => childOrder)).size !== items.length
    ) {
      return Response.json({ error: "A valid Todoist task order is required" }, { status: 400 });
    }
    const childOrders = items.map(({ childOrder }) => Number(childOrder));
    const reorderDetails = {
      firstChildOrder: Math.min(...childOrders),
      itemCount: items.length,
      items: items.map(({ childOrder, id }) => ({ childOrder, id })),
      lastChildOrder: Math.max(...childOrders),
    };
    const reorderStartedAt = Date.now();
    console.debug(
      "[BUG:TODOIST-REORDER-RANGE]",
      "[TODOIST:REORDER] provider request",
      reorderDetails,
    );
    const commandId = crypto.randomUUID();
    const commands = [{
      type: "item_reorder",
      uuid: commandId,
      args: {
        items: items.map(({ childOrder, id }) => ({ id, child_order: childOrder })),
      },
    }];
    const response = todoistProviderFetch(request, "/sync", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ commands: JSON.stringify(commands) }),
    });
    if (!response) return Response.json({ error: "Todoist API token is required" }, { status: 401 });
    try {
      const data = await readTodoistProviderResponse(await response) as {
        sync_status?: Record<string, "ok" | { error?: string }>;
      };
      const commandStatus = data.sync_status?.[commandId];
      if (commandStatus !== "ok") {
        const message = typeof commandStatus === "object"
          ? commandStatus.error
          : undefined;
        throw Object.assign(new Error(message ?? "Todoist could not save the task order"), {
          status: 502,
        });
      }
      console.info(
        "[BUG:TODOIST-REORDER-RANGE]",
        "[TODOIST:REORDER] provider success",
        {
          elapsedMs: Date.now() - reorderStartedAt,
          firstChildOrder: reorderDetails.firstChildOrder,
          itemCount: reorderDetails.itemCount,
          lastChildOrder: reorderDetails.lastChildOrder,
        },
      );
      return Response.json({ ok: true });
    } catch (caught) {
      const error = caught as Error & { retryAfterMs?: number; status?: number };
      console.warn(
        "[BUG:TODOIST-REORDER-RANGE]",
        "[TODOIST:API] Task reorder failed",
        {
          elapsedMs: Date.now() - reorderStartedAt,
          firstChildOrder: reorderDetails.firstChildOrder,
          itemCount: reorderDetails.itemCount,
          lastChildOrder: reorderDetails.lastChildOrder,
          status: error.status,
        },
      );
      return Response.json(
        { error: error.message },
        {
          status: error.status ?? 502,
          ...(error.retryAfterMs
            ? { headers: { "Retry-After": String(Math.ceil(error.retryAfterMs / 1_000)) } }
            : {}),
        },
      );
    }
  }

  if (body.action === "delete" && body.taskId) {
    const response = todoistProviderFetch(
      request,
      `/tasks/${encodeURIComponent(body.taskId)}`,
      { method: "DELETE" },
    );
    if (!response) return Response.json({ error: "Todoist API token is required" }, { status: 401 });
    try {
      await readTodoistProviderResponse(await response);
      return Response.json({ ok: true });
    } catch (caught) {
      const error = caught as Error & { status?: number };
      console.warn("[TODOIST:API] Task deletion failed", { status: error.status });
      return Response.json({ error: error.message }, { status: error.status ?? 502 });
    }
  }

  if (body.action === "move" && body.taskId && body.projectId) {
    const response = todoistProviderFetch(
      request,
      `/tasks/${encodeURIComponent(body.taskId)}/move`,
      {
        method: "POST",
        body: JSON.stringify({ project_id: body.projectId }),
      },
    );
    if (!response) return Response.json({ error: "Todoist API token is required" }, { status: 401 });
    try {
      const task = await readTodoistProviderResponse(await response);
      return Response.json({ task });
    } catch (caught) {
      const error = caught as Error & { status?: number };
      console.warn("[TODOIST:API] Task move failed", { status: error.status });
      return Response.json({ error: error.message }, { status: error.status ?? 502 });
    }
  }

  const path = body.action === "close" && body.taskId
    ? `/${encodeURIComponent(body.taskId)}/close`
    : body.action === "update" && body.taskId
      ? `/${encodeURIComponent(body.taskId)}`
      : "";
  const payload = (body.action === "create" || body.action === "update") && body.content?.trim()
    ? {
        content: body.content.trim(),
        ...(body.description?.trim() ? { description: body.description.trim() } : {}),
        ...(body.dueDatetime ? { due_datetime: body.dueDatetime } : {}),
        ...(body.projectId ? { project_id: body.projectId } : {}),
        ...(body.sectionId ? { section_id: body.sectionId } : {}),
      }
    : null;
  if (body.action !== "close" && body.action !== "delete" && body.action !== "move" && !payload) {
    return Response.json({ error: "A Todoist task title is required" }, { status: 400 });
  }
  if (body.action === "close" && !body.taskId) {
    return Response.json({ error: "A Todoist task ID is required" }, { status: 400 });
  }
  if (body.action === "update" && !body.taskId) {
    return Response.json({ error: "A Todoist task ID is required" }, { status: 400 });
  }
  if ((body.action === "delete" || body.action === "move") && !body.taskId) {
    return Response.json({ error: "A Todoist task ID is required" }, { status: 400 });
  }
  if (body.action === "move" && !body.projectId) {
    return Response.json({ error: "A Todoist destination project is required" }, { status: 400 });
  }

  const response = todoistProviderFetch(request, `/tasks${path}`, {
    method: "POST",
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  if (!response) return Response.json({ error: "Todoist API token is required" }, { status: 401 });
  try {
    const data = await readTodoistProviderResponse(await response);
    return Response.json(body.action === "close" ? { ok: true } : { task: data });
  } catch (caught) {
    const error = caught as Error & { status?: number };
    console.warn("[TODOIST:API] Task mutation failed", { action: body.action, status: error.status });
    return Response.json({ error: error.message }, { status: error.status ?? 502 });
  }
}

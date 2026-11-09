import { TODOIST_TOKEN_HEADER } from "@/lib/todoist";
import type { NextRequest } from "next/server";
import { TodoistRequestCoordinator } from "./todoist-request-coordinator";
export { todoistErrorResponse } from "./todoist-request-coordinator";

const shared = globalThis as typeof globalThis & { unplanTodoistRequests?: TodoistRequestCoordinator };
const coordinator = shared.unplanTodoistRequests ??= new TodoistRequestCoordinator();

export const todoistProviderFetch = (
  request: NextRequest,
  path: string,
  init?: RequestInit,
) => {
  const token = request.headers.get(TODOIST_TOKEN_HEADER)?.trim();
  if (!token) return null;
  return todoistTokenFetch(token, path, init);
};

export const todoistTokenFetch = (token: string, path: string, init?: RequestInit) =>
  coordinator.request(token, path, init);

export const readTodoistProviderResponse = async (response: Response) => {
  const text = await response.text();
  if (response.ok) return text ? JSON.parse(text) : null;
  let message = "Todoist rejected the request";
  try {
    const data = JSON.parse(text) as { error?: string; message?: string };
    message = data.error ?? data.message ?? message;
  } catch {
    if (text && text.length < 240) message = text;
  }
  const retryAfterSeconds = Number(response.headers.get("retry-after"));
  throw Object.assign(new Error(message), {
    status: response.status,
    ...(Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? { retryAfterMs: retryAfterSeconds * 1_000 }
      : {}),
  });
};

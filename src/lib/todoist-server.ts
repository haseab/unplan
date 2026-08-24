import { TODOIST_TOKEN_HEADER } from "@/lib/todoist";
import type { NextRequest } from "next/server";

const TODOIST_API_URL = "https://api.todoist.com/api/v1";

export const todoistProviderFetch = (
  request: NextRequest,
  path: string,
  init?: RequestInit,
) => {
  const token = request.headers.get(TODOIST_TOKEN_HEADER)?.trim();
  if (!token) return null;
  return fetch(`${TODOIST_API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
};

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
  throw Object.assign(new Error(message), { status: response.status });
};

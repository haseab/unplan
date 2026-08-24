import { appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const allowedLevels = new Set(["log", "info", "warn", "error", "debug"]);
const validFlag = /^[A-Z0-9][A-Z0-9:_-]{1,63}$/;
const debugLogPath =
  process.env.UNPLAN_DEBUG_LOG_PATH ?? join(tmpdir(), "unplan-debug.log");
const maxEntriesPerRequest = 100;

type LogEntry = {
  timestamp?: unknown;
  level?: unknown;
  flag?: unknown;
  messages?: unknown;
};

function formatEntry(entry: LogEntry) {
  if (
    typeof entry.level !== "string" ||
    !allowedLevels.has(entry.level) ||
    !Array.isArray(entry.messages)
  ) {
    return null;
  }

  const message = entry.messages
    .filter((item): item is string => typeof item === "string")
    .join(" ")
    .slice(0, 32_000);
  const flag =
    typeof entry.flag === "string" && validFlag.test(entry.flag)
      ? entry.flag
      : "GENERAL";
  const timestamp =
    typeof entry.timestamp === "string" && !Number.isNaN(Date.parse(entry.timestamp))
      ? new Date(entry.timestamp).toISOString()
      : new Date().toISOString();

  return `[${timestamp}] [BROWSER] [${entry.level.toUpperCase()}] [${flag}] ${message}\n`;
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    entries?: unknown;
  } | null;
  if (!body || !Array.isArray(body.entries)) {
    return Response.json({ error: "Invalid log entry" }, { status: 400 });
  }

  const entries = body.entries
    .slice(0, maxEntriesPerRequest)
    .map((entry) => formatEntry(entry as LogEntry));
  if (entries.some((entry) => entry === null)) {
    return Response.json({ error: "Invalid log entry" }, { status: 400 });
  }

  await appendFile(debugLogPath, entries.join(""), "utf8");
  return new Response(null, { status: 204 });
}

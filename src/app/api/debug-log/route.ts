import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const allowedLevels = new Set(["log", "info", "warn", "error", "debug"]);
const validFlag = /^[A-Z0-9][A-Z0-9:_-]{1,63}$/;
const debugLogPath = join(process.cwd(), "debug.log");

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    level?: unknown;
    flag?: unknown;
    messages?: unknown;
  } | null;

  if (
    !body ||
    typeof body.level !== "string" ||
    !allowedLevels.has(body.level) ||
    !Array.isArray(body.messages)
  ) {
    return Response.json({ error: "Invalid log entry" }, { status: 400 });
  }

  const message = body.messages
    .filter((item): item is string => typeof item === "string")
    .join(" ")
    .slice(0, 32_000);
  const flag =
    typeof body.flag === "string" && validFlag.test(body.flag)
      ? body.flag
      : "GENERAL";
  const entry = `[${new Date().toISOString()}] [BROWSER] [${body.level.toUpperCase()}] [${flag}] ${message}\n`;

  await appendFile(debugLogPath, entry, "utf8");
  return new Response(null, { status: 204 });
}

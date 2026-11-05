import { connectServerGoogleAccount, googleAuthErrorResponse } from "@/lib/google-auth-server";
import { isTrustedGoogleMutation } from "@/lib/google-auth-request";
import { consumeGoogleAuthorization, createGoogleSession, readGoogleSession } from "@/lib/google-session";
import { enforceRateLimit } from "@/lib/request-rate-limit";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  if (!isTrustedGoogleMutation(request, process.env.APP_ORIGIN)) {
    return Response.json({ error: "Invalid OAuth request" }, { status: 403 });
  }
  const limited = await enforceRateLimit(request, { limit: 20, scope: "google-oauth-code", windowMs: 60_000 });
  if (limited) return limited;
  try {
    const body = await request.json().catch(() => null) as { code?: unknown; challenge?: unknown } | null;
    if (!body || typeof body.code !== "string" || !body.code || body.code.length > 4096
      || !await consumeGoogleAuthorization(body.challenge)) {
      return Response.json({ error: "Google sign-in expired. Please connect again." }, { status: 400 });
    }
    const session = await readGoogleSession();
    const connected = await connectServerGoogleAccount(body.code, request.headers.get("origin")!, session?.ownerId);
    await createGoogleSession(connected.ownerId, session?.tokenHash);
    return Response.json({ account: connected.account }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return googleAuthErrorResponse(error);
  }
}

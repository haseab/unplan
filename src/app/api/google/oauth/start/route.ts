import { isTrustedGoogleMutation } from "@/lib/google-auth-request";
import { googleAuthErrorResponse, googleOAuthConfiguration } from "@/lib/google-auth-server";
import { startGoogleAuthorization } from "@/lib/google-session";
import { enforceRateLimit } from "@/lib/request-rate-limit";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  if (!isTrustedGoogleMutation(request, process.env.APP_ORIGIN)) {
    return Response.json({ error: "Invalid OAuth request" }, { status: 403 });
  }
  const limited = await enforceRateLimit(request, { limit: 20, scope: "google-oauth-start", windowMs: 60_000 });
  if (limited) return limited;
  try {
    googleOAuthConfiguration();
    return Response.json({ challenge: await startGoogleAuthorization() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return googleAuthErrorResponse(error);
  }
}

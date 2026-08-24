import { enforceRateLimit } from "@/lib/request-rate-limit";
import type { NextRequest } from "next/server";

type GoogleTokenRequest = {
  code?: string;
  grantType?: "authorization_code" | "refresh_token";
  redirectUri?: string;
  refreshToken?: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
  refresh_token?: string;
};

export async function POST(request: NextRequest) {
  const rateLimited = await enforceRateLimit(request, {
    limit: 60,
    scope: "google-oauth-token",
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;
  if (request.headers.get("x-requested-with") !== "XmlHttpRequest") {
    return Response.json({ error: "Invalid OAuth request" }, { status: 403 });
  }

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim()
    || process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return Response.json({
      error: "Google OAuth code flow requires GOOGLE_CLIENT_SECRET",
    }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as GoogleTokenRequest | null;
  if (!body?.grantType) {
    return Response.json({ error: "Invalid Google token request" }, { status: 400 });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: body.grantType,
  });
  if (body.grantType === "authorization_code") {
    const origin = request.headers.get("origin");
    if (!body.code || !body.redirectUri || !origin || body.redirectUri !== origin) {
      return Response.json({ error: "Invalid Google authorization code request" }, { status: 400 });
    }
    params.set("code", body.code);
    params.set("redirect_uri", body.redirectUri);
  } else {
    if (!body.refreshToken) {
      return Response.json({ error: "Google refresh token is required" }, { status: 400 });
    }
    params.set("refresh_token", body.refreshToken);
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({})) as GoogleTokenResponse;
  return Response.json(data, {
    status: response.status,
    headers: { "Cache-Control": "no-store" },
  });
}

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_API_ROOT = "https://www.googleapis.com/calendar/v3";

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export const googleConfigured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const getAppOrigin = (request: NextRequest) => {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return new URL(process.env.GOOGLE_REDIRECT_URI).origin;
  }

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const protocol =
    forwardedProtocol || request.nextUrl.protocol.replace(/:$/, "") || "https";

  return `${protocol}://${host}`;
};

export const getGoogleRedirectUri = (request: NextRequest) => {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;

  return `${getAppOrigin(request)}/api/google/callback`;
};

const cookieOptions = (maxAge?: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  ...(maxAge ? { maxAge } : {}),
});

export async function saveGoogleTokens(tokens: GoogleTokenResponse) {
  const store = await cookies();
  if (tokens.access_token) {
    store.set(
      "unplan_google_access",
      tokens.access_token,
      cookieOptions(tokens.expires_in ?? 3600),
    );
  }
  if (tokens.refresh_token) {
    store.set(
      "unplan_google_refresh",
      tokens.refresh_token,
      cookieOptions(60 * 60 * 24 * 90),
    );
  }
}

async function refreshAccessToken() {
  const store = await cookies();
  const refreshToken = store.get("unplan_google_refresh")?.value;
  if (!refreshToken || !googleConfigured()) return null;

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const tokens = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || !tokens.access_token) return null;
  await saveGoogleTokens(tokens);
  return tokens.access_token;
}

export async function hasGoogleSession() {
  const store = await cookies();
  return Boolean(
    store.get("unplan_google_access")?.value ||
      store.get("unplan_google_refresh")?.value,
  );
}

export async function googleFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const store = await cookies();
  let accessToken = store.get("unplan_google_access")?.value;
  if (!accessToken) accessToken = (await refreshAccessToken()) ?? undefined;
  if (!accessToken) {
    return Response.json({ error: "Google account is not connected" }, { status: 401 });
  }

  const request = (token: string) =>
    fetch(`${GOOGLE_API_ROOT}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });

  let response = await request(accessToken);
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) response = await request(refreshed);
  }
  return response;
}

export async function clearGoogleSession() {
  const store = await cookies();
  store.delete("unplan_google_access");
  store.delete("unplan_google_refresh");
  store.delete("unplan_google_email");
  store.delete("unplan_google_state");
}

export const googleCookieOptions = cookieOptions;

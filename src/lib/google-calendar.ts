import { bbApiOwner } from "./bb-api-context";
import "server-only";

import { GOOGLE_ACCOUNT_HEADER } from "./google-auth-shared";
import { isTrustedGoogleMutation } from "./google-auth-request";
import { googleAuthErrorResponse, serverGoogleAccessToken } from "./google-auth-server";
import { GOOGLE_SESSION_COOKIE, readGoogleSession } from "./google-session";
import { GoogleOAuthError } from "./google-oauth-provider";

const GOOGLE_API_ROOT = "https://www.googleapis.com/calendar/v3";

export const hasGoogleAuthorization = (request: Request) =>
  Boolean(request.headers.get(GOOGLE_ACCOUNT_HEADER)
    && (bbApiOwner() || request.headers.get("cookie")?.split(";").some((part) => part.trim().startsWith(`${GOOGLE_SESSION_COOKIE}=`))));

export const googleFetch = async (request: Request, path: string, init: RequestInit = {}) => {
  if (!["GET", "HEAD"].includes(init.method?.toUpperCase() ?? "GET")
    && !isTrustedGoogleMutation(request, process.env.APP_ORIGIN)) {
    return Response.json({ error: "Invalid Google request" }, { status: 403 });
  }
  try {
    const accountId = request.headers.get(GOOGLE_ACCOUNT_HEADER);
    if (!accountId || accountId.length > 255) throw new GoogleOAuthError("reconnect_required", "Reconnect your Google account.", 401);
    const session = await readGoogleSession();
    if (!session) throw new GoogleOAuthError("reconnect_required", "Reconnect your Google account.", 401);
    const send = (token: string) => fetch(`${GOOGLE_API_ROOT}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        ...Object.fromEntries(new Headers(init.headers)),
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    const token = await serverGoogleAccessToken(session.ownerId, accountId);
    const response = await send(token);
    // Retry a rejected access token once; only invalid_grant erases credentials.
    if (response.status !== 401) return response;
    await response.body?.cancel();
    return await send(await serverGoogleAccessToken(session.ownerId, accountId, token));
  } catch (error) {
    return googleAuthErrorResponse(error);
  }
};

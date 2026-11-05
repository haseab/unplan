import { listStoredGoogleAccounts, withStoredGoogleAccount } from "@/lib/google-account-store";
import { isTrustedGoogleMutation } from "@/lib/google-auth-request";
import { googleAuthErrorResponse, googleOAuthConfiguration } from "@/lib/google-auth-server";
import { clearGoogleSessions, readGoogleSession } from "@/lib/google-session";
import { decryptGoogleTokens } from "@/lib/google-token-crypto";
import { GoogleOAuthError } from "@/lib/google-oauth-provider";
import { enforceRateLimit } from "@/lib/request-rate-limit";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request, { limit: 120, scope: "google-accounts-read", windowMs: 60_000 });
  if (limited) return limited;
  try {
    const session = await readGoogleSession();
    return Response.json({ accounts: session ? await listStoredGoogleAccounts(session.ownerId) : [] }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return googleAuthErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!isTrustedGoogleMutation(request, process.env.APP_ORIGIN)) {
    return Response.json({ error: "Invalid account request" }, { status: 403 });
  }
  const limited = await enforceRateLimit(request, { limit: 20, scope: "google-accounts-delete", windowMs: 60_000 });
  if (limited) return limited;
  try {
    const session = await readGoogleSession();
    if (!session) throw new GoogleOAuthError("reconnect_required", "Sign in to disconnect this account.", 401);
    const accountId = request.nextUrl.searchParams.get("accountId");
    if (!accountId || accountId.length > 255) return Response.json({ error: "Invalid Google account" }, { status: 400 });
    const { key } = googleOAuthConfiguration();
    await withStoredGoogleAccount(session.ownerId, accountId, async (account, _save, client) => {
      if (account?.encryptedTokens) {
        const tokens = decryptGoogleTokens(account.encryptedTokens, key, JSON.stringify([session.ownerId, accountId]));
        let response: Response;
        try {
          response = await fetch("https://oauth2.googleapis.com/revoke", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token: tokens.refreshToken }),
            cache: "no-store",
            signal: AbortSignal.timeout(15_000),
          });
        } catch {
          throw new GoogleOAuthError("temporarily_unavailable", "Google is temporarily unreachable. Try disconnecting again shortly.");
        }
        if (!response.ok) {
          const data = await response.json().catch(() => null) as { error?: string } | null;
          if (response.status !== 400 || data?.error !== "invalid_token") {
            throw new GoogleOAuthError("revoke_failed", "Google could not revoke access. Try disconnecting again shortly.");
          }
        }
      }
      await client.query("DELETE FROM unplan_google_accounts WHERE owner_id = $1 AND google_id = $2", [session.ownerId, accountId]);
    });
    const accounts = await listStoredGoogleAccounts(session.ownerId);
    if (!accounts.length) await clearGoogleSessions(session.ownerId);
    return Response.json({ accounts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return googleAuthErrorResponse(error);
  }
}

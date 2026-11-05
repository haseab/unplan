import "server-only";

import { OAuth2Client } from "google-auth-library";
import { withStoredGoogleAccount } from "./google-account-store";
import { hasRequiredGoogleScopes, type GoogleAccountSummary } from "./google-auth-shared";
import { GoogleOAuthError, requestGoogleTokens } from "./google-oauth-provider";
import { decryptGoogleTokens, encryptGoogleTokens, googleTokenEncryptionKey } from "./google-token-crypto";
import { resolveStoredGoogleToken } from "./google-token-service";

const identityClient = new OAuth2Client();
const accountIdentity = (ownerId: string, accountId: string) => JSON.stringify([ownerId, accountId]);

export const googleOAuthConfiguration = () => {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret || !process.env.DATABASE_URL) {
    throw new GoogleOAuthError("not_configured", "Google sign-in is not configured. Please contact support.");
  }
  return { clientId, clientSecret, key: googleTokenEncryptionKey(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY) };
};

export const connectServerGoogleAccount = async (
  code: string,
  redirectUri: string,
  existingOwnerId?: string,
): Promise<{ account: GoogleAccountSummary; ownerId: string }> => {
  const { clientId, clientSecret, key } = googleOAuthConfiguration();
  const tokens = await requestGoogleTokens(new URLSearchParams({
    client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri,
  }));
  if (!tokens.id_token) throw new GoogleOAuthError("missing_identity", "Google did not return an identity. Please connect again.", 400);
  let profile;
  try {
    profile = (await identityClient.verifyIdToken({ audience: clientId, idToken: tokens.id_token })).getPayload();
  } catch {
    throw new GoogleOAuthError("invalid_identity", "Google identity could not be verified. Please connect again.", 401);
  }
  if (!profile?.sub || !profile.email || !profile.email_verified) {
    throw new GoogleOAuthError("invalid_identity", "Google did not return a verified account email.", 401);
  }
  if (!tokens.scope || !hasRequiredGoogleScopes(tokens.scope)) {
    throw new GoogleOAuthError("missing_scopes", "Allow access to events and your calendar list to connect Google Calendar.", 403);
  }
  const ownerId = existingOwnerId ?? profile.sub;
  const account: GoogleAccountSummary = { id: profile.sub, email: profile.email, status: "active" };
  await withStoredGoogleAccount(ownerId, account.id, async (existing, save) => {
    const identity = accountIdentity(ownerId, account.id);
    const refreshToken = tokens.refresh_token || (existing?.encryptedTokens
      ? decryptGoogleTokens(existing.encryptedTokens, key, identity).refreshToken : undefined);
    if (!refreshToken) {
      throw new GoogleOAuthError("missing_refresh_token", "Google did not issue offline access. Remove Unplan in your Google Account connections, then reconnect.", 400);
    }
    await save({
      ...account,
      encryptedTokens: encryptGoogleTokens({
        accessToken: tokens.access_token, refreshToken, expiresAt: Date.now() + tokens.expires_in * 1000,
      }, key, identity),
    });
  });
  return { ownerId, account };
};

export const serverGoogleAccessToken = async (ownerId: string, accountId: string, rejectedToken?: string) => {
  const { clientId, clientSecret, key } = googleOAuthConfiguration();
  const result = await withStoredGoogleAccount(ownerId, accountId, async (account, save) => {
    const resolved = await resolveStoredGoogleToken(account, {
      identity: accountIdentity(ownerId, accountId), key, rejectedToken,
      refresh: (refreshToken) => requestGoogleTokens(new URLSearchParams({
        client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refreshToken,
      })),
    });
    if (resolved.account) await save(resolved.account);
    return resolved;
  });
  if (result.error) throw result.error;
  return result.accessToken!;
};

export const googleAuthErrorResponse = (error: unknown) => {
  if (error instanceof GoogleOAuthError) {
    return Response.json({ error: error.message, errorCode: error.code }, {
      status: error.status, headers: { "Cache-Control": "no-store" },
    });
  }
  console.error("[BUG:GOOGLE-RECONNECT] [GOOGLE:AUTH-STORE] Google connection unavailable");
  return Response.json({ error: "Your Google connection is temporarily unavailable. Try again shortly.", errorCode: "temporarily_unavailable" }, {
    status: 503, headers: { "Cache-Control": "no-store" },
  });
};

import type { StoredGoogleAccount } from "./google-account-store";
import { decryptGoogleTokens, encryptGoogleTokens } from "./google-token-crypto";
import { GoogleOAuthError, type GoogleTokenResponse } from "./google-oauth-provider";

export type GoogleTokenResolution = {
  accessToken?: string;
  account?: StoredGoogleAccount;
  error?: GoogleOAuthError;
};

export const resolveStoredGoogleToken = async (
  account: StoredGoogleAccount | null,
  {
    identity,
    key,
    now = Date.now(),
    rejectedToken,
    refresh,
  }: {
    identity: string;
    key: Buffer;
    now?: number;
    rejectedToken?: string;
    refresh: (refreshToken: string) => Promise<GoogleTokenResponse>;
  },
): Promise<GoogleTokenResolution> => {
  const reconnect = () => new GoogleOAuthError("reconnect_required", "Reconnect your Google account.", 401, true);
  if (!account?.encryptedTokens || account.status !== "active") return { error: reconnect() };
  const tokens = decryptGoogleTokens(account.encryptedTokens, key, identity);
  if (tokens.expiresAt > now + 60_000 && tokens.accessToken !== rejectedToken) {
    return { accessToken: tokens.accessToken };
  }
  try {
    const result = await refresh(tokens.refreshToken);
    return {
      accessToken: result.access_token,
      account: {
        ...account,
        encryptedTokens: encryptGoogleTokens({
          accessToken: result.access_token,
          expiresAt: now + result.expires_in * 1000,
          refreshToken: result.refresh_token || tokens.refreshToken,
        }, key, identity),
      },
    };
  } catch (error) {
    if (error instanceof GoogleOAuthError && error.requiresReconnect) {
      // Return instead of throwing so the caller can commit the invalidation.
      return { error, account: { ...account, status: "expired", encryptedTokens: null } };
    }
    throw error;
  }
};

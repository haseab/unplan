import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { GoogleOAuthError } from "./google-oauth-provider";
import { decryptGoogleTokens, encryptGoogleTokens } from "./google-token-crypto";
import { resolveStoredGoogleToken } from "./google-token-service";

const key = randomBytes(32);
const identity = "owner:account";
const account = (expiresAt = 0) => ({
  id: "account", email: "account@example.test", status: "active" as const,
  encryptedTokens: encryptGoogleTokens({ accessToken: "old-access", refreshToken: "saved-refresh", expiresAt }, key, identity),
});

test("a temporary refresh error leaves stored credentials unchanged", async () => {
  const saved = account();
  const original = saved.encryptedTokens;
  await assert.rejects(resolveStoredGoogleToken(saved, {
    key, identity, refresh: async () => { throw new GoogleOAuthError("network_error", "offline"); },
  }));
  assert.equal(saved.encryptedTokens, original);
  assert.equal(saved.status, "active");
});

test("a terminal revoked grant returns an invalidation that can be committed", async () => {
  const result = await resolveStoredGoogleToken(account(), {
    key, identity, refresh: async () => { throw new GoogleOAuthError("reconnect_required", "revoked", 401, true); },
  });
  assert.equal(result.account?.encryptedTokens, null);
  assert.equal(result.account?.status, "expired");
  assert.equal(result.error?.requiresReconnect, true);
});

test("refresh preserves the old refresh token when Google does not rotate it", async () => {
  const result = await resolveStoredGoogleToken(account(), {
    key, identity, now: 1000,
    refresh: async (token) => {
      assert.equal(token, "saved-refresh");
      return { access_token: "new-access", expires_in: 3600 };
    },
  });
  assert.equal(result.accessToken, "new-access");
  const stored = decryptGoogleTokens(result.account!.encryptedTokens!, key, identity);
  assert.equal(stored.refreshToken, "saved-refresh");
  assert.equal(stored.expiresAt, 3_601_000);
});

test("valid cached tokens avoid refresh unless Google rejected that exact token", async () => {
  let calls = 0;
  const options = { key, identity, now: 1000, refresh: async () => {
    calls += 1;
    return { access_token: "new-access", expires_in: 3600 };
  } };
  assert.equal((await resolveStoredGoogleToken(account(1_000_000), options)).accessToken, "old-access");
  assert.equal(calls, 0);
  assert.equal((await resolveStoredGoogleToken(account(1_000_000), { ...options, rejectedToken: "old-access" })).accessToken, "new-access");
  assert.equal(calls, 1);
  assert.equal((await resolveStoredGoogleToken(account(1_000_000), { ...options, rejectedToken: "different-token" })).accessToken, "old-access");
  assert.equal(calls, 1);
});

test("an unknown account cannot obtain another account's credentials", async () => {
  const result = await resolveStoredGoogleToken(null, { key, identity, refresh: async () => { throw new Error("must not refresh"); } });
  assert.equal(result.error?.status, 401);
  assert.equal(result.accessToken, undefined);
});

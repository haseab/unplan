import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { decryptGoogleTokens, encryptGoogleTokens, googleTokenEncryptionKey } from "./google-token-crypto";

const tokens = { accessToken: "fake-access-secret", refreshToken: "fake-refresh-secret", expiresAt: 12345 };

test("stored credentials use authenticated encryption with a fresh nonce", () => {
  const key = googleTokenEncryptionKey(randomBytes(32).toString("base64"));
  const first = encryptGoogleTokens(tokens, key, "owner:account");
  const second = encryptGoogleTokens(tokens, key, "owner:account");
  assert.notEqual(first, second);
  assert.doesNotMatch(first, /fake-access-secret|fake-refresh-secret/);
  assert.deepEqual(decryptGoogleTokens(first, key, "owner:account"), tokens);
  assert.throws(() => decryptGoogleTokens(first, key, "different-owner:account"));
  assert.throws(() => decryptGoogleTokens(first, randomBytes(32), "owner:account"));
  const tampered = first.split(".");
  const bytes = Buffer.from(tampered[3], "base64url");
  bytes[0] ^= 1;
  tampered[3] = bytes.toString("base64url");
  assert.throws(() => decryptGoogleTokens(tampered.join("."), key, "owner:account"));
});

test("an invalid or missing encryption key fails closed", () => {
  for (const key of [undefined, "", "not-a-key", randomBytes(16).toString("base64")]) {
    assert.throws(() => googleTokenEncryptionKey(key));
  }
});

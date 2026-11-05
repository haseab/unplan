import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());
const database = new URL(process.env.GOOGLE_AUTH_TEST_DATABASE_URL || "postgresql://localhost:5432/unplan_oauth_test");
if (!["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) || !database.pathname.endsWith("_test")) {
  throw new Error("Google auth integration tests require a dedicated local *_test database");
}
const schema = `unplan_auth_test_${randomBytes(8).toString("hex")}`;
database.searchParams.set("options", `-c search_path=${schema}`);
process.env.DATABASE_URL = database.toString();
const require = createRequire(import.meta.url);
const { googleAuthPool, withStoredGoogleAccount, listStoredGoogleAccounts } = require("/tmp/unplan-google-auth-db-tests/google-account-store.js");
const { encryptGoogleTokens, decryptGoogleTokens } = require("/tmp/unplan-google-auth-db-tests/google-token-crypto.js");
const { resolveStoredGoogleToken } = require("/tmp/unplan-google-auth-db-tests/google-token-service.js");

test("PostgreSQL isolates owners and serializes refresh and disconnect", async () => {
  const admin = new pg.Client({ connectionString: database.toString() });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  try {
    await admin.query(await readFile(new URL("../migrations/001-google-oauth.sql", import.meta.url), "utf8"));
    const key = randomBytes(32);
    const identity = JSON.stringify(["owner", "account"]);
    await withStoredGoogleAccount("owner", "account", async (_old, save) => save({
      id: "account", email: "person@example.test", status: "active",
      encryptedTokens: encryptGoogleTokens({ accessToken: "expired", refreshToken: "saved-refresh", expiresAt: 0 }, key, identity),
    }));
    assert.deepEqual(await listStoredGoogleAccounts("different-owner"), []);
    const crossOwner = await withStoredGoogleAccount("different-owner", "account", async (account) => account);
    assert.equal(crossOwner, null);
    const summaries = await listStoredGoogleAccounts("owner");
    assert.doesNotMatch(JSON.stringify(summaries), /encrypted|Token|saved-refresh|expired/);

    let refreshes = 0;
    const results = await Promise.all(Array.from({ length: 8 }, () => withStoredGoogleAccount("owner", "account", async (account, save) => {
      const resolved = await resolveStoredGoogleToken(account, { key, identity, refresh: async () => {
        refreshes += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { access_token: "fresh", expires_in: 3600 };
      } });
      if (resolved.account) await save(resolved.account);
      return resolved.accessToken;
    })));
    assert.equal(refreshes, 1);
    assert.deepEqual(results, Array(8).fill("fresh"));
    await withStoredGoogleAccount("owner", "account", async (account) => {
      assert.equal(decryptGoogleTokens(account.encryptedTokens, key, identity).refreshToken, "saved-refresh");
    });

    await withStoredGoogleAccount("owner", "account", async (_account, _save, client) => {
      await client.query("DELETE FROM unplan_google_accounts WHERE owner_id = $1 AND google_id = $2", ["owner", "account"]);
    });
    const afterDelete = await withStoredGoogleAccount("owner", "account", async (account) => account);
    assert.equal(afterDelete, null);
  } finally {
    await googleAuthPool().end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});

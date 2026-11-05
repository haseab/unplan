import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());
const database = new URL(process.env.DATABASE_URL || "postgresql://localhost:5432/unplan_oauth");
if (!["localhost", "127.0.0.1", "[::1]"].includes(database.hostname)) {
  throw new Error("Session route tests may only use the local development database");
}

test("session-authenticated routes isolate owners and delete the final connection", async () => {
  const client = new pg.Client({ connectionString: database.toString() });
  const namespace = `auth-route-test-${randomBytes(12).toString("hex")}`;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const base = "http://localhost:3004";
  const accountId = `${namespace}-account`;
  const headers = {
    Cookie: `unplan_session=${token}`,
    "X-Unplan-Google-Account": accountId,
    "X-Requested-With": "XmlHttpRequest",
    Origin: base,
  };
  await client.connect();
  try {
    await client.query("INSERT INTO unplan_sessions (token_hash, owner_id, expires_at) VALUES ($1, $2, now() + interval '5 minutes')", [tokenHash, namespace]);
    await client.query("INSERT INTO unplan_google_accounts (owner_id, google_id, email, status) VALUES ($1, $2, $3, 'expired')", [namespace, accountId, "session-test@example.test"]);

    const list = await fetch(base + "/api/google/accounts", { headers });
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), { accounts: [{ id: accountId, email: "session-test@example.test", status: "expired" }] });

    const other = await fetch(base + "/api/google/calendars?accountId=not-this-owner", {
      headers: { ...headers, "X-Unplan-Google-Account": "not-this-owner" },
    });
    assert.equal(other.status, 401);
    assert.equal((await other.json()).errorCode, "reconnect_required");

    const disconnect = await fetch(base + `/api/google/accounts?accountId=${accountId}`, { method: "DELETE", headers });
    assert.equal(disconnect.status, 200);
    assert.deepEqual(await disconnect.json(), { accounts: [] });
    assert.match(disconnect.headers.get("set-cookie"), /Max-Age=0/i);
    assert.match(disconnect.headers.get("set-cookie"), /HttpOnly/i);
    const remaining = await client.query("SELECT token_hash FROM unplan_sessions WHERE owner_id = $1", [namespace]);
    assert.equal(remaining.rowCount, 0);
  } finally {
    await client.query("DELETE FROM unplan_google_accounts WHERE owner_id = $1", [namespace]);
    await client.query("DELETE FROM unplan_sessions WHERE owner_id = $1", [namespace]);
    await client.end();
  }
});

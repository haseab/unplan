import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());
const database = new URL(process.env.DATABASE_URL || "postgresql://localhost:5432/unplan_oauth");
if (!["localhost", "127.0.0.1", "[::1]"].includes(database.hostname)) {
  throw new Error("Homepage route tests may only use the local development database");
}
const base = "http://localhost:3004";

test("public homepage and demo stay accessible without a Google session", async () => {
  const response = await fetch(base);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Make room/);
  for (const path of ["/demo", "/about", "/privacy", "/terms"]) {
    assert.ok(html.includes(`href="${path}"`), `homepage links to ${path}`);
    assert.equal((await fetch(base + path)).status, 200);
  }
  assert.match(html, /google-signin-light\.png/);
  const demo = await (await fetch(base + "/demo")).text();
  assert.match(demo, /Mini calendar/);
  assert.doesNotMatch(demo, /id="hero-title"/);
});

test("homepage validates the server session and renders without renewing cookies", async () => {
  const client = new pg.Client({ connectionString: database.toString() });
  const ownerId = `home-route-test-${randomBytes(12).toString("hex")}`;
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const headers = { Cookie: `unplan_session=${token}` };
  await client.connect();
  try {
    // A short lifetime exercises the renewal branch that cannot run in a Server Component.
    await client.query("INSERT INTO unplan_sessions (token_hash, owner_id, expires_at) VALUES ($1, $2, now() + interval '5 minutes')", [hash, ownerId]);
    await client.query("INSERT INTO unplan_google_accounts (owner_id, google_id, email, status) VALUES ($1, $2, $3, 'expired')", [ownerId, `${ownerId}-account`, "home-test@example.test"]);
    const connected = await fetch(base, { headers });
    assert.equal(connected.status, 200);
    assert.match(connected.headers.get("cache-control") || "", /no-store/);
    assert.match(await connected.text(), /Mini calendar/);
    assert.equal(connected.headers.get("set-cookie"), null);
    assert.match(await (await fetch(base)).text(), /id="hero-title"/, "a connected response must not leak into the anonymous homepage");
    const expiry = await client.query("SELECT expires_at FROM unplan_sessions WHERE token_hash = $1", [hash]);
    assert.ok(expiry.rows[0].expires_at.getTime() < Date.now() + 10 * 60_000, "page render must not renew the session");

    const demo = await fetch(base + "/demo", { headers });
    assert.equal(demo.status, 200);
    assert.match(await demo.text(), /Mini calendar/);

    await client.query("DELETE FROM unplan_google_accounts WHERE owner_id = $1", [ownerId]);
    assert.match(await (await fetch(base, { headers })).text(), /id="hero-title"/);
    await client.query("UPDATE unplan_sessions SET expires_at = now() - interval '1 minute' WHERE token_hash = $1", [hash]);
    assert.match(await (await fetch(base, { headers })).text(), /id="hero-title"/);
    const forged = { Cookie: `unplan_session=${randomBytes(32).toString("base64url")}` };
    assert.match(await (await fetch(base, { headers: forged })).text(), /id="hero-title"/);
  } finally {
    await client.query("DELETE FROM unplan_google_accounts WHERE owner_id = $1", [ownerId]);
    await client.query("DELETE FROM unplan_sessions WHERE owner_id = $1", [ownerId]);
    await client.end();
  }
});

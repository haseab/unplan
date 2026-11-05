import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for server-side Google OAuth");
}
const key = Buffer.from(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? "", "base64");
if (key.length !== 32 || key.toString("base64") !== process.env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
  throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(839102744)");
  await client.query(await readFile(resolve(fileURLToPath(new URL("../migrations/001-google-oauth.sql", import.meta.url))), "utf8"));
  await client.query("DELETE FROM unplan_sessions WHERE expires_at <= now()");
  await client.query("COMMIT");
  console.info("[GOOGLE:AUTH-STORE] Google OAuth schema is ready");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error("[GOOGLE:AUTH-STORE] Migration failed", { code: error?.code ?? "unknown" });
  process.exitCode = 1;
} finally {
  await client.end();
}

import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { googleAuthPool } from "./google-account-store";

const SESSION_LIFETIME_SECONDS = 180 * 24 * 60 * 60;
const secure = process.env.NODE_ENV === "production";
export const GOOGLE_SESSION_COOKIE = secure ? "__Host-unplan_session" : "unplan_session";
const FLOW_COOKIE = secure ? "__Host-unplan_oauth" : "unplan_oauth";
const cookieOptions = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export const readGoogleSession = async () => {
  const jar = await cookies();
  const token = jar.get(GOOGLE_SESSION_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const result = await googleAuthPool().query<{ ownerId: string; expiresAt: Date }>(
    'SELECT owner_id AS "ownerId", expires_at AS "expiresAt" FROM unplan_sessions WHERE token_hash = $1 AND expires_at > now()',
    [tokenHash(token)],
  );
  const session = result.rows[0];
  if (!session) return null;
  // Renew active sessions without writing on every Calendar API call.
  if (session.expiresAt.getTime() < Date.now() + (SESSION_LIFETIME_SECONDS - 24 * 60 * 60) * 1000) {
    await googleAuthPool().query("UPDATE unplan_sessions SET expires_at = $2 WHERE token_hash = $1", [
      tokenHash(token), new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000),
    ]);
    jar.set(GOOGLE_SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_LIFETIME_SECONDS });
  }
  return { ownerId: session.ownerId, tokenHash: tokenHash(token) };
};

export const createGoogleSession = async (ownerId: string, previousHash?: string) => {
  const token = randomBytes(32).toString("base64url");
  const client = await googleAuthPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO unplan_sessions (token_hash, owner_id, expires_at) VALUES ($1, $2, $3)", [
      tokenHash(token), ownerId, new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000),
    ]);
    if (previousHash) await client.query("DELETE FROM unplan_sessions WHERE token_hash = $1", [previousHash]);
    await client.query("DELETE FROM unplan_sessions WHERE expires_at <= now()");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  (await cookies()).set(GOOGLE_SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_LIFETIME_SECONDS });
};

export const clearGoogleSessions = async (ownerId: string) => {
  await googleAuthPool().query("DELETE FROM unplan_sessions WHERE owner_id = $1", [ownerId]);
  (await cookies()).set(GOOGLE_SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
};

export const startGoogleAuthorization = async () => {
  const challenge = randomBytes(32).toString("base64url");
  (await cookies()).set(FLOW_COOKIE, challenge, { ...cookieOptions, maxAge: 600 });
  return challenge;
};

export const consumeGoogleAuthorization = async (challenge: unknown) => {
  const jar = await cookies();
  const expected = jar.get(FLOW_COOKIE)?.value;
  jar.set(FLOW_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return typeof challenge === "string" && expected?.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(challenge)
    && /^[A-Za-z0-9_-]{43}$/.test(expected)
    && timingSafeEqual(Buffer.from(challenge), Buffer.from(expected));
};

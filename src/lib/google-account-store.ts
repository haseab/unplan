import "server-only";

import { Pool, type PoolClient } from "pg";
import type { GoogleAccountSummary } from "./google-auth-shared";

export type StoredGoogleAccount = GoogleAccountSummary & {
  encryptedTokens: string | null;
};

const shared = globalThis as typeof globalThis & { unplanAuthPool?: Pool };
export const googleAuthPool = () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!shared.unplanAuthPool) {
    shared.unplanAuthPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30_000,
    });
    shared.unplanAuthPool.on("error", () => {
      console.error("[GOOGLE:AUTH-STORE] Idle database connection failed");
    });
  }
  return shared.unplanAuthPool;
};

const selectAccount = `SELECT google_id AS id, email, status, encrypted_tokens AS "encryptedTokens"
  FROM unplan_google_accounts WHERE owner_id = $1 AND google_id = $2`;

export const listStoredGoogleAccounts = async (ownerId: string): Promise<GoogleAccountSummary[]> => {
  const result = await googleAuthPool().query<GoogleAccountSummary>(
    "SELECT google_id AS id, email, status FROM unplan_google_accounts WHERE owner_id = $1 ORDER BY google_id", [ownerId],
  );
  return result.rows;
};

export const saveStoredGoogleAccount = async (ownerId: string, account: StoredGoogleAccount, client = googleAuthPool() as Pool | PoolClient) => {
  await client.query(`INSERT INTO unplan_google_accounts (owner_id, google_id, email, status, encrypted_tokens)
    VALUES ($1, $2, $3, $4, $5) ON CONFLICT (owner_id, google_id) DO UPDATE SET
    email = EXCLUDED.email, status = EXCLUDED.status, encrypted_tokens = EXCLUDED.encrypted_tokens, updated_at = now()`,
  [ownerId, account.id, account.email, account.status, account.encryptedTokens]);
};

export const withStoredGoogleAccount = async <T>(
  ownerId: string,
  accountId: string,
  operation: (account: StoredGoogleAccount | null, save: (account: StoredGoogleAccount) => Promise<void>, client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await googleAuthPool().connect();
  try {
    await client.query("BEGIN");
    // Also lock absent rows, so reconnect and disconnect cannot race a refresh.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${ownerId}:${accountId}`]);
    const result = await client.query<StoredGoogleAccount>(`${selectAccount} FOR UPDATE`, [ownerId, accountId]);
    const value = await operation(result.rows[0] ?? null, (account) => saveStoredGoogleAccount(ownerId, account, client), client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};


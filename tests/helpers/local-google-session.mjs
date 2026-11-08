import { createHash, randomBytes } from 'node:crypto';
import nextEnv from '@next/env';
import pg from 'pg';

/** Isolated homepage session; fake credentials stay local and all provider traffic is mocked. */
export async function createLocalGoogleSession(context, baseURL) {
  nextEnv.loadEnvConfig(process.cwd());
  const local = hostname => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  const origin = new URL(baseURL);
  const database = new URL(process.env.DATABASE_URL || 'postgresql://localhost:5432/unplan_oauth');
  if (!local(origin.hostname) || !local(database.hostname)) {
    throw new Error('Browser session fixtures require a local app and local development database');
  }
  const client = new pg.Client({ connectionString: database.toString() });
  const owner = `browser-session-test-${randomBytes(12).toString('hex')}`;
  const token = randomBytes(32).toString('base64url');
  await client.connect();
  const cleanup = async () => {
    try {
      await client.query('DELETE FROM unplan_google_accounts WHERE owner_id = $1', [owner]);
      await client.query('DELETE FROM unplan_sessions WHERE owner_id = $1', [owner]);
    } finally { await client.end(); }
  };
  try {
    await client.query('INSERT INTO unplan_sessions (token_hash, owner_id, expires_at) VALUES ($1, $2, now() + interval \'30 minutes\')', [createHash('sha256').update(token).digest('hex'), owner]);
    await client.query('INSERT INTO unplan_google_accounts (owner_id, google_id, email, status) VALUES ($1, $2, $3, \'expired\')', [owner, owner, 'browser-fixture@example.test']);
    await context.addCookies([{ name: 'unplan_session', value: token, url: origin.origin, httpOnly: true, sameSite: 'Lax' }]);
    return cleanup;
  } catch (error) { await cleanup(); throw error; }
}

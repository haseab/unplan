import "server-only";
import { googleAuthPool, listStoredGoogleAccounts } from "./google-account-store";
import { selectAttentionAccounts, type AttentionCalendarAccount } from "./attention-calendar-accounts";

/** Resolve only the Google accounts explicitly configured for this integration. */
export async function attentionCalendarTargets(whitespaceAccount?: string): Promise<AttentionCalendarAccount[]> {
  const owner = whitespaceAccount ? undefined : process.env.ATTENTION_GOOGLE_OWNER_ID;
  const email = process.env.ATTENTION_GOOGLE_EMAIL;
  const emails = whitespaceAccount ? [whitespaceAccount] : [...new Set((process.env.ATTENTION_GOOGLE_EMAILS ?? "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean))].sort();
  if (!owner && !email && !emails.length) throw new Error("Configure the integration's Google accounts");
  if (emails.length) {
    if (emails.length > 10) throw new Error("Account limit reached");
    const result = await googleAuthPool().query<AttentionCalendarAccount>(
      'SELECT owner_id AS "ownerId", google_id AS id, email, status FROM unplan_google_accounts WHERE LOWER(email) = ANY($1::text[]) AND ($2::text IS NULL OR owner_id = $2)',
      [emails, owner ?? null],
    );
    return selectAttentionAccounts(result.rows, emails);
  }
  let ownerId = owner;
  if (!ownerId) {
    const result = await googleAuthPool().query<{ owner_id: string }>("SELECT DISTINCT owner_id FROM unplan_google_accounts WHERE LOWER(email) = LOWER($1)", [email]);
    if (result.rows.length !== 1) throw new Error("Configure an unambiguous Google account owner");
    ownerId = result.rows[0].owner_id;
  }
  const accounts = await listStoredGoogleAccounts(ownerId);
  if (!accounts.length || accounts.length > 10 || accounts.some((a) => a.status !== "active")) throw new Error("Reconnect Google in Unplan");
  return accounts.map((a) => ({ ...a, ownerId }));
}

export type AttentionCalendarAccount = {
  ownerId: string;
  id: string;
  email: string;
  status: string;
};

export class AttentionAccountSelectionError extends Error {
  constructor(readonly code: string) { super(code); }
}

export function selectAttentionAccounts(
  accounts: readonly AttentionCalendarAccount[],
  emails: readonly string[],
): AttentionCalendarAccount[] {
  const selected = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (!selected.length || selected.length > 10) throw new AttentionAccountSelectionError("calendar_account_limit");
  const commonOwners = [...new Set(accounts.map((account) => account.ownerId))].filter((owner) =>
    selected.every((email) => accounts.filter((account) => account.ownerId === owner && account.email.toLowerCase() === email).length === 1),
  );
  if (commonOwners.length > 1) throw new AttentionAccountSelectionError("calendar_accounts_ambiguous");
  const candidates = commonOwners.length === 1 ? accounts.filter((account) => account.ownerId === commonOwners[0]) : accounts;
  return selected.map((email) => {
    const matches = candidates.filter((account) => account.email.toLowerCase() === email);
    if (!matches.length) throw new AttentionAccountSelectionError("calendar_account_missing");
    if (matches.length !== 1) throw new AttentionAccountSelectionError("calendar_accounts_ambiguous");
    if (matches[0].status !== "active") throw new AttentionAccountSelectionError("calendar_reconnect_required");
    return matches[0];
  });
}

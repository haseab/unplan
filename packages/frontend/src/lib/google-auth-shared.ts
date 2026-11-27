export const GOOGLE_ACCOUNT_HEADER = "X-Unplan-Google-Account";
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist",
] as const;

export type GoogleAccountSummary = {
  email: string;
  id: string;
  status: "active" | "expired" | "revoked";
};

export const hasRequiredGoogleScopes = (scope: string) => {
  const granted = new Set(scope.split(/\s+/));
  return granted.has("https://www.googleapis.com/auth/calendar")
    || GOOGLE_SCOPES.slice(2).every((required) => granted.has(required));
};

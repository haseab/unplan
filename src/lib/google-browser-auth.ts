"use client";

import { GOOGLE_ACCOUNT_HEADER, GOOGLE_SCOPES, type GoogleAccountSummary } from "./google-auth-shared";
import { parseGoogleCalendarSourceId } from "./google-source-id";

const GOOGLE_ACCOUNTS_STORAGE_KEY = "unplan:google-accounts:v2";
const LEGACY_GOOGLE_ACCOUNTS_STORAGE_KEY = "unplan:google-accounts:v1";
const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";

export type BrowserGoogleAccount = GoogleAccountSummary;
export type GoogleConnectedAccount = GoogleAccountSummary & { provider: "google" };

type GoogleCodeResponse = { code?: string; error?: string; error_description?: string };
type GoogleCodeClient = { requestCode: () => void };

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient: (config: {
            callback: (response: GoogleCodeResponse) => void;
            client_id: string;
            error_callback?: (error: { message?: string; type?: string }) => void;
            include_granted_scopes?: boolean;
            select_account?: boolean;
            scope: string;
            ux_mode?: "popup" | "redirect";
          }) => GoogleCodeClient;
        };
      };
    };
  }
}

const accountSummary = (value: unknown): BrowserGoogleAccount | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<BrowserGoogleAccount>;
  if (typeof candidate.id !== "string" || typeof candidate.email !== "string") return null;
  return {
    id: candidate.id,
    email: candidate.email,
    status: candidate.status === "active" || candidate.status === "revoked" ? candidate.status : "expired",
  };
};

export const readGoogleAccounts = (): BrowserGoogleAccount[] => {
  if (typeof window === "undefined") return [];
  try {
    const serialized = window.localStorage.getItem(GOOGLE_ACCOUNTS_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_GOOGLE_ACCOUNTS_STORAGE_KEY) ?? "[]";
    const parsed: unknown = JSON.parse(serialized);
    return Array.isArray(parsed) ? parsed.flatMap((value) => {
      const summary = accountSummary(value);
      return summary ? [summary] : [];
    }) : [];
  } catch {
    return [];
  }
};

const writeGoogleAccounts = (accounts: BrowserGoogleAccount[]) => {
  // Only metadata crosses this boundary; never store Google credentials.
  window.localStorage.setItem(GOOGLE_ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts.map(({ id, email, status }) => ({ id, email, status }))));
  window.localStorage.removeItem(LEGACY_GOOGLE_ACCOUNTS_STORAGE_KEY);
};

export const loadGoogleAccounts = async () => {
  const response = await fetch("/api/google/accounts", { credentials: "same-origin", cache: "no-store" });
  const data = await response.json().catch(() => null) as { accounts?: unknown[]; error?: string } | null;
  if (!response.ok || !Array.isArray(data?.accounts)) {
    throw new Error(data?.error || "Google accounts could not be loaded. Try again shortly.");
  }
  const accounts = data.accounts.flatMap((value) => {
    const summary = accountSummary(value);
    return summary ? [summary] : [];
  });
  writeGoogleAccounts(accounts);
  return accounts;
};

export const googleAuthorizedFetch = async (
  accountId: string,
  input: RequestInfo | URL,
  init: RequestInit = {},
) => {
  const origin = typeof window !== "undefined" ? window.location?.origin ?? "http://localhost" : "http://localhost";
  const url = new URL(input instanceof Request ? input.url : String(input), origin);
  if (url.origin !== origin || !url.pathname.startsWith("/api/google/")) {
    throw new Error("Google requests must use Unplan's own API");
  }
  const headers = new Headers(init.headers);
  headers.delete("Authorization");
  headers.set(GOOGLE_ACCOUNT_HEADER, accountId);
  headers.set("X-Requested-With", "XmlHttpRequest");
  const response = await fetch(input, { ...init, cache: "no-store", credentials: "same-origin", headers });
  if (response.status === 401) expireGoogleAccount(accountId);
  return response;
};

export const googleCalendarAuthorizedFetch = (
  calendarSourceId: string,
  input: RequestInfo | URL,
  init: RequestInit = {},
) => {
  const source = parseGoogleCalendarSourceId(calendarSourceId);
  if (!source) throw new Error("Google calendar identity is invalid");
  return googleAuthorizedFetch(source.accountId, input, init);
};

export const removeGoogleAccount = async (accountId: string) => {
  const response = await fetch(`/api/google/accounts?accountId=${encodeURIComponent(accountId)}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "X-Requested-With": "XmlHttpRequest" },
  });
  const data = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(data?.error || "Google account could not be disconnected");
  writeGoogleAccounts(readGoogleAccounts().filter((account) => account.id !== accountId));
};

export const expireGoogleAccount = (accountId: string) => {
  writeGoogleAccounts(readGoogleAccounts().map((account) =>
    account.id === accountId ? { ...account, status: "expired" } : account,
  ));
};

let googleIdentityLoad: Promise<void> | null = null;

export const loadGoogleIdentity = () => {
  if (window.google?.accounts.oauth2) {
    return Promise.resolve();
  }
  if (googleIdentityLoad) return googleIdentityLoad;

  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${GOOGLE_IDENTITY_SCRIPT}"]`,
  );
  existing?.remove();

  const script = document.createElement("script");
  const pending = new Promise<void>((resolve, reject) => {
    const fail = (message: string) => {
      script.remove();
      reject(new Error(message));
    };
    script.addEventListener("load", () => {
      if (window.google?.accounts.oauth2) resolve();
      else fail("Google Identity Services did not initialize");
    }, { once: true });
    script.addEventListener("error", () => {
      fail("Could not load Google Identity Services");
    }, { once: true });
    script.async = true;
    script.defer = true;
    script.src = GOOGLE_IDENTITY_SCRIPT;
    document.head.appendChild(script);
  });
  googleIdentityLoad = pending;
  void pending.finally(() => {
    if (googleIdentityLoad === pending) googleIdentityLoad = null;
  }).catch(() => undefined);
  return pending;
};


export const connectGoogleAccount = async () => {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  if (!clientId) throw new Error("Google sign-in is not configured");
  await loadGoogleIdentity();
  const start = await fetch("/api/google/oauth/start", {
    method: "POST",
    credentials: "same-origin",
    headers: { "X-Requested-With": "XmlHttpRequest" },
  });
  const flow = await start.json().catch(() => null) as { challenge?: string; error?: string } | null;
  if (!start.ok || !flow?.challenge) throw new Error(flow?.error || "Google sign-in could not start");

  return new Promise<BrowserGoogleAccount>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope: GOOGLE_SCOPES.join(" "),
      include_granted_scopes: false,
      error_callback: (error) => reject(new Error(error.message || error.type || "Google connection failed")),
      select_account: true,
      ux_mode: "popup",
      callback: (response) => {
        if (!response.code) {
          reject(new Error(response.error_description || response.error || "Google connection failed"));
          return;
        }
        void (async () => {
          const exchange = await fetch("/api/google/oauth/token", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", "X-Requested-With": "XmlHttpRequest" },
            body: JSON.stringify({ code: response.code, challenge: flow.challenge }),
          });
          const data = await exchange.json().catch(() => null) as { account?: unknown; error?: string } | null;
          const account = accountSummary(data?.account);
          if (!exchange.ok || !account) throw new Error(data?.error || "Google connection failed");
          writeGoogleAccounts([...readGoogleAccounts().filter((candidate) => candidate.id !== account.id), account]);
          return account;
        })().then(resolve, reject);
      },
    });
    client.requestCode();
  });
};

"use client";

import { parseGoogleCalendarSourceId } from "./google-source-id";

const GOOGLE_ACCOUNTS_STORAGE_KEY = "unplan:google-accounts:v1";
const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";
const GOOGLE_SCOPE = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar",
].join(" ");

export type BrowserGoogleAccount = {
  accessToken: string;
  email: string;
  expiresAt: number;
  id: string;
};

export type GoogleConnectedAccount = {
  email: string;
  id: string;
  provider: "google";
  status: "active" | "expired" | "revoked";
};

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
};

type GoogleTokenClient = {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            callback: (response: GoogleTokenResponse) => void;
            client_id: string;
            error_callback?: (error: { message?: string; type?: string }) => void;
            scope: string;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

const isAccount = (value: unknown): value is BrowserGoogleAccount => {
  if (!value || typeof value !== "object") return false;
  const account = value as Partial<BrowserGoogleAccount>;
  return typeof account.accessToken === "string"
    && typeof account.email === "string"
    && typeof account.expiresAt === "number"
    && typeof account.id === "string";
};

export const readGoogleAccounts = (): BrowserGoogleAccount[] => {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(GOOGLE_ACCOUNTS_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isAccount) : [];
  } catch {
    return [];
  }
};

const writeGoogleAccounts = (accounts: BrowserGoogleAccount[]) => {
  window.localStorage.setItem(GOOGLE_ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
};

export const activeGoogleAccounts = () =>
  readGoogleAccounts().filter((account) => account.expiresAt > Date.now() + 30_000);

export const googleAccessToken = (accountId: string) => {
  const account = readGoogleAccounts().find((candidate) => candidate.id === accountId);
  return account && account.expiresAt > Date.now() + 30_000
    ? account.accessToken
    : null;
};

export const googleAuthorizedFetch = (
  accountId: string,
  input: RequestInfo | URL,
  init: RequestInit = {},
) => {
  const token = googleAccessToken(accountId);
  if (!token) throw new Error("Google authorization expired. Reconnect your account.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
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

export const removeGoogleAccount = (accountId: string) => {
  writeGoogleAccounts(readGoogleAccounts().filter((account) => account.id !== accountId));
};

export const expireGoogleAccount = (accountId: string) => {
  writeGoogleAccounts(readGoogleAccounts().map((account) =>
    account.id === accountId ? { ...account, expiresAt: 0 } : account,
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

const loadGoogleProfile = async (accessToken: string) => {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = await response.json().catch(() => ({})) as {
    email?: string;
    sub?: string;
  };
  if (!response.ok || !profile.email) {
    throw new Error("Google did not return an account email");
  }
  return { email: profile.email, id: profile.sub || profile.email };
};

export const connectGoogleAccount = async () => {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  if (!clientId) throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured");
  await loadGoogleIdentity();

  return new Promise<BrowserGoogleAccount>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPE,
      error_callback: (error) => reject(new Error(error.message || error.type || "Google connection failed")),
      callback: (response) => {
        if (!response.access_token) {
          reject(new Error(response.error_description || response.error || "Google connection failed"));
          return;
        }
        void loadGoogleProfile(response.access_token).then((profile) => {
          const account: BrowserGoogleAccount = {
            ...profile,
            accessToken: response.access_token!,
            expiresAt: Date.now() + (response.expires_in ?? 3_600) * 1000,
          };
          const accounts = readGoogleAccounts();
          const existingIndex = accounts.findIndex((candidate) => candidate.id === account.id);
          if (existingIndex >= 0) accounts[existingIndex] = account;
          else accounts.push(account);
          writeGoogleAccounts(accounts);
          resolve(account);
        }, reject);
      },
    });
    client.requestAccessToken({ prompt: "select_account" });
  });
};

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
  refreshToken?: string;
};

export type GoogleConnectedAccount = {
  email: string;
  id: string;
  provider: "google";
  status: "active" | "expired" | "revoked";
};

type GoogleCodeResponse = {
  code?: string;
  error?: string;
  error_description?: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
  refresh_token?: string;
};

type GoogleCodeClient = {
  requestCode: () => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient: (config: {
            callback: (response: GoogleCodeResponse) => void;
            client_id: string;
            error_callback?: (error: { message?: string; type?: string }) => void;
            select_account?: boolean;
            scope: string;
            ux_mode?: "popup" | "redirect";
          }) => GoogleCodeClient;
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

const tokenRefreshes = new Map<string, Promise<string>>();

const tokenError = (data: GoogleTokenResponse, fallback: string) =>
  data.error_description || data.error || fallback;

const exchangeGoogleToken = async (body: {
  code?: string;
  grantType: "authorization_code" | "refresh_token";
  redirectUri?: string;
  refreshToken?: string;
}) => {
  const response = await fetch("/api/google/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XmlHttpRequest",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as GoogleTokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(tokenError(data, "Google authorization could not be refreshed"));
  }
  return data;
};

export const refreshGoogleAccount = async (accountId: string) => {
  const existingRefresh = tokenRefreshes.get(accountId);
  if (existingRefresh) return existingRefresh;

  const refresh = (async () => {
    const account = readGoogleAccounts().find((candidate) => candidate.id === accountId);
    if (!account?.refreshToken) {
      throw new Error("Google authorization expired. Reconnect your account once to enable automatic refresh.");
    }
    const response = await exchangeGoogleToken({
      grantType: "refresh_token",
      refreshToken: account.refreshToken,
    });
    const refreshed: BrowserGoogleAccount = {
      ...account,
      accessToken: response.access_token!,
      expiresAt: Date.now() + (response.expires_in ?? 3_600) * 1000,
      refreshToken: response.refresh_token || account.refreshToken,
    };
    writeGoogleAccounts(readGoogleAccounts().map((candidate) =>
      candidate.id === accountId ? refreshed : candidate,
    ));
    return refreshed.accessToken;
  })();

  tokenRefreshes.set(accountId, refresh);
  try {
    return await refresh;
  } catch (error) {
    writeGoogleAccounts(readGoogleAccounts().map((account) =>
      account.id === accountId
        ? { ...account, expiresAt: 0, refreshToken: undefined }
        : account,
    ));
    throw error;
  } finally {
    if (tokenRefreshes.get(accountId) === refresh) tokenRefreshes.delete(accountId);
  }
};

export const googleAuthorizedFetch = async (
  accountId: string,
  input: RequestInfo | URL,
  init: RequestInit = {},
) => {
  const token = googleAccessToken(accountId) ?? await refreshGoogleAccount(accountId);
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
    const client = window.google!.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope: GOOGLE_SCOPE,
      error_callback: (error) => reject(new Error(error.message || error.type || "Google connection failed")),
      select_account: true,
      ux_mode: "popup",
      callback: (response) => {
        if (!response.code) {
          reject(new Error(response.error_description || response.error || "Google connection failed"));
          return;
        }
        void exchangeGoogleToken({
          code: response.code,
          grantType: "authorization_code",
          redirectUri: window.location.origin,
        }).then(async (tokens) => {
          const profile = await loadGoogleProfile(tokens.access_token!);
          const accounts = readGoogleAccounts();
          const existing = accounts.find((candidate) => candidate.id === profile.id);
          const refreshToken = tokens.refresh_token || existing?.refreshToken;
          if (!refreshToken) {
            throw new Error("Google did not issue a refresh token. Remove Unplan from your Google account permissions, then reconnect.");
          }
          const account: BrowserGoogleAccount = {
            ...profile,
            accessToken: tokens.access_token!,
            expiresAt: Date.now() + (tokens.expires_in ?? 3_600) * 1000,
            refreshToken,
          };
          const existingIndex = accounts.findIndex((candidate) => candidate.id === account.id);
          if (existingIndex >= 0) accounts[existingIndex] = account;
          else accounts.push(account);
          writeGoogleAccounts(accounts);
          resolve(account);
        }, reject);
      },
    });
    client.requestCode();
  });
};

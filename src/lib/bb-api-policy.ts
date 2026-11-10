import { createHash, timingSafeEqual } from "node:crypto";
export const bbApiAuthorized = (authorization: string | null, secret: string | undefined) => {
  if (!secret || secret.length < 32) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(authorization ?? ""), digest(`Bearer ${secret}`));
};
export type BbApiInput = { path: string; method: string; headers: Record<string, string>; body?: string };
export const parseBbApiInput = (value: unknown): BbApiInput | null => {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<BbApiInput>;
  if (typeof input.path !== "string" || input.path.length > 32000 || !input.path.startsWith("/api/") ||
      typeof input.method !== "string" || !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(input.method) ||
      (input.body !== undefined && (typeof input.body !== "string" || input.body.length > 2_000_000)) ||
      (input.method === "GET" && input.body !== undefined)) return null;
  try {
    const url = new URL(input.path, "https://unplan.invalid");
    if (url.origin !== "https://unplan.invalid" || url.hash) return null;
    const headers: Record<string, string> = {};
    if (input.headers && typeof input.headers === "object") for (const [key, value] of Object.entries(input.headers)) {
      if (typeof value === "string" && ["content-type", "x-unplan-google-account"].includes(key.toLowerCase())) headers[key.toLowerCase()] = value;
    }
    return { path: url.pathname + url.search, method: input.method, headers, ...(input.body !== undefined ? { body: input.body } : {}) };
  } catch { return null; }
};

export const selectBbApiAccount = <T extends { id: string; ownerId: string }>(accounts: T[], accountId: string | null | undefined): T | null => {
  if (!accountId || accountId.length > 255) return null;
  return accounts.find(account => account.id === accountId) ?? null;
};

import "server-only";

import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

export type RateLimitPolicy = {
  identity?: string;
  limit: number;
  scope: string;
  windowMs: number;
};

type RateLimitEntry = { count: number; expiresAt: number };

const globalRateLimits = globalThis as typeof globalThis & {
  unplanRateLimits?: Map<string, RateLimitEntry>;
};
const rateLimits = globalRateLimits.unplanRateLimits ??= new Map();

const hashKey = (value: string) =>
  createHash("sha256").update(value).digest("base64url");

export const requestClientKey = (request: Request | NextRequest) => {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || forwarded
    || "unknown";
  return hashKey(address.slice(0, 128));
};

export const consumeRateLimit = async ({
  identity,
  limit,
  scope,
  windowMs,
}: RateLimitPolicy) => {
  const key = `${scope}:${hashKey(identity ?? "global")}`;
  const now = Date.now();
  const current = rateLimits.get(key);
  const next = !current || current.expiresAt <= now
    ? { count: 1, expiresAt: now + windowMs }
    : { count: current.count + 1, expiresAt: current.expiresAt };
  rateLimits.set(key, next);

  if (rateLimits.size > 2_000) {
    for (const [candidateKey, entry] of rateLimits) {
      if (entry.expiresAt <= now) rateLimits.delete(candidateKey);
    }
  }

  return {
    allowed: next.count <= limit,
    limit,
    remaining: Math.max(limit - next.count, 0),
    resetAt: next.expiresAt,
  };
};

export const enforceRateLimit = async (
  request: Request | NextRequest,
  policy: Omit<RateLimitPolicy, "identity"> & { identity?: string },
) => {
  const result = await consumeRateLimit({
    ...policy,
    identity: policy.identity ?? requestClientKey(request),
  });
  if (result.allowed) return null;
  const retryAfter = Math.max(Math.ceil((result.resetAt - Date.now()) / 1000), 1);
  return Response.json(
    { error: "Too many requests" },
    {
      headers: {
        "RateLimit-Limit": String(result.limit),
        "RateLimit-Remaining": "0",
        "RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
        "Retry-After": String(retryAfter),
      },
      status: 429,
    },
  );
};

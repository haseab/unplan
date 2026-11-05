import assert from "node:assert/strict";
import test from "node:test";
import { GoogleOAuthError, requestGoogleTokens } from "./google-oauth-provider";

const parameters = () => new URLSearchParams({ grant_type: "refresh_token", refresh_token: "fake-private-token" });
const noWait = async () => undefined;

test("refresh retries network failures and 429 responses before succeeding", async () => {
  let calls = 0;
  const result = await requestGoogleTokens(parameters(), { wait: noWait, fetcher: async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("offline");
    if (calls === 2) return Response.json({ error: "temporarily_unavailable" }, { status: 429 });
    return Response.json({ access_token: "new-token", expires_in: 3600 });
  } });
  assert.equal(calls, 3);
  assert.equal(result.access_token, "new-token");
});

test("exhausted transient failures never require reconnection", async () => {
  let calls = 0;
  await assert.rejects(requestGoogleTokens(parameters(), { wait: noWait, fetcher: async () => {
    calls += 1;
    return Response.json({ error: "server_error" }, { status: 503 });
  } }), (error: unknown) => error instanceof GoogleOAuthError && error.status === 503 && !error.requiresReconnect);
  assert.equal(calls, 3);
});

test("a truncated successful response is retried as a temporary failure", async () => {
  let calls = 0;
  const result = await requestGoogleTokens(parameters(), { wait: noWait, fetcher: async () => {
    calls += 1;
    return calls === 1 ? new Response("{truncated", { status: 200 })
      : Response.json({ access_token: "new-token", expires_in: 3600 });
  } });
  assert.equal(calls, 2);
  assert.equal(result.access_token, "new-token");
});

test("only a terminal invalid_grant requires reconnection", async () => {
  for (const code of ["invalid_grant", "invalid_client", "invalid_request"]) {
    let calls = 0;
    await assert.rejects(requestGoogleTokens(parameters(), { wait: noWait, fetcher: async () => {
      calls += 1;
      return Response.json({ error: code }, { status: 400 });
    } }), (error: unknown) => error instanceof GoogleOAuthError && error.requiresReconnect === (code === "invalid_grant"));
    assert.equal(calls, 1);
  }
});

test("authorization codes are not retried because they are single use", async () => {
  let calls = 0;
  await assert.rejects(requestGoogleTokens(new URLSearchParams({ grant_type: "authorization_code", code: "fake-code" }), {
    wait: noWait,
    fetcher: async () => { calls += 1; throw new TypeError("network interrupted"); },
  }));
  assert.equal(calls, 1);
});

test("OAuth diagnostics exclude credentials and untrusted error descriptions", async () => {
  const originalWarn = console.warn;
  const diagnostics: unknown[][] = [];
  console.warn = (...args: unknown[]) => { diagnostics.push(args); };
  try {
    await assert.rejects(requestGoogleTokens(parameters(), { wait: noWait, fetcher: async () => Response.json({
      error: "fake-private-token", error_description: "fake-client-secret", refresh_token: "fake-refresh-secret",
    }, { status: 400 }) }));
    assert.ok(diagnostics.length);
    assert.doesNotMatch(JSON.stringify(diagnostics), /fake-private-token|fake-client-secret|fake-refresh-secret/);
  } finally {
    console.warn = originalWarn;
  }
});

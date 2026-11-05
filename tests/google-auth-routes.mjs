import assert from "node:assert/strict";
import test from "node:test";

const base = "http://localhost:3004";
const post = (path, body, headers = {}) => fetch(base + path, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});
const trusted = { Origin: base, "X-Requested-With": "XmlHttpRequest" };

test("OAuth rejects requests without same-origin protection", async () => {
  assert.equal((await post("/api/google/oauth/start", {})).status, 403);
  assert.equal((await post("/api/google/oauth/start", {}, { ...trusted, Origin: "https://evil.example" })).status, 403);
  assert.equal((await post("/api/google/oauth/token", { code: "fake-code" })).status, 403);
});

test("OAuth start issues an HttpOnly challenge but no provider credentials", async () => {
  const response = await post("/api/google/oauth/start", {}, trusted);
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=lax/i);
  assert.match(cookie, /Max-Age=600/i);
  const data = await response.json();
  assert.match(data.challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(JSON.stringify(data), /access_token|refresh_token|client_secret/);
  const invalid = await post("/api/google/oauth/token", { code: "fake-code", challenge: "x".repeat(43) }, {
    ...trusted, Cookie: cookie.split(";")[0],
  });
  assert.equal(invalid.status, 400);
});

test("anonymous requests and legacy bearer tokens cannot access stored Google credentials", async () => {
  const accounts = await fetch(base + "/api/google/accounts");
  assert.equal(accounts.status, 200);
  assert.equal(accounts.headers.get("cache-control"), "no-store");
  assert.deepEqual(await accounts.json(), { accounts: [] });
  const response = await fetch(base + "/api/google/calendars?accountId=someone-else", {
    headers: { "X-Unplan-Google-Account": "someone-else", Authorization: "Bearer legacy-token" },
  });
  assert.equal(response.status, 401);
  assert.doesNotMatch(await response.text(), /legacy-token|access_token|refresh_token/);
});

test("cross-origin calendar writes and disconnects are rejected", async () => {
  const response = await fetch(base + "/api/google/calendars", {
    method: "PATCH",
    headers: { ...trusted, Origin: "https://evil.example", "Content-Type": "application/json" },
    body: JSON.stringify({ calendarSourceId: "google|someone|primary", selected: false }),
  });
  assert.equal(response.status, 403);
  const disconnect = await fetch(base + "/api/google/accounts?accountId=someone", {
    method: "DELETE", headers: { ...trusted, Origin: "https://evil.example" },
  });
  assert.equal(disconnect.status, 403);
});

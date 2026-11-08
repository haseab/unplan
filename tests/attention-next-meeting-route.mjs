import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadModule(path, overrides = {}) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)((name) => overrides[name] ?? require(name), loaded, loaded.exports);
  return loaded.exports;
}
const links = loadModule("../src/lib/next-calendar-call.ts");
const meeting = loadModule("../src/lib/attention-next-meeting.ts", { "./next-calendar-call": links });
const accountSelection = loadModule("../src/lib/attention-calendar-accounts.ts");

test("calendar integration isolates owners, follows pages, respects visibility, caches and fails closed", async () => {
  const savedKey = process.env.ATTENTION_API_KEY, savedOwner = process.env.ATTENTION_GOOGLE_OWNER_ID;
  const originalFetch = globalThis.fetch;
  const key = "read-only-calendar-key-".repeat(3);
  process.env.ATTENTION_API_KEY = key;
  process.env.ATTENTION_GOOGLE_OWNER_ID = "owner-one";
  const now = Date.now();
  const event = (title, hours) => ({ summary: title, start: { dateTime: new Date(now + hours * 3600000).toISOString() }, end: { dateTime: new Date(now + (hours + 1) * 3600000).toISOString() }, hangoutLink: "https://meet.google.com/abc" });
  const calls = [];
  let fail = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(url);
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer private-google-token");
    if (fail) return Response.json({ error: "private provider failure" }, { status: 500 });
    if (url.pathname.endsWith("/calendarList")) return Response.json({ items: [{ id: "visible", selected: true }, { id: "hidden", selected: false, primary: true }] });
    assert.match(url.pathname, /visible/);
    assert.equal(url.searchParams.get("singleEvents"), "true");
    assert.equal(url.searchParams.get("orderBy"), "startTime");
    if (!url.searchParams.has("pageToken")) return Response.json({ items: [{ ...event("Declined", 1), attendees: [{ self: true, responseStatus: "declined" }] }], nextPageToken: "next" });
    return Response.json({ items: [event("Team sync", 2), event("Later", 3)] });
  };
  const { GET } = loadModule("../src/app/api/integrations/next-meeting/route.ts", {
    "@/lib/google-account-store": { listStoredGoogleAccounts: async (owner) => { assert.equal(owner, process.env.ATTENTION_GOOGLE_OWNER_ID); return [{ id: "account-one", status: "active" }]; } },
    "@/lib/google-auth-server": { serverGoogleAccessToken: async (owner, account) => { assert.equal(owner, process.env.ATTENTION_GOOGLE_OWNER_ID); assert.equal(account, "account-one"); return "private-google-token"; } },
    "@/lib/attention-next-meeting": meeting,
    "@/lib/attention-calendar-accounts": accountSelection,
  });
  const request = (token = key) => new Request("https://unplan.io/api/integrations/next-meeting", { headers: { Authorization: `Bearer ${token}` } });
  try {
    assert.equal((await GET(request("wrong"))).status, 401);
    assert.equal(calls.length, 0);
    const response = await GET(request());
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    const data = await response.json(); assert.equal(data.meeting.title, "Team sync");
    assert.deepEqual(Object.keys(data.meeting).sort(), ["end", "start", "title", "url"]);
    assert.equal(calls.length, 3);
    await GET(request()); assert.equal(calls.length, 3);
    assert.equal((await GET(request("wrong"))).status, 401);
    process.env.ATTENTION_GOOGLE_OWNER_ID = "owner-two"; fail = true;
    const failed = await GET(request()); assert.equal(failed.status, 503);
    assert.doesNotMatch(await failed.text(), /private-google-token|private provider failure/);
  } finally {
    globalThis.fetch = originalFetch;
    if (savedKey === undefined) delete process.env.ATTENTION_API_KEY; else process.env.ATTENTION_API_KEY = savedKey;
    if (savedOwner === undefined) delete process.env.ATTENTION_GOOGLE_OWNER_ID; else process.env.ATTENTION_GOOGLE_OWNER_ID = savedOwner;
  }
});

test("email configuration must resolve to exactly one owner", async () => {
  const previous = Object.fromEntries(["ATTENTION_API_KEY", "ATTENTION_GOOGLE_OWNER_ID", "ATTENTION_GOOGLE_EMAIL"].map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  process.env.ATTENTION_API_KEY = "read-only-key-".repeat(4);
  process.env.ATTENTION_GOOGLE_EMAIL = "owner@example.test";
  delete process.env.ATTENTION_GOOGLE_OWNER_ID;
  let rows = [];
  let tokenCalls = 0;
  globalThis.fetch = async () => Response.json({ items: [] });
  const { GET } = loadModule("../src/app/api/integrations/next-meeting/route.ts", {
    "@/lib/google-account-store": {
      googleAuthPool: () => ({ query: async (_sql, values) => { assert.deepEqual(values, ["owner@example.test"]); return { rows }; } }),
      listStoredGoogleAccounts: async (owner) => { assert.equal(owner, "selected-owner"); return [{ id: "account", status: "active" }]; },
    },
    "@/lib/google-auth-server": { serverGoogleAccessToken: async () => { tokenCalls++; return "google-token"; } },
    "@/lib/attention-next-meeting": meeting,
    "@/lib/attention-calendar-accounts": accountSelection,
  });
  const request = () => new Request("https://unplan.io/api/integrations/next-meeting?owner=caller-cannot-choose", { headers: { Authorization: `Bearer ${process.env.ATTENTION_API_KEY}` } });
  try {
    assert.equal((await GET(request())).status, 503);
    rows = [{ owner_id: "a" }, { owner_id: "b" }];
    assert.equal((await GET(request())).status, 503);
    assert.equal(tokenCalls, 0);
    rows = [{ owner_id: "selected-owner" }];
    const response = await GET(request()); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { meeting: null });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});

test("searches both configured Google accounts and returns the earlier meeting across owners", async () => {
  const names = ["ATTENTION_API_KEY", "ATTENTION_GOOGLE_OWNER_ID", "ATTENTION_GOOGLE_EMAIL", "ATTENTION_GOOGLE_EMAILS"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const key = "two-calendar-integration-".repeat(3);
  process.env.ATTENTION_API_KEY = key;
  process.env.ATTENTION_GOOGLE_EMAILS = "hullah3000@gmail.com,haseab@f.inc";
  delete process.env.ATTENTION_GOOGLE_OWNER_ID;
  delete process.env.ATTENTION_GOOGLE_EMAIL;
  const tokens = [];
  const now = Date.now();
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const personal = new Headers(init.headers).get("Authorization") === "Bearer personal-token";
    if (url.pathname.endsWith("/calendarList")) return Response.json({ items: [{ id: personal ? "personal-calendar" : "work-calendar", selected: true }] });
    const start = now + (personal ? 1 : 5) * 3600000;
    return Response.json({ items: [{ summary: personal ? "Personal meeting" : "Work meeting", start: { dateTime: new Date(start).toISOString() }, end: { dateTime: new Date(start + 3600000).toISOString() }, hangoutLink: "https://meet.google.com/abc" }] });
  };
  const { GET } = loadModule("../src/app/api/integrations/next-meeting/route.ts", {
    "@/lib/google-account-store": {
      googleAuthPool: () => ({ query: async (_sql, values) => {
        assert.deepEqual(values, [["haseab@f.inc", "hullah3000@gmail.com"], null]);
        return { rows: [
          { ownerId: "work-owner", id: "work-account", email: "haseab@f.inc", status: "active" },
          { ownerId: "personal-owner", id: "personal-account", email: "hullah3000@gmail.com", status: "active" },
        ] };
      } }),
      listStoredGoogleAccounts: async () => { throw new Error("Unspecified accounts must not be loaded"); },
    },
    "@/lib/google-auth-server": { serverGoogleAccessToken: async (owner, account) => { tokens.push([owner, account]); return owner === "personal-owner" ? "personal-token" : "work-token"; } },
    "@/lib/attention-next-meeting": meeting,
    "@/lib/attention-calendar-accounts": accountSelection,
  });
  try {
    const response = await GET(new Request("https://unplan.io/api/integrations/next-meeting", { headers: { Authorization: `Bearer ${key}` } }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).meeting.title, "Personal meeting");
    assert.deepEqual(tokens, [["work-owner", "work-account"], ["personal-owner", "personal-account"]]);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});

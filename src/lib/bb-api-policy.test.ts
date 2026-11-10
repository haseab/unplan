import assert from "node:assert/strict";
import test from "node:test";
import { bbApiAuthorized, parseBbApiInput, selectBbApiAccount } from "./bb-api-policy";
import { bbApiOwner, withBbApiOwner } from "./bb-api-context";
test("the write bridge requires its dedicated long key", () => {
  const key = "native-api-".repeat(6);
  assert.equal(bbApiAuthorized(`Bearer ${key}`, key), true);
  assert.equal(bbApiAuthorized(`Bearer ${key}wrong`, key), false);
  assert.equal(bbApiAuthorized(null, key), false);
  assert.equal(bbApiAuthorized("Bearer short", "short"), false);
  assert.equal(bbApiAuthorized("Bearer anything", undefined), false);
});
test("client input cannot supply credentials, cookie sessions, origins or arbitrary servers", () => {
  const input = parseBbApiInput({ path: "/api/google/events?sourceId=one", method: "PATCH", body: "{}", headers: { Cookie: "one", Authorization: "two", Origin: "https://evil.test", "X-Unplan-Todoist-Token": "three", "X-Unplan-Google-Account": "google-account" } });
  assert.deepEqual(input?.headers, { "x-unplan-google-account": "google-account" });
  for (const path of ["https://evil.test/api/google/events", "//evil.test/api/google/events", "/api/google/events#fragment"]) assert.equal(parseBbApiInput({ path, method: "GET" }), null);
  assert.equal(parseBbApiInput({ path: "/api/google/events", method: "GET", body: "{}" }), null);
  assert.equal(parseBbApiInput({ path: "/api/google/events", method: "POST", body: "x".repeat(2_000_001) }), null);
});
test("simultaneous BB requests keep owners separate and website calls receive no API owner", async () => {
  assert.equal(bbApiOwner(), undefined);
  const results = await Promise.all(["one", "two"].map(owner => withBbApiOwner(owner, async () => {
    await new Promise(resolve => setTimeout(resolve, owner === "one" ? 10 : 1));
    return bbApiOwner();
  })));
  assert.deepEqual(results, ["one", "two"]);
  assert.equal(bbApiOwner(), undefined);
  await assert.rejects(withBbApiOwner("one", async () => { throw new Error("provider failed"); }));
  assert.equal(bbApiOwner(), undefined);
});

test("Google accounts select only a configured server-owned identity, including accounts with different owners", () => {
  const accounts = [{id:"personal",ownerId:"owner-one"},{id:"work",ownerId:"owner-two"}];
  assert.equal(selectBbApiAccount(accounts,"work")?.ownerId,"owner-two");
  assert.equal(selectBbApiAccount(accounts,"unknown"),null);
  assert.equal(selectBbApiAccount(accounts,undefined),null);
});

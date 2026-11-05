import assert from "node:assert/strict";
import test from "node:test";
import { isTrustedGoogleMutation } from "./google-auth-request";
import { hasRequiredGoogleScopes } from "./google-auth-shared";

test("Google mutations require an exact trusted origin and custom header", () => {
  const request = (origin?: string, header = true, url = "https://unplan.io/api/google/oauth/token") => new Request(url, {
    method: "POST", headers: { ...(origin ? { Origin: origin } : {}), ...(header ? { "X-Requested-With": "XmlHttpRequest" } : {}) },
  });
  assert.equal(isTrustedGoogleMutation(request("https://unplan.io")), true);
  assert.equal(isTrustedGoogleMutation(request("https://evil.example")), false);
  assert.equal(isTrustedGoogleMutation(request()), false);
  assert.equal(isTrustedGoogleMutation(request("https://unplan.io", false)), false);
  assert.equal(isTrustedGoogleMutation(request("https://evil.example", true, "https://evil.example/api/google/oauth/token"), "https://unplan.io"), false);
  assert.equal(isTrustedGoogleMutation(request("https://unplan.io", true, "http://internal:3000/api/google/oauth/token"), "https://unplan.io"), true);
});

test("read-only and partial Calendar grants cannot silently connect", () => {
  assert.equal(hasRequiredGoogleScopes("openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist"), true);
  assert.equal(hasRequiredGoogleScopes("openid email https://www.googleapis.com/auth/calendar"), true);
  assert.equal(hasRequiredGoogleScopes("openid email https://www.googleapis.com/auth/calendar.readonly"), false);
  assert.equal(hasRequiredGoogleScopes("openid email https://www.googleapis.com/auth/calendar.events"), false);
});

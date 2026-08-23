import assert from "node:assert/strict";
import test from "node:test";
import { readJsonResponse } from "./http-client";

test("parses a JSON response", async () => {
  const result = await readJsonResponse<{ ok: boolean }>(
    Response.json({ ok: true }),
    "Request failed",
  );
  assert.deepEqual(result, { ok: true });
});

test("reports an empty HTTP error without leaking a JSON parse exception", async () => {
  await assert.rejects(
    readJsonResponse(
      new Response(null, { status: 500, statusText: "Internal Server Error" }),
      "Could not check Google connection",
    ),
    /Could not check Google connection \(500 Internal Server Error\)/,
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { acknowledgeNote, compareNotes, editNote, type NoteDraft } from "./event-description-sync";
import { syncGoogleDescription } from "./google-description-sync";
import { noteIdentity, googleEventMutationKey } from "./event-description-identity";

const draft: NoteDraft = { key: "key", accountId: "account", calendarId: "google|account|primary", eventId: "event", title: "Notes", base: "original", local: "mine", revision: 1, owner: "tab", status: "local", sendUpdates: "none" };
test("three-way comparison preserves changed Google notes, including empty notes", () => {
  assert.equal(compareNotes("original", "mine", "original"), "upload");
  assert.equal(compareNotes("original", "mine", "phone"), "conflict");
  assert.equal(compareNotes("original", "mine", "mine"), "synced");
  assert.equal(compareNotes("original", "", "original"), "upload");
  assert.equal(compareNotes("original", "mine", ""), "conflict");
});
test("older acknowledgement cannot erase newer edits or a cross-tab conflict", () => {
  const newer = { ...draft, revision: 2, local: "newer" };
  const result = acknowledgeNote(newer, draft, "mine");
  assert.equal(result.local, "newer");
  assert.equal(result.base, "mine");
  assert.equal(result.status, "local");
  assert.equal(acknowledgeNote({ ...newer, status: "conflict" }, draft, "mine").status, "conflict");
  assert.equal(acknowledgeNote(draft, draft, "mine").status, "synced");
});
test("typing preserves the original baseline and lost-response marker", () => {
  const result = editNote({ ...draft, sent: "mine" }, { ...draft, base: "stale", local: "newer", sendUpdates: undefined });
  assert.equal(result.base, "original");
  assert.equal(result.sent, "mine");
  assert.equal(result.revision, 2);
  assert.equal(result.sendUpdates, undefined);
});
test("event keys isolate accounts/calendars; queue identity survives a calendar move", () => {
  const event = { id: "local", providerEventId: "provider", calendarId: "google|account|primary" };
  const moved = { ...event, calendarId: "google|account|other" };
  const anotherAccount = { ...event, calendarId: "google|other|primary" };
  assert.notEqual(noteIdentity(event)?.key, noteIdentity(moved)?.key);
  assert.notEqual(noteIdentity(event)?.key, noteIdentity(anotherAccount)?.key);
  assert.equal(googleEventMutationKey(event), googleEventMutationKey(moved));
  assert.notEqual(googleEventMutationKey(event), googleEventMutationKey(anotherAccount));
});
test("conditional PATCH contains only HTML notes and the exact ETag", async () => {
  const local = '<p><strong>Launch</strong> <a href="https://example.test">plan</a></p>';
  const response = await syncGoogleDescription({ base: "original", local }, async init => {
    if (!init) return Response.json({ description: "original", etag: '"v1"' });
    assert.equal(init.method, "PATCH");
    assert.deepEqual(init.headers, { "If-Match": '"v1"' });
    assert.deepEqual(JSON.parse(init.body as string), { description: local });
    return Response.json({ description: local });
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { description: local });
});
test("a note changed between read and PATCH is returned as a conflict", async () => {
  let reads = 0;
  let writes = 0;
  const response = await syncGoogleDescription({ base: "original", local: "mine" }, async init => {
    if (!init) return Response.json({ description: ++reads === 1 ? "original" : "phone edit", etag: `v${reads}` });
    writes++; return new Response(null, { status: 412 });
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { description: "phone edit" });
  assert.equal(writes, 1);
});
test("an unrelated event change retries against the fresh ETag", async () => {
  let reads = 0;
  let writes = 0;
  const response = await syncGoogleDescription({ base: "original", local: "mine" }, async init => {
    if (!init) return Response.json({ description: "original", etag: `v${++reads}` });
    assert.deepEqual(init.headers, { "If-Match": `v${reads}` });
    return ++writes === 1 ? new Response(null, { status: 412 }) : Response.json({ description: "mine" });
  });
  assert.equal(response.status, 200); assert.equal(writes, 2);
});
test("lost-response retry and review never write", async () => {
  for (const input of [{ base: "original", local: "mine" }, { base: "original", local: "other", reviewOnly: true }]) {
    const response = await syncGoogleDescription(input, async init => {
      assert.equal(init, undefined); return Response.json({ description: "mine", etag: "v2" });
    });
    assert.equal(response.status, 200);
  }
});
test("deleted/cancelled events stay recoverable, permissions and missing ETags never write", async () => {
  for (const upstream of [new Response(null, { status: 404 }), new Response(null, { status: 410 }), Response.json({ status: "cancelled" })]) {
    const result = await syncGoogleDescription({ base: "original", local: "mine" }, async init => { assert.equal(init, undefined); return upstream; });
    assert.equal(result.status, 409); assert.deepEqual(await result.json(), { deleted: true });
  }
  for (const upstream of [new Response(null, { status: 403 }), Response.json({ description: "original" })]) {
    const result = await syncGoogleDescription({ base: "original", local: "mine" }, async init => { assert.equal(init, undefined); return upstream; });
    assert.ok([403, 503].includes(result.status));
  }
});
test("continuous concurrent edits stop after bounded retries", async () => {
  let writes = 0;
  const response = await syncGoogleDescription({ base: "original", local: "mine" }, async init => {
    if (!init) return Response.json({ description: "original", etag: "changing" });
    writes++; return new Response(null, { status: 412 });
  });
  assert.equal(response.status, 503); assert.equal(writes, 3);
});

test("editing back to a previously synced value uses the new server baseline", () => {
  const synced = { ...draft, status: "synced" as const, base: "mine" };
  const next = editNote(synced, { ...draft, base: "phone", local: "mine" });
  assert.equal(next.status, "local"); assert.equal(next.base, "phone");
});

import assert from "node:assert/strict";
import test from "node:test";
import { createTriageCalendar } from "./triage-calendar-server";
const calendar = { id: "google|a|c", accountId: "a", providerCalendarId: "c", name: "Tasks", writable: true, provider: "google" as const, backgroundColor: "#123456", foregroundColor: "#fff" };
const task = { id: "t", projectId: "inbox", content: "Task", description: "", priority: 1, due: null };
const providers = (fetcher: typeof fetch) => ({
  targets: async () => [{ id: "a", ownerId: "o", email: "a@example.com", status: "active" as const }],
  accessToken: async () => "private-test-token", fetch: fetcher,
});
test("scheduling reuses an event left by an interrupted request", async () => {
  let calls = 0;
  const api = createTriageCalendar(new AbortController().signal, providers(async () => { calls++; return Response.json({ status: "confirmed", extendedProperties: { private: { unplanTaskId: "t" } } }); }));
  await api.schedule(task, calendar); assert.equal(calls, 1);
});
test("scheduling rejects an account outside the configured integration", async () => {
  const api = createTriageCalendar(new AbortController().signal, providers(async () => { throw new Error("must not fetch"); }));
  await assert.rejects(api.schedule(task, { ...calendar, accountId: "other" }), /account is unavailable/);
});
test("scheduling checks occupied time before creating one event", async () => {
  const bodies: Array<{ start: { dateTime: string }; extendedProperties: { private: { unplanTaskId: string } } }> = [];
  const api = createTriageCalendar(new AbortController().signal, providers(async (input, init) => {
    const url = String(input);
    if (/\/events\/[a-f0-9]+$/.test(url)) return new Response("", { status: 404 });
    if (url.includes("calendarList")) return Response.json({ items: [{ id: "c", summary: "Tasks", selected: true, accessRole: "owner" }] });
    if (init?.method === "POST") { bodies.push(JSON.parse(init.body as string)); return Response.json({ id: "created" }); }
    return Response.json({ items: [{ id: "busy", start: { dateTime: new Date(Date.now() - 3600000).toISOString() }, end: { dateTime: new Date(Date.now() + 3600000).toISOString() } }] });
  }));
  await api.schedule(task, calendar); assert.equal(bodies.length, 1);
  assert.ok(Date.parse(bodies[0].start.dateTime) >= Date.now() + 3500000);
  assert.equal(bodies[0].extendedProperties.private.unplanTaskId, "t");
});
test("failed occupancy reads never create a calendar event", async () => {
  let posts = 0;
  const api = createTriageCalendar(new AbortController().signal, providers(async (input, init) => {
    const url = String(input); if (init?.method === "POST") posts++;
    if (/\/events\/[a-f0-9]+$/.test(url)) return new Response("", { status: 404 });
    if (url.includes("calendarList")) return Response.json({ items: [{ id: "c", selected: true, accessRole: "owner" }] });
    return new Response("", { status: 503 });
  }));
  await assert.rejects(api.schedule(task, calendar), /Google Calendar is unavailable/); assert.equal(posts, 0);
});

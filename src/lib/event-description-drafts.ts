"use client";

import { eventHasNotifiableGuests } from "./event-guest-notifications";
import type { CalendarEvent, GoogleSendUpdates } from "./calendar-types";
import { acknowledgeNote, editNote, type NoteDraft, type NoteHistory } from "./event-description-sync";
import { changeNote, listNotes } from "./event-description-draft-store";
import { noteIdentity, googleEventMutationKey } from "./event-description-identity";
import { enqueueGoogleEventMutation } from "./google-event-client";
import { googleCalendarAuthorizedFetch, readGoogleAccounts } from "./google-browser-auth";

type Snapshot = { drafts: Map<string, NoteDraft>; syncing: Set<string>; error: string; version: number };
const empty: Snapshot = { drafts: new Map(), syncing: new Set(), error: "", version: 0 };
let snapshot = empty;
const listeners = new Set<() => void>();
const failed = new Map<string, NoteDraft>();
const confirmed = new Map<string, { description: string; generation: number }>();
let generation = 0;
let owner = "";
let channel: BroadcastChannel | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let consumers = 0;
let stop: (() => void) | undefined;
let refreshVersion = 0;
function emit(patch: Partial<Snapshot> = {}) {
  snapshot = { ...snapshot, ...patch, version: snapshot.version + 1 };
  listeners.forEach(listener => listener());
}
export const subscribeNotes = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getNotesSnapshot = () => snapshot;
export const getServerNotesSnapshot = () => empty;
export const notesGeneration = () => generation;

export function eventNoteDraft(event: CalendarEvent) {
  const identity = noteIdentity(event);
  if (!identity) return undefined;
  return snapshot.drafts.get(identity.key) ?? [...snapshot.drafts.values()].find(draft =>
    draft.accountId === identity.accountId && draft.eventId === identity.eventId
    && event.id === `${draft.calendarId}:${draft.eventId}`);
}
export function noteValue(event: CalendarEvent) {
  const identity = noteIdentity(event);
  const draft = eventNoteDraft(event);
  return draft && draft.status !== "synced" ? draft.local : identity && confirmed.get(identity.key)?.description !== undefined
    ? confirmed.get(identity.key)!.description : event.description ?? "";
}

/** A refresh begun before an acknowledgement cannot roll it back. */
export function reconcileServerNotes(events: CalendarEvent[], startedGeneration: number) {
  return events.map(event => {
    const identity = noteIdentity(event);
    const saved = identity && confirmed.get(identity.key);
    if (!identity || !saved) return event;
    if (saved.generation > startedGeneration) return { ...event, description: saved.description };
    confirmed.delete(identity.key);
    return event;
  });
}
function acknowledge(draft: NoteDraft, description: string, broadcast = true) {
  confirmed.set(draft.key, { description, generation: ++generation });
  if (broadcast) channel?.postMessage({ type: "synced", draft, description });
  window.dispatchEvent(new CustomEvent("unplan-notes-synced", { detail: { ...draft, description } }));
}
async function refresh() {
  const version = ++refreshVersion;
  const items = await listNotes();
  if (version !== refreshVersion) return;
  const drafts = new Map(items.map(item => [item.key, item]));
  for (const [key, item] of failed) drafts.set(key, item);
  emit({ drafts });
}
async function publish() { await refresh(); channel?.postMessage("changed"); }
function report(error: unknown) { emit({ error: error instanceof Error ? error.message : "Notes storage unavailable" }); }
function schedule(delay = 1200) {
  clearTimeout(timer);
  timer = setTimeout(() => { void syncNotes().catch(report); }, delay);
}
function connected(draft: NoteDraft) { return readGoogleAccounts().some(account => account.id === draft.accountId); }
async function request(draft: NoteDraft, reviewOnly = false) {
  if (!connected(draft)) throw new Error("Reconnect this note’s Google account to sync.");
  const response = await googleCalendarAuthorizedFetch(draft.calendarId, "/api/google/events/description", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: draft.accountId, calendarId: draft.calendarId, eventId: draft.eventId,
      base: draft.base, local: draft.local, reviewOnly, sendUpdates: draft.sendUpdates }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok && response.status !== 409) throw new Error(data.error ?? `Notes sync failed (${response.status})`);
  if (!data.deleted && typeof data.description !== "string") throw new Error("Google returned an invalid notes response.");
  return { conflict: response.status === 409, deleted: Boolean(data.deleted), remote: data.description as string | undefined };
}
const queueKey = (draft: NoteDraft) => googleEventMutationKey({ calendarId: draft.calendarId, id: draft.eventId, providerEventId: draft.eventId });

export async function saveNote(event: CalendarEvent, text: string, awaitingCreation = false, baselineRevision = 0) {
  const identity = noteIdentity(event);
  if (!identity) return;
  owner ||= crypto.randomUUID();
  const next: NoteDraft = { ...identity, title: event.title || "Untitled event", base: confirmed.get(identity.key)?.description ?? event.description ?? "",
    local: text, revision: 0, owner, status: "local", awaitingCreation,
    sendUpdates: eventHasNotifiableGuests(event) ? undefined : "none" };
  try {
    await changeNote(identity.key, old => editNote(old, {
      ...next,
      // An acknowledgement since focus advances our baseline; a background
      // calendar refresh does not change the text this edit was based on.
      base: old?.status === "synced" && old.revision > baselineRevision ? old.base : next.base,
    }));
    failed.delete(identity.key);
    emit({ error: "" });
    await publish(); schedule();
  } catch (error) {
    // Keep the latest text visible, but never represent a failed IDB write as durable.
    const unsaved = { ...next, status: "error" as const, error: `Not saved locally: ${error instanceof Error ? error.message : "Storage unavailable"}` };
    failed.set(identity.key, unsaved);
    emit({ drafts: new Map(snapshot.drafts).set(identity.key, unsaved) });
    report(error);
  }
}
export async function approveNote(key: string, sendUpdates: GoogleSendUpdates) {
  await changeNote(key, old => old && ({ ...old, sendUpdates, retryAt: undefined }));
  await publish(); schedule(0);
}
export async function retryNote(key: string) {
  const unsaved = failed.get(key);
  if (unsaved) {
    await changeNote(key, old => editNote(old, { ...unsaved, status: "local", error: undefined }));
    failed.delete(key); emit({ error: "" });
  } else await changeNote(key, old => old && ({ ...old, retryAt: undefined }));
  await publish(); schedule(0);
}
export async function syncNotes() {
  if (running || !navigator.onLine) return;
  if (!navigator.locks) { emit({ error: "This browser cannot safely coordinate notes sync. Use a browser with Web Locks support; drafts remain saved locally." }); return; }
  running = true;
  try {
    for (const item of await listNotes()) {
      if (item.status === "synced" || item.status === "conflict" || failed.has(item.key) || !connected(item) || (item.retryAt ?? 0) > Date.now()) continue;
      await enqueueGoogleEventMutation(queueKey(item), async () => {
        let draft = (await listNotes()).find(candidate => candidate.key === item.key);
        if (!draft || draft.status === "synced" || draft.status === "conflict" || failed.has(draft.key)) return;
        const key = draft.key;
        emit({ syncing: new Set(snapshot.syncing).add(key) });
        try {
          // On reload a creation response may have been lost. Only GET until it exists.
          if (draft.awaitingCreation) {
            const check = await request(draft, true);
            if (check.deleted) return;
            draft = (await changeNote(key, old => old && ({ ...old, awaitingCreation: false })))!;
          }
          if (draft.sendUpdates === undefined) return;
          if (draft.sent !== undefined) {
            const check = await request(draft, true);
            if (!check.deleted && check.remote === draft.sent) {
              const sent = draft.sent;
              draft = (await changeNote(key, old => old && ({ ...old, base: sent, sent: undefined,
                status: old.status === "conflict" ? "conflict" : old.local === sent ? "synced" : "local" })))!;
              acknowledge(draft, sent);
              if (draft.status === "synced" || draft.status === "conflict") return;
            }
          }
          const sent = await changeNote(key, old => old && old.status !== "conflict" && old.sendUpdates !== undefined ? { ...old, sent: old.local } : old);
          if (!sent || sent.status === "conflict" || sent.sendUpdates === undefined) return;
          const result = await request(sent);
          if (result.conflict) {
            await changeNote(key, old => old && ({ ...old, status: "conflict", remote: result.remote, deleted: result.deleted, sent: undefined, error: undefined }));
          } else {
            await changeNote(key, old => old && acknowledgeNote(old, sent, result.remote!));
            acknowledge(sent, result.remote!);
          }
        } catch (error) {
          await changeNote(key, old => old && old.status !== "conflict" ? { ...old, status: "error",
            error: error instanceof Error ? error.message : "Waiting to retry", attempts: (old.attempts ?? 0) + 1,
            retryAt: Date.now() + Math.min(300000, 30000 * 2 ** (old.attempts ?? 0)) } : old);
        } finally {
          emit({ syncing: new Set([...snapshot.syncing].filter(candidate => candidate !== key)) });
          await publish();
        }
      });
    }
  } finally {
    running = false;
    if ([...snapshot.drafts.values()].some(draft => draft.status === "local" && !draft.awaitingCreation && draft.sendUpdates !== undefined && connected(draft))) schedule();
  }
}

export async function reviewNote(key: string) {
  const draft = snapshot.drafts.get(key);
  if (!draft || failed.has(key) || !navigator.onLine || !connected(draft)) return;
  const check = await request(draft, true);
  await changeNote(key, old => old && ({ ...old, remote: check.remote, deleted: check.deleted }));
  await publish();
}
export async function resolveNote(shown: NoteDraft, choice: "google" | "mine" | "merge", merged?: string) {
  if (!navigator.locks) throw new Error("This browser cannot safely resolve notes. Your draft is retained.");
  await enqueueGoogleEventMutation(queueKey(shown), async () => {
    const latest = (await listNotes()).find(draft => draft.key === shown.key);
    if (!latest || latest.revision !== shown.revision) throw new Error("Local notes changed. Review the latest version.");
    const check = await request(shown, true);
    if (check.deleted || check.remote !== shown.remote) {
      await changeNote(shown.key, old => old && ({ ...old, status: "conflict", remote: check.remote, deleted: check.deleted }));
      await publish();
      throw new Error(check.deleted ? "The event is unavailable. Copy your notes to recover them." : "Google notes changed again. Review the latest version.");
    }
    const history: NoteHistory = { key: crypto.randomUUID(), draftKey: shown.key, title: shown.title,
      local: shown.local, remote: check.remote, at: Date.now(), accountId: shown.accountId };
    const updated = await changeNote(shown.key, old => {
      if (!old || old.revision !== shown.revision) throw new Error("Notes changed while resolving. Please review again.");
      return { ...old, base: check.remote!, local: choice === "google" ? check.remote! : choice === "merge" ? merged ?? "" : old.local,
        revision: old.revision + 1, status: choice === "google" ? "synced" : "local", sent: undefined, remote: undefined, error: undefined,
        deleted: false, attempts: 0, retryAt: undefined };
    }, history);
    if (updated?.status === "synced") acknowledge(updated, updated.local);
    await publish(); schedule(0);
  });
}
export function startNotes() {
  consumers++;
  if (consumers === 1) {
    owner ||= crypto.randomUUID();
    const changed = () => { void refresh().then(() => schedule()).catch(report); };
    const online = () => { void refresh().then(() => schedule(0)).catch(report); };
    const unload = (event: BeforeUnloadEvent) => { if (failed.size) { event.preventDefault(); event.returnValue = ""; } };
    channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("unplan-note-drafts") : undefined;
    if (channel) channel.onmessage = event => {
      if (event.data?.type === "synced") acknowledge(event.data.draft, event.data.description, false);
      changed();
    };
    const storageError = (event: Event) => report(new Error((event as CustomEvent<string>).detail));
    window.addEventListener("unplan-notes-storage-error", storageError);
    const interval = setInterval(() => { void syncNotes().catch(report); }, 30000);
    window.addEventListener("online", online);
    window.addEventListener("storage", online);
    window.addEventListener("unplan-notes-changed", changed);
    window.addEventListener("beforeunload", unload);
    changed();
    stop = () => {
      clearInterval(interval); clearTimeout(timer); channel?.close(); channel = undefined;
      window.removeEventListener("unplan-notes-storage-error", storageError);
      window.removeEventListener("online", online); window.removeEventListener("storage", online);
      window.removeEventListener("unplan-notes-changed", changed); window.removeEventListener("beforeunload", unload);
    };
  }
  return () => { if (--consumers === 0) stop?.(); };
}

import type { NoteDraft, NoteHistory } from "./event-description-sync";

let database: Promise<IDBDatabase> | undefined;
function open() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("unplan-note-drafts", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("drafts", { keyPath: "key" });
      request.result.createObjectStore("history", { keyPath: "key" });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error("Close other Unplan tabs to open notes storage.")); };
  });
}
export async function listNotes(): Promise<NoteDraft[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction("drafts").objectStore("drafts").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function noteHistory(): Promise<NoteHistory[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction("history").objectStore("history").getAll();
    req.onsuccess = () => resolve(req.result.sort((a: NoteHistory, b: NoteHistory) => b.at - a.at));
    req.onerror = () => reject(req.error);
  });
}
/** Atomic read/modify/write, including recovery copies and calendar-move rekeying. */
export async function changeNote(key: string, change: (old?: NoteDraft) => NoteDraft | undefined, history?: NoteHistory) {
  const db = await open();
  return new Promise<NoteDraft | undefined>((resolve, reject) => {
    const tx = db.transaction(["drafts", "history"], "readwrite");
    const store = tx.objectStore("drafts");
    let result: NoteDraft | undefined;
    let failure: unknown;
    const req = store.get(key);
    req.onsuccess = () => {
      try {
        const old = req.result as NoteDraft | undefined;
        result = change(old);
        if (old && result && old.owner !== result.owner && old.local !== result.local && old.status !== "synced") {
          tx.objectStore("history").put({ key: crypto.randomUUID(), draftKey: old.key, title: old.title, local: old.local, remote: old.remote, at: Date.now(), accountId: old.accountId });
          result = { ...result, status: "conflict", remote: undefined, error: "Another tab edited these notes. Its version is in recovery history." };
        }
        if (result) {
          if (result.key !== key) store.delete(key);
          store.put(result);
        } else store.delete(key);
        if (history) tx.objectStore("history").put(history);
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(failure ?? tx.error ?? new Error("Notes could not be saved locally."));
  });
}

export function announceNotesChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("unplan-notes-changed"));
}

/** Called only after Google confirms creation or a move, including a move whose later PATCH fails. */
export async function relocateNote(oldKey: string, identity: Pick<NoteDraft, "key" | "calendarId" | "eventId">, createdDescription?: string) {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["drafts", "history"], "readwrite");
      const drafts = tx.objectStore("drafts");
      const source = drafts.get(oldKey);
      source.onsuccess = () => {
        const destination = drafts.get(identity.key);
        destination.onsuccess = () => {
          const old = source.result as NoteDraft | undefined;
          const existing = destination.result as NoteDraft | undefined;
          const chosen = existing && identity.key !== oldKey ? existing : old;
          if (!chosen && !old) return;
          let next: NoteDraft = { ...(chosen ?? old)!, ...identity, deleted: false,
            ...(createdDescription !== undefined ? { awaitingCreation: false, base: createdDescription } : {}) };
          if (next.status === "conflict" && (chosen ?? old)?.deleted) next = { ...next, status: "local", error: undefined };
          if (old && chosen && identity.key !== oldKey && old.local !== chosen.local && old.status !== "synced") {
            tx.objectStore("history").put({ key: crypto.randomUUID(), draftKey: oldKey, title: old.title,
              local: old.local, remote: old.remote, accountId: old.accountId, at: Date.now() });
            next = { ...next, base: old.base, status: "conflict", remote: undefined,
              revision: Math.max(old.revision, chosen.revision) + 1,
              error: "Notes were edited while the event moved. The other draft is preserved in recovery history." };
          }
          if (oldKey !== identity.key) drafts.delete(oldKey);
          drafts.put(next);
        };
      };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("Could not relocate local notes."));
    });
    announceNotesChanged();
  } catch (error) {
    // Google already committed the event. Do not roll it back in the UI because IDB failed.
    console.error("[GOOGLE:NOTES] Could not update draft identity", error);
    window.dispatchEvent(new CustomEvent("unplan-notes-storage-error", { detail: "The event saved, but local notes could not be updated. Your existing draft remains in recovery." }));
  }
}

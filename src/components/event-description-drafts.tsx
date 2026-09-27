"use client";

import * as React from "react";
import { AlertTriangle, Check, HardDrive, History, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import { EventDescriptionEditor } from "./event-description-editor";
import { useEventDescriptionDrafts } from "@/hooks/use-event-description-drafts";
import { eventNoteDraft, approveNote, resolveNote, retryNote, reviewNote, startNotes } from "@/lib/event-description-drafts";
import { noteHistory } from "@/lib/event-description-draft-store";
import type { NoteDraft, NoteHistory } from "@/lib/event-description-sync";
import type { CalendarEvent } from "@/lib/calendar-types";

export function openNoteDraft(key: string) {
  window.dispatchEvent(new CustomEvent("unplan-open-note", { detail: key }));
}
function statusLabel(draft: NoteDraft, syncing: boolean) {
  if (draft.error?.startsWith("Not saved locally")) return draft.error;
  if (syncing) return "Syncing notes";
  if (draft.status === "conflict") return "Notes conflict — review both versions";
  if (draft.status === "synced") return "Notes synced";
  if (draft.awaitingCreation) return "Saved locally · Waiting for event creation";
  if (draft.error) return `Saved locally · ${draft.error}`;
  if (draft.sendUpdates === undefined) return "Saved locally · Choose whether to notify guests";
  return "Saved locally · Waiting to sync";
}
export function EventDescriptionStatus({ event }: { event: CalendarEvent }) {
  const { syncing } = useEventDescriptionDrafts();
  const draft = eventNoteDraft(event);
  if (!draft) return null;
  const active = syncing.has(draft.key);
  const Icon = active ? LoaderCircle : draft.status === "synced" ? Check : draft.status === "conflict" || draft.status === "error" ? AlertTriangle : HardDrive;
  return <button type="button" className="note-draft-status" onClick={() => openNoteDraft(draft.key)}>
    <Icon size={13} className={active ? "spin" : undefined} /><span>{statusLabel(draft, active)}</span>
  </button>;
}
const noop = () => {};
function ReadOnlyNotes({ value, label }: { value: string; label: string }) {
  return <div className="note-version"><strong>{label}</strong><EventDescriptionEditor value={value} onChange={noop} onBlur={noop} readOnly label={label} /></div>;
}
export function EventDescriptionDrafts() {
  const { drafts, syncing, error } = useEventDescriptionDrafts();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<NoteHistory[] | null>(null);
  const [merge, setMerge] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const dialog = React.useRef<HTMLDialogElement>(null);
  const draft = selected ? drafts.get(selected) : undefined;
  const pending = [...drafts.values()].filter(item => item.status !== "synced");
  const isOpen = selected !== null || history !== null;
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); } catch (failure) { toast.error(failure instanceof Error ? failure.message : "Could not update notes"); }
    finally { setBusy(false); }
  };
  const close = () => { if (!busy) { setSelected(null); setHistory(null); setMerge(null); } };
  React.useEffect(startNotes, []);
  React.useEffect(() => {
    const open = (event: Event) => {
      const key = (event as CustomEvent<string>).detail;
      setSelected(key); setHistory(null); setMerge(null);
      void reviewNote(key).catch(failure => toast.error(failure instanceof Error ? failure.message : "Could not read Google notes"));
    };
    window.addEventListener("unplan-open-note", open);
    return () => window.removeEventListener("unplan-open-note", open);
  }, []);
  React.useEffect(() => {
    if (isOpen && !dialog.current?.open) dialog.current?.showModal();
    if (!isOpen && dialog.current?.open) dialog.current.close();
  }, [isOpen]);
  const resolve = (choice: "google" | "mine" | "merge") => {
    if (!draft) return;
    void run(async () => { await resolveNote(draft, choice, merge ?? undefined); setMerge(null); });
  };
  return <>
    <div className="note-drafts-launcher">
      {error && <span role="alert">{error}</span>}
      {pending.length > 0 && <button type="button" onClick={() => openNoteDraft(pending[0].key)}><HardDrive size={14} /> Notes drafts ({pending.length})</button>}
      <button type="button" aria-label="Notes recovery history" title="Notes recovery history" onClick={() => void run(async () => { setHistory(await noteHistory()); setSelected(null); })}><History size={14} /></button>
    </div>
    <dialog ref={dialog} className="note-recovery-dialog" onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => event.stopPropagation()}>
      <div className="note-recovery-header"><h2>{history !== null ? "Notes recovery history" : "Saved notes"}</h2><button type="button" aria-label="Close notes recovery" disabled={busy} onClick={close}><X size={18} /></button></div>
      {history === null && <nav aria-label="Saved notes drafts" className="note-draft-list">{pending.map(item => <button type="button" key={item.key} aria-current={selected === item.key ? "true" : undefined} onClick={() => openNoteDraft(item.key)}>{item.title}</button>)}</nav>}
      {draft && history === null && <>
        <h3>{draft.title}</h3><p className="note-recovery-status" role="status">{statusLabel(draft, syncing.has(draft.key))}</p>
        {draft.deleted && <p>The event was deleted or is no longer accessible. Copy your notes below to recover them. It will not be recreated automatically.</p>}
        <div className="note-versions"><ReadOnlyNotes label="Your local notes" value={draft.local} />
          {draft.remote !== undefined && <ReadOnlyNotes label="Current Google notes" value={draft.remote} />}</div>
        {merge !== null && <div className="note-merge"><strong>Merged notes</strong><EventDescriptionEditor key={draft.key} value={merge} onChange={setMerge} onBlur={noop} label="Merged notes" /></div>}
        {draft.sendUpdates === undefined && !draft.deleted && draft.status !== "synced" && <div className="note-recovery-actions"><span>Notify guests when these notes sync?</span><button type="button" disabled={busy} onClick={() => void run(() => approveNote(draft.key, "none"))}>Update quietly</button><button type="button" disabled={busy} onClick={() => void run(() => approveNote(draft.key, "all"))}>Update &amp; notify</button></div>}
        <div className="note-recovery-actions">
          {draft.status === "conflict" && !draft.deleted ? <>
            <button type="button" disabled={busy || draft.remote === undefined} onClick={() => resolve("google")}>Keep Google</button>
            <button type="button" disabled={busy || draft.remote === undefined} onClick={() => setMerge(draft.local)}>Merge/edit</button>
            <button type="button" disabled={busy || draft.remote === undefined} onClick={() => resolve(merge === null ? "mine" : "merge")}>{merge === null ? "Keep mine" : "Save merged notes"}</button>
          </> : draft.status !== "synced" && !draft.deleted && <button type="button" disabled={busy} onClick={() => void run(() => retryNote(draft.key))}>Retry sync</button>}
          {!draft.deleted && <button type="button" disabled={busy} onClick={() => void run(() => reviewNote(draft.key))}>Refresh Google version</button>}
        </div>
      </>}
      {history !== null && <><p>Versions preserved when resolving conflicts. Stored only in this browser.</p>{history.length === 0 && <p>No recovered versions yet.</p>}{history.map(item => <section key={item.key} className="note-history-item"><h3>{item.title} · {new Date(item.at).toLocaleString()}</h3><div className="note-versions"><ReadOnlyNotes label="Recovered local notes" value={item.local} /><ReadOnlyNotes label="Recovered Google notes" value={item.remote ?? ""} /></div></section>)}</>}
    </dialog>
  </>;
}

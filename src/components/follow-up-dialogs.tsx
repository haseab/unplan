"use client";

import * as React from "react";
import { useFollowUpDialogKeys } from "@/hooks/use-follow-up-dialog-keys";
import { followUpReviewAction } from "@/lib/follow-up-keyboard";
import { ArrowLeft, ArrowRight, Repeat2, X } from "lucide-react";
import type { CalendarEvent } from "@/lib/calendar-types";
import { describeFollowUpRule, nextFollowUpDate, parseFollowUpRule, type FollowUp } from "@/lib/follow-ups";


export function FollowUpSetupDialog({ event, existing, onSave, onStop, onClose }: {
  event: CalendarEvent; existing?: FollowUp;
  onSave: (event: CalendarEvent, input: string) => Promise<void>; onStop: (id: string) => Promise<void>; onClose: () => void;
}) {
  const [input, setInput] = React.useState(existing?.input ?? "3 days");
  const [error, setError] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLElement>(null);
  const [saving, setSaving] = React.useState(false);
  const locked = React.useRef(false);
  const closeWhenIdle = React.useCallback(() => { if (!locked.current) onClose(); }, [onClose]);
  useFollowUpDialogKeys(ref, closeWhenIdle);
  const persist = async (operation: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setSaving(true); setError(null);
    try { await operation(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Follow-up could not be saved to Todoist"); }
    finally { locked.current = false; setSaving(false); }
  };
  const rule = parseFollowUpRule(input);
  return <div className="modal-backdrop task-triage-backdrop" role="dialog" aria-modal="true" aria-label="Set up follow-up">
    <section ref={ref} tabIndex={-1} className="task-triage-modal follow-up-modal">
      <header className="task-triage-heading"><div><span className="task-triage-eyebrow">Follow-up</span><h2>When should this return?</h2><p>{event.title}</p></div><button type="button" disabled={saving} onClick={onClose} aria-label="Close follow-up"><X size={17} /></button></header>
      <form onSubmit={(eventSubmit) => {
        eventSubmit.preventDefault();
        void persist(() => onSave(event, input));
      }}>
        <label htmlFor="follow-up-schedule">Follow up every…</label>
        <input disabled={saving} id="follow-up-schedule" value={input} onChange={(change) => { setInput(change.target.value); setError(null); }} autoComplete="off" aria-describedby="follow-up-preview" />
        <p id="follow-up-preview" aria-live="polite">{rule ? <>{describeFollowUpRule(rule)} · Next: {nextFollowUpDate(rule, new Date()).toLocaleString()}</> : "Try ‘every 4 days’, ‘first week of every month’, ‘last day of the month’, or ‘last day of each week’."}</p>
        <p className="follow-up-hint">Repeats until stopped. Week and month schedules become due at midnight in your local time. “First week” means the 1st.</p>
        {error && <p className="task-triage-error" role="alert">{error}</p>}
        <div className="task-triage-actions"><button type="button" disabled={saving} onClick={onClose}>Cancel</button><button className="task-triage-keep" type="submit" disabled={!rule || saving}><Repeat2 size={15} />{saving ? "Saving…" : existing ? "Update follow-up" : "Create follow-up"}</button></div>
        {existing && <button className="follow-up-stop" type="button" disabled={saving} onClick={() => void persist(() => onStop(existing.id))}>Stop following up</button>}
      </form>
    </section>
  </div>;
}

export function FollowUpReviewDialog({ items, onResolve, onClose, onComplete }: {
  onComplete: () => void;
  items: FollowUp[]; onResolve: (item: FollowUp, action: "schedule" | "skip" | "stop") => Promise<void>; onClose: () => void;
}) {
  const ref = React.useRef<HTMLElement>(null);
  const busy = React.useRef(false);
  const [resolving, setResolving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const item = items[0];
  React.useEffect(() => {
    if (item || resolving || error) return;
    onComplete();
  }, [item, resolving, error, onComplete]);
  const resolve = React.useCallback(async (action: "schedule" | "skip" | "stop") => {
    if (busy.current || !item) return;
    busy.current = true; setResolving(true); setError(null);
    try { await onResolve(item, action); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not resolve follow-up"); }
    finally { busy.current = false; setResolving(false); }
  }, [item, onResolve]);
  const onKey = React.useCallback((event: KeyboardEvent) => {
    const action = followUpReviewAction(event);
    if (action) { event.preventDefault(); void resolve(action); }
  }, [resolve]);
  const closeWhenIdle = React.useCallback(() => { if (!busy.current) onClose(); }, [onClose]);
  useFollowUpDialogKeys(ref, closeWhenIdle, onKey);
  if (!item && !error) return null;
  return <div className="modal-backdrop task-triage-backdrop" role="dialog" aria-modal="true" aria-label="Follow-up review">
    <section ref={ref} tabIndex={-1} className="task-triage-modal follow-up-modal">
      <header className="task-triage-heading"><div><span className="task-triage-eyebrow">Follow-ups</span><h2>Time to follow up?</h2><p aria-live="polite">{items.length} left · schedule now or skip until next time</p></div><button type="button" disabled={resolving} onClick={onClose} aria-label="Close follow-up review"><X size={17} /></button></header>
      {error && <p className="task-triage-error" role="alert">{error}</p>}
      {item && <>
        <article className="task-triage-task-card"><div className="task-triage-card-meta"><span>{describeFollowUpRule(item.rule)}</span><span>Due {new Date(item.nextDue).toLocaleDateString()}</span></div><h3>{item.event.title}</h3>{item.event.description && <p>{item.event.description}</p>}</article>
        <div className="task-triage-actions follow-up-review-actions">
          <button type="button" className="task-triage-keep" disabled={resolving} onClick={() => void resolve("schedule")}><ArrowLeft size={15} /><span>Schedule now</span></button>
          <button type="button" disabled={resolving} onClick={() => void resolve("stop")} title="Delete follow-up (⌘⌫) — keeps the calendar event"><span>Delete</span><kbd>⌘⌫</kbd></button>
          <button type="button" disabled={resolving} onClick={() => void resolve("skip")}><span>Skip</span><ArrowRight size={15} /></button>
        </div>
      </>}
    </section>
  </div>;
}

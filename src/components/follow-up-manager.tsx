"use client";

import * as React from "react";
import { ArrowRight, Pencil, Repeat2, Trash2, X } from "lucide-react";
import type { CalendarEvent, CalendarSource } from "@/lib/calendar-types";
import { describeFollowUpRule, type FollowUp } from "@/lib/follow-ups";
import { useFollowUpDialogKeys } from "@/hooks/use-follow-up-dialog-keys";
import { FollowUpSetupDialog } from "@/components/follow-up-dialogs";

type Props = {
  items: FollowUp[];
  dueIds: string[];
  calendars: CalendarSource[];
  syncError: string | null;
  onSave: (event: CalendarEvent, input: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onReviewDue: () => void;
  onClose: () => void;
};

export function FollowUpManager(props: Props) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const editing = props.items.find(({ id }) => id === editingId);
  return editing ? <FollowUpSetupDialog
    event={editing.event}
    existing={editing}
    onSave={props.onSave}
    onStop={props.onStop}
    onClose={() => setEditingId(null)}
  /> : <FollowUpListDialog {...props} onEdit={(item) => setEditingId(item.id)} />;
}

function FollowUpListDialog({ syncError, items, dueIds, calendars, onStop, onReviewDue, onClose, onEdit }: Props & { onEdit: (item: FollowUp) => void }) {
  const ref = React.useRef<HTMLElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [stopping, setStopping] = React.useState(false);
  useFollowUpDialogKeys(ref, onClose);
  const ordered = [...items].sort((a, b) => Date.parse(a.nextDue) - Date.parse(b.nextDue));
  return <div className="modal-backdrop task-triage-backdrop" role="dialog" aria-modal="true" aria-label="All follow-ups">
    <section ref={ref} tabIndex={-1} className="task-triage-modal follow-up-manager">
      <header className="task-triage-heading">
        <div><span className="task-triage-eyebrow">Scheduled</span><h2>Follow-ups</h2><p>{items.length} active{dueIds.length > 0 ? ` · ${dueIds.length} due` : ""} · Next triggers in your local time</p></div>
        <button type="button" onClick={onClose} aria-label="Close all follow-ups"><X size={17} /></button>
      </header>
      {dueIds.length > 0 && <button type="button" className="follow-up-manager-review" onClick={onReviewDue}>Review {dueIds.length} due <ArrowRight size={15} /></button>}
      {(error || syncError) && <p role="alert" className="task-triage-error">{error || syncError}</p>}
      {ordered.length === 0 ? <div className="follow-up-manager-empty"><Repeat2 size={24} /><h3>No follow-ups scheduled</h3><p>Select a calendar event and press <kbd>F</kbd> to create one.</p></div> : <ul className="follow-up-manager-list">
        {ordered.map((item) => {
          const calendar = calendars.find(({ id }) => id === item.event.calendarId);
          const due = dueIds.includes(item.id);
          const duration = Math.round((Date.parse(item.event.end) - Date.parse(item.event.start)) / 60_000);
          return <li key={item.id}>
            <div className="follow-up-manager-item">
              <h3>{item.event.title || "Untitled event"}</h3>
              <p>{describeFollowUpRule(item.rule)}</p>
              <small>{calendar?.name ?? "Original calendar unavailable"} · {item.event.allDay ? "All-day event" : `${duration} min`}</small>
              <div className="follow-up-manager-date" data-due={due || undefined}>
                <span>{due ? "Due since" : "Next trigger"}</span>
                <time dateTime={item.nextDue}>{new Date(item.nextDue).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}</time>
              </div>
            </div>
            <div className="follow-up-manager-item-actions">
              <button type="button" aria-label={`Edit follow-up for ${item.event.title}`} title="Edit schedule" disabled={stopping} onClick={() => onEdit(item)}><Pencil size={15} /></button>
              <button type="button" aria-label={`Stop following up on ${item.event.title}`} title="Stop following up" disabled={stopping} onClick={async () => {
                setStopping(true);
                try { await onStop(item.id); setError(null); }
                catch (cause) { setError(cause instanceof Error ? cause.message : "Could not stop follow-up"); }
                finally { setStopping(false); }
              }}><Trash2 size={15} /></button>
            </div>
          </li>;
        })}
      </ul>}
    </section>
  </div>;
}

"use client";


import * as React from "react";
import { useSearchReviewFocus } from "../hooks/use-search-review-focus.js";
import { ArrowLeft } from "lucide-react";
import { CalendarPicker } from "./calendar-picker.js";
import type { CalendarSource } from "../lib/calendar-types.js";
import type { TodoistTask } from "../lib/todoist.js";
import { calendarEventDetailsFromTodoistContent, todoistTaskDisplayTitle } from "../lib/todoist-calendar.js";

type Props = {
  calendars: CalendarSource[];
  tasks: TodoistTask[];
  query: string;
  onBack: () => void;
  onApply: (tasks: TodoistTask[], calendarId: string) => Promise<boolean>;
};

export function SearchTaskBulkEditor({ calendars, tasks, query, onBack, onApply }: Props) {
  const [matches] = React.useState(() => [...tasks]);
  const [selected, setSelected] = React.useState(() => new Set(tasks.map(task => task.id)));
  const [calendarId, setCalendarId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const { rootRef, backRef, onKeyDown } = useSearchReviewFocus(onBack, saving);
  const inFlight = React.useRef(false);
  const names = new Map(calendars.map(calendar => [calendar.id, calendar.name]));
  const apply = async () => {
    if (!calendarId || !selected.size || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try { if (await onApply(matches.filter(task => selected.has(task.id)), calendarId)) onBack(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Task calendars could not be updated"); }
    finally { inFlight.current = false; setSaving(false); }
  };
  return <div className="modal-backdrop" onMouseDown={() => { if (!saving) onBack(); }}>
    <section className="event-search-modal search-bulk-modal" role="dialog" aria-modal="true" aria-labelledby="task-search-bulk-title" ref={rootRef}
      onMouseDown={event => event.stopPropagation()} onKeyDown={onKeyDown}>
      <div className="event-search-heading"><button className="icon-button" aria-label="Back to search" ref={backRef} disabled={saving} onClick={onBack}><ArrowLeft size={16} /></button><strong id="task-search-bulk-title">Edit matching tasks</strong><span>{selected.size} selected</span></div>
      <div className="search-bulk-context"><strong>“{query}”</strong><span>All currently synced tasks</span></div>
      <fieldset className="search-bulk-fields" disabled={saving}><label>Change calendar</label>
        <CalendarPicker calendars={calendars.filter(calendar => calendar.writable !== false)} value={calendarId} onChange={setCalendarId} placeholder="Choose calendar" />
      </fieldset>
      <p className="search-bulk-summary">{calendarId ? `Set calendar to ${names.get(calendarId)} for ${selected.size} tasks. Their color follows the calendar.` : "Choose a calendar, then review the matching tasks."}</p>
      <div className="search-bulk-list-heading"><strong>Review matches · {matches.length}</strong><button disabled={saving} onClick={() => setSelected(selected.size === matches.length ? new Set() : new Set(matches.map(task => task.id)))}>{selected.size === matches.length ? "Deselect all" : "Select all"}</button></div>
      <div className="search-bulk-list">{matches.map(task => {
        const details = calendarEventDetailsFromTodoistContent(task.content);
        return <label key={task.id}><input type="checkbox" disabled={saving} checked={selected.has(task.id)} onChange={() => setSelected(current => { const next = new Set(current); if (!next.delete(task.id)) next.add(task.id); return next; })} />
          <span className="event-search-color event-search-task-color" /><span><strong>{todoistTaskDisplayTitle(task.content)}</strong><small>{details.group ?? "Ungrouped"} · {names.get(details.calendarId ?? "") ?? "No calendar"}</small></span></label>;
      })}</div>
      {error && <p className="event-search-error" role="alert">{error}</p>}
      <div className="search-bulk-actions"><span>You can undo after applying.</span><button disabled={saving} onClick={onBack}>Cancel</button><button className="confirmation-primary" disabled={saving || !calendarId || !selected.size} onClick={() => void apply()}>{saving ? "Applying…" : `Apply to ${selected.size} ${selected.size === 1 ? "task" : "tasks"}`}</button></div>
    </section>
  </div>;
}

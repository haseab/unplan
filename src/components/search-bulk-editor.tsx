"use client";

import * as React from "react";
import { useSearchReviewFocus } from "@/hooks/use-search-review-focus";
import { format } from "date-fns";
import { ArrowLeft, Search } from "lucide-react";
import { EVENT_COLOR_OPTIONS } from "@/lib/event-color";
import { CalendarPicker } from "@/components/calendar-picker";
import { EventColorPicker } from "@/components/event-color-picker";
import type { CalendarEvent, CalendarSource } from "@/lib/calendar-types";
import { calendarsForEventSelection } from "@/lib/multi-event-selection";
import { buildSearchBulkUpdates, editableSearchEvents, searchEventKey, type SearchBulkChanges } from "@/lib/search-bulk-edit";

type Props = {
  calendars: CalendarSource[];
  events: CalendarEvent[];
  query: string;
  scope: string;
  onBack: () => void;
  onApply: (updated: CalendarEvent[], originals: CalendarEvent[]) => Promise<boolean>;
};

export function SearchBulkEditor({ calendars, events, query, scope, onBack, onApply }: Props) {
  // The reviewed set is a snapshot: later search responses cannot add targets.
  const [matches] = React.useState(() => [...events]);
  const [selected, setSelected] = React.useState(() => new Set(editableSearchEvents(events, calendars).map(searchEventKey)));
  const [changes, setChanges] = React.useState<SearchBulkChanges>({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const { rootRef, backRef, onKeyDown } = useSearchReviewFocus(onBack, saving);
  const inFlight = React.useRef(false);
  const editable = editableSearchEvents(matches, calendars);
  const editableKeys = new Set(editable.map(searchEventKey));
  const chosen = editable.filter(event => selected.has(searchEventKey(event)));
  const destinations = calendarsForEventSelection(chosen, calendars, calendars.filter(calendar => calendar.writable !== false));
  const plan = buildSearchBulkUpdates(matches, selected, changes, calendars);
  const destination = calendars.find(calendar => calendar.id === changes.calendarId);
  const names = new Map(calendars.map(calendar => [calendar.id, calendar.name]));

  const updateSelection = (next: Set<string>) => {
    setSelected(next);
    const allowed = calendarsForEventSelection(editable.filter(event => next.has(searchEventKey(event))), calendars, calendars.filter(calendar => calendar.writable !== false));
    setChanges(current => current.calendarId && !allowed.some(calendar => calendar.id === current.calendarId)
      ? { ...current, calendarId: undefined } : current);
  };

  const apply = async () => {
    if (inFlight.current || !plan.updated.length) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      if (await onApply(plan.updated, plan.originals)) onBack();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Changes could not be applied");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return <div className="modal-backdrop" onMouseDown={() => { if (!saving) onBack(); }}>
    <section className="event-search-modal search-bulk-modal" ref={rootRef} role="dialog" aria-modal="true" aria-labelledby="search-bulk-title"
      onMouseDown={event => event.stopPropagation()}
      onKeyDown={onKeyDown}>
      <div className="event-search-heading">
        <button className="icon-button" ref={backRef} disabled={saving} aria-label="Back to search" onClick={onBack}><ArrowLeft size={16} /></button>
        <strong id="search-bulk-title">Edit search matches</strong>
        <span>{chosen.length} selected</span>
      </div>
      <div className="search-bulk-context"><Search size={14} /><strong>“{query}”</strong><span>{scope}</span></div>
      <fieldset className="search-bulk-fields" disabled={saving}>
        <label>Move to calendar</label>
        <CalendarPicker calendars={destinations} value={changes.calendarId ?? null} placeholder="Keep current calendars"
          onChange={calendarId => setChanges(current => ({ ...current, calendarId }))} />
        {!destinations.length && chosen.length > 0 && <small>Select events from one account to move calendars.</small>}
        <label>Color · unchanged until chosen</label>
        <EventColorPicker calendarColor={destination?.backgroundColor ?? chosen[0]?.calendarColor ?? "#888888"}
          calendarTextColor={destination?.foregroundColor ?? "#ffffff"} colorId={changes.color?.colorId} customColor={changes.color?.customColor}
          onCancel={() => undefined} onExit={() => backRef.current?.focus()} onPreview={() => undefined}
          onCommit={color => setChanges(current => ({ ...current, color }))} />
        <div className="multi-event-field-grid">
          <label>Availability<select aria-label="Availability for search matches" value={changes.transparency ?? ""}
            onChange={event => setChanges(current => ({ ...current, transparency: event.target.value as SearchBulkChanges["transparency"] }))}>
            <option value="">Keep current</option><option value="opaque">Busy</option><option value="transparent">Available</option>
          </select></label>
          <label>Visibility<select aria-label="Visibility for search matches" value={changes.visibility ?? ""}
            onChange={event => setChanges(current => ({ ...current, visibility: event.target.value as SearchBulkChanges["visibility"] }))}>
            <option value="">Keep current</option><option value="default">Default</option><option value="private">Private</option><option value="public">Public</option><option value="confidential">Confidential</option>
          </select></label>
        </div>
        <button className="search-bulk-reset" onClick={() => setChanges({})}>Reset changes</button>
      </fieldset>
      <div className="search-bulk-summary" aria-live="polite">
        {destination && <span>Move to {destination.name}. </span>}
        {changes.color && <span>Set {changes.color.customColor ?? EVENT_COLOR_OPTIONS.find(option => option.colorId === changes.color?.colorId)?.name ?? "calendar default color"}. </span>}
        {changes.transparency && <span>Set {changes.transparency === "opaque" ? "busy" : "available"}. </span>}
        {changes.visibility && <span>Set {changes.visibility} visibility. </span>}
        <span>{plan.updated.length} {plan.updated.length === 1 ? "event" : "events"} will change. Recurring matches affect only the listed occurrences.</span>
      </div>
      <div className="search-bulk-list-heading"><strong>Review matches · {matches.length}</strong>
        <button disabled={saving} onClick={() => updateSelection(selected.size === editable.length ? new Set() : new Set(editable.map(searchEventKey)))}>
          {selected.size === editable.length ? "Deselect all" : "Select editable"}</button></div>
      <div className="search-bulk-list">
        {matches.map(event => <label key={searchEventKey(event)}>
          <input type="checkbox" disabled={saving || !editableKeys.has(searchEventKey(event))} checked={selected.has(searchEventKey(event))}
            onChange={() => { const next = new Set(selected); if (!next.delete(searchEventKey(event))) next.add(searchEventKey(event)); updateSelection(next); }} />
          <span className="event-search-color" style={{ background: event.color }} />
          <span><strong>{event.title || "Untitled event"}</strong><small>{format(new Date(event.start), event.allDay ? "EEE, MMM d, yyyy · 'All day'" : "EEE, MMM d, yyyy · h:mm a")} · {names.get(event.calendarId) ?? "Calendar"}{!editableKeys.has(searchEventKey(event)) && " · Read only"}</small></span>
        </label>)}
      </div>
      {error && <p className="event-search-error" role="alert">{error}</p>}
      <div className="search-bulk-actions"><span>You can undo after applying.</span><button disabled={saving} onClick={onBack}>Cancel</button>
        <button className="confirmation-primary" disabled={saving || !plan.updated.length} onClick={() => void apply()}>{saving ? "Applying…" : `Apply to ${plan.updated.length} ${plan.updated.length === 1 ? "event" : "events"}`}</button></div>
    </section>
  </div>;
}

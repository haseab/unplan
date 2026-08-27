"use client";

import {
  CalendarDays,
  Clipboard,
  Clock3,
  Copy,
  Trash2,
  X,
} from "lucide-react";
import * as React from "react";
import { format, isSameDay } from "date-fns";
import { CalendarPicker } from "@/components/calendar-picker";
import type { CalendarEvent, CalendarSource } from "@/lib/calendar-types";
import {
  calendarsForEventSelection,
  multiEventSelectionSummary,
  moveSelectionToCalendar,
  sharedSelectionValue,
} from "@/lib/multi-event-selection";
import { moveEvent } from "@/lib/calendar-utils";

type MultiEventSidebarProps = {
  calendars: CalendarSource[];
  editableCalendars: CalendarSource[];
  events: CalendarEvent[];
  openCalendarPicker: boolean;
  onBulkUpdate: (events: CalendarEvent[]) => Promise<boolean>;
  onCalendarPickerClose: () => void;
  onCopy: () => void;
  onDelete: () => void | Promise<void>;
  onDuplicate: () => void | Promise<void>;
  onRemoveSelection: (eventId: string) => void;
};

const formatTotalDuration = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

export function MultiEventSidebar({
  calendars,
  editableCalendars,
  events,
  openCalendarPicker,
  onBulkUpdate,
  onCalendarPickerClose,
  onCopy,
  onDelete,
  onDuplicate,
  onRemoveSelection,
}: MultiEventSidebarProps) {
  const [saving, setSaving] = React.useState(false);
  const summary = multiEventSelectionSummary(events);
  const availability = sharedSelectionValue(
    events.map((event) => event.transparency ?? "opaque"),
  );
  const visibility = sharedSelectionValue(
    events.map((event) => event.visibility ?? "default"),
  );
  const calendarId = sharedSelectionValue(events.map((event) => event.calendarId));
  const availableCalendars = calendarsForEventSelection(
    events,
    calendars,
    editableCalendars,
  );
  React.useEffect(() => {
    if (openCalendarPicker && availableCalendars.length === 0) {
      onCalendarPickerClose();
    }
  }, [availableCalendars.length, onCalendarPickerClose, openCalendarPicker]);

  if (!summary) return null;
  const dateRange = isSameDay(summary.earliestStart, summary.latestEnd)
    ? format(summary.earliestStart, "EEE, MMM d")
    : `${format(summary.earliestStart, "MMM d")}–${format(summary.latestEnd, "MMM d")}`;

  const apply = async (nextEvents: CalendarEvent[]) => {
    setSaving(true);
    try {
      await onBulkUpdate(nextEvents);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="multi-event-editor">
      <section className="multi-event-overview">
        <span className="multi-event-overview-icon"><CalendarDays size={19} /></span>
        <div><strong>{events.length} events selected</strong><small>{dateRange}</small></div>
      </section>

      <section className="multi-event-stats" aria-label="Selection summary">
        <div><small>Total time</small><strong>{formatTotalDuration(summary.totalMinutes)}</strong></div>
        <div><small>Calendars</small><strong>{summary.calendarCount}</strong></div>
        <div><small>All-day</small><strong>{summary.allDayCount}</strong></div>
      </section>

      <section className="multi-event-section">
        <div className="multi-event-section-heading"><span>Bulk edit</span>{saving && <small>Saving…</small>}</div>
        <div className="multi-event-calendar-field">
          <span>Calendar</span>
          {availableCalendars.length > 0 ? (
            <CalendarPicker
              calendars={availableCalendars}
              forcedOpen={openCalendarPicker}
              onChange={(nextCalendarId) => {
                const destination = availableCalendars.find(
                  (calendar) => calendar.id === nextCalendarId,
                );
                if (!destination || nextCalendarId === calendarId) return;
                void apply(moveSelectionToCalendar(events, destination));
              }}
              onOpenChange={(open) => {
                if (!open) onCalendarPickerClose();
              }}
              placeholder="Mixed calendars"
              value={calendarId}
            />
          ) : (
            <small className="multi-event-calendar-unavailable">
              Selected events span different Google accounts
            </small>
          )}
        </div>
        <div className="multi-event-field-grid">
          <label>
            <span>Availability</span>
            <select
              aria-label="Set availability for selected events"
              disabled={saving}
              onChange={(input) => void apply(events.map((event) => ({
                ...event,
                transparency: input.target.value as CalendarEvent["transparency"],
              })))}
              value={availability ?? "mixed"}
            >
              {!availability && <option value="mixed" disabled>Mixed</option>}
              <option value="opaque">Busy</option>
              <option value="transparent">Available</option>
            </select>
          </label>
          <label>
            <span>Visibility</span>
            <select
              aria-label="Set visibility for selected events"
              disabled={saving}
              onChange={(input) => void apply(events.map((event) => ({
                ...event,
                visibility: input.target.value as CalendarEvent["visibility"],
              })))}
              value={visibility ?? "mixed"}
            >
              {!visibility && <option value="mixed" disabled>Mixed</option>}
              <option value="default">Default</option>
              <option value="private">Private</option>
              <option value="public">Public</option>
              <option value="confidential">Confidential</option>
            </select>
          </label>
        </div>
      </section>

      <section className="multi-event-section">
        <div className="multi-event-section-heading"><span>Shift together</span></div>
        <div className="multi-event-shifts">
          <button disabled={saving} onClick={() => void apply(events.map((event) => moveEvent(event, -1, 0)))}><CalendarDays size={13} />−1 day</button>
          <button disabled={saving} onClick={() => void apply(events.map((event) => moveEvent(event, 1, 0)))}><CalendarDays size={13} />+1 day</button>
          <button disabled={saving || summary.allDayCount > 0} title={summary.allDayCount > 0 ? "Minute shifts are unavailable when all-day events are selected" : undefined} onClick={() => void apply(events.map((event) => moveEvent(event, 0, -15)))}><Clock3 size={13} />−15 min</button>
          <button disabled={saving || summary.allDayCount > 0} title={summary.allDayCount > 0 ? "Minute shifts are unavailable when all-day events are selected" : undefined} onClick={() => void apply(events.map((event) => moveEvent(event, 0, 15)))}><Clock3 size={13} />+15 min</button>
        </div>
      </section>

      <section className="multi-event-section multi-event-selection-list">
        <div className="multi-event-section-heading"><span>Selected events</span><small>{events.length}</small></div>
        <div>
          {events.map((event) => {
            const calendar = calendars.find((item) => item.id === event.calendarId);
            return (
              <div className="multi-event-selection-row" key={`${event.calendarId}-${event.id}`}>
                <span style={{ backgroundColor: event.color || calendar?.backgroundColor }} />
                <div><strong>{event.title}</strong><small>{event.allDay ? format(new Date(event.start), "EEE, MMM d · All day") : format(new Date(event.start), "EEE, MMM d · h:mm a")}</small></div>
                <button aria-label={`Remove ${event.title} from selection`} onClick={() => onRemoveSelection(event.id)}><X size={12} /></button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="multi-event-actions">
        <button onClick={onCopy}><Clipboard size={14} />Copy</button>
        <button onClick={() => void onDuplicate()}><Copy size={14} />Duplicate</button>
        <button className="multi-event-delete" onClick={() => void onDelete()}><Trash2 size={14} />Delete</button>
      </section>
    </div>
  );
}

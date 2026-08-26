"use client";

import {
  AlignLeft,
  Bell,
  CalendarDays,
  CalendarPlus,
  Clock3,
  ExternalLink,
  Link2,
  LoaderCircle,
  MapPin,
  MousePointer2,
  Repeat2,
  Video,
  X,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { addDays, differenceInMinutes, format, setHours, startOfDay } from "date-fns";
import { EventParticipantsEditor } from "@/components/event-participants-editor";
import { EventColorPicker } from "@/components/event-color-picker";
import { CalendarPicker } from "@/components/calendar-picker";
import { MultiEventSidebar } from "@/components/multi-event-sidebar";
import { useDebouncedEventUpdate } from "@/hooks/use-debounced-event-update";
import type {
  CalendarEvent,
  CalendarEventRsvpStatus,
  CalendarSource,
} from "@/lib/calendar-types";
import { googleMeetCode } from "@/lib/google-conference-client";

export type EventCreationDraft = {
  calendarId: string;
  end: Date;
  start: Date;
};

type EventCreationSidebarProps = {
  calendarSources: CalendarSource[];
  calendars: CalendarSource[];
  draft: EventCreationDraft | null;
  onCancel: () => void;
  onClearSelection: () => void;
  onBulkUpdateEvents: (events: CalendarEvent[]) => Promise<boolean>;
  onCopySelection: () => void;
  onCreate: (title: string, calendarId: string) => void;
  onCreateConference: (event: CalendarEvent) => Promise<string>;
  onDeleteSelection: () => void | Promise<void>;
  onDuplicateSelection: () => void | Promise<void>;
  onRemoveSelection: (eventId: string) => void;
  onRespondToEvent: (
    event: CalendarEvent,
    responseStatus: CalendarEventRsvpStatus,
  ) => Promise<boolean>;
  onPreviewEvent: (event: CalendarEvent) => void;
  onUpdateEvent: (event: CalendarEvent) => Promise<boolean>;
  selectedEvents: CalendarEvent[];
};

const formatDuration = (start: Date, end: Date) => {
  const minutes = Math.max(differenceInMinutes(end, start), 0);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${remainingMinutes}m`;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

const dateTimeInputValue = (value: string) => format(new Date(value), "yyyy-MM-dd'T'HH:mm");
const recurrenceValue = (event: CalendarEvent) => {
  const rule = event.recurrence?.find((item) => item.startsWith("RRULE:")) ?? "";
  if (rule.includes("FREQ=DAILY")) return "daily";
  if (rule.includes("FREQ=WEEKLY")) return "weekly";
  if (rule.includes("FREQ=MONTHLY")) return "monthly";
  if (rule.includes("FREQ=YEARLY")) return "yearly";
  return "none";
};
const recurrenceRule = (value: string) => value === "none" ? [] : [`RRULE:FREQ=${value.toUpperCase()}`];
const reminderValue = (event: CalendarEvent) => {
  if (!event.reminders || event.reminders.useDefault) return "default";
  return String(event.reminders.overrides?.[0]?.minutes ?? "none");
};

function GoogleMeetMark() {
  return (
    <svg aria-hidden="true" className="google-meet-mark" viewBox="0 0 24 20">
      <path d="M2 4.5C2 3.12 3.12 2 4.5 2H14v16H4.5A2.5 2.5 0 0 1 2 15.5z" fill="#00ac47" />
      <path d="M14 7.1 19.2 3.2c.74-.55 1.8-.03 1.8.9v11.8c0 .93-1.06 1.45-1.8.9L14 12.9z" fill="#00832d" />
      <path d="M2 4.5C2 3.12 3.12 2 4.5 2H8v5H2z" fill="#ffba00" />
      <path d="M2 13h6v5H4.5A2.5 2.5 0 0 1 2 15.5z" fill="#2684fc" />
      <path d="M8 2h6v5H8z" fill="#ea4335" />
    </svg>
  );
}

function EventDetailsEditor({
  calendar,
  calendars,
  event,
  onCreateConference,
  onPreview,
  onRespond,
  onUpdate,
}: {
  calendar: CalendarSource | null;
  calendars: CalendarSource[];
  event: CalendarEvent;
  onCreateConference: (event: CalendarEvent) => Promise<string>;
  onPreview: (event: CalendarEvent) => void;
  onRespond: (
    event: CalendarEvent,
    responseStatus: CalendarEventRsvpStatus,
  ) => Promise<boolean>;
  onUpdate: (event: CalendarEvent) => Promise<boolean>;
}) {
  const {
    draft: edited,
    updateDraft,
    updateLocalDraft,
  } = useDebouncedEventUpdate({
    delay: 500,
    event,
    onPreview,
    onUpdate,
  });
  const [conferenceState, setConferenceState] = React.useState<
    "creating" | "error" | "idle" | "success"
  >(event.conferenceLink && event.conferenceLink !== "pending" ? "success" : "idle");
  const [conferenceError, setConferenceError] = React.useState<string | null>(null);
  const titleRef = React.useRef<HTMLTextAreaElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const start = new Date(edited.start);
  const end = new Date(edited.end);
  const zone = edited.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const attachmentUrl = edited.attachments?.[0]?.fileUrl ?? "";
  const editedCalendar = calendars.find((item) => item.id === edited.calendarId) ?? calendar;
  const editableCalendars = calendars.filter(
    (item) => !calendar?.accountId || item.accountId === calendar.accountId,
  );

  React.useLayoutEffect(() => {
    const title = titleRef.current;
    if (!title) return;
    title.style.height = "auto";
    title.style.height = `${title.scrollHeight}px`;
  }, [edited.title]);

  React.useEffect(() => {
    const focusTitleOnTab = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key !== "Tab" || keyboardEvent.shiftKey) return;
      const active = document.activeElement;
      if (active && panelRef.current?.contains(active)) return;
      keyboardEvent.preventDefault();
      const title = titleRef.current;
      if (!title) return;
      title.focus();
      const caretPosition = title.value.length;
      title.setSelectionRange(caretPosition, caretPosition);
    };
    window.addEventListener("keydown", focusTitleOnTab, true);
    return () => window.removeEventListener("keydown", focusTitleOnTab, true);
  }, []);

  const change = (patch: Partial<CalendarEvent>) => {
    updateDraft((current) => ({ ...current, ...patch }));
  };

  const changeCalendar = (nextCalendarId: string) => {
    const nextCalendar = calendars.find((item) => item.id === nextCalendarId);
    if (!nextCalendar) return;
    updateDraft((current) => ({
      ...current,
      calendarId: nextCalendar.id,
      calendarColor: nextCalendar.backgroundColor,
      color: current.colorId ? current.color : nextCalendar.backgroundColor,
      textColor: current.colorId ? current.textColor : nextCalendar.foregroundColor,
    }));
  };

  const toggleAllDay = (allDay: boolean) => {
    const day = startOfDay(start);
    updateDraft((current) => allDay
      ? { ...current, allDay: true, start: day.toISOString(), end: addDays(day, 1).toISOString() }
      : { ...current, allDay: false, start: setHours(day, 9).toISOString(), end: setHours(day, 10).toISOString() });
  };

  const createConference = async () => {
    if (conferenceState === "creating") return;
    setConferenceError(null);
    setConferenceState("creating");
    try {
      const conferenceLink = await onCreateConference(edited);
      updateLocalDraft((current) => ({ ...current, conferenceLink }));
      setConferenceState("success");
      const meetingCode = googleMeetCode(conferenceLink);
      toast.success("Google Meet created", {
        description: meetingCode,
        action: {
          label: "Open",
          onClick: () => window.open(conferenceLink, "_blank", "noopener,noreferrer"),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google Meet could not be created";
      setConferenceError(message);
      setConferenceState("error");
      toast.error(message);
    }
  };

  return (
    <div className="event-details event-editor" ref={panelRef}>
      <section className="event-details-hero event-editor-hero">
        <span className="event-details-color" style={{ backgroundColor: edited.color }} aria-hidden="true" />
        <textarea
          ref={titleRef}
          aria-label="Event title"
          rows={1}
          value={edited.title}
          onChange={(input) => change({ title: input.target.value })}
        />
      </section>

      <section className="event-details-section event-editor-time">
        <div className="event-details-row event-details-time-row">
          <Clock3 size={15} />
          <div>
            <strong>{format(start, "h:mm a")}<span>→</span>{format(end, "h:mm a")}<em>{formatDuration(start, end)}</em></strong>
            <small>{format(start, "EEEE, MMMM d")}</small>
          </div>
        </div>
        <div className="event-editor-time-inputs">
          {edited.allDay ? (
            <label>
              <span>Date</span>
              <input
                aria-label="Event date"
                type="date"
                value={format(start, "yyyy-MM-dd")}
                onChange={(input) => {
                  if (!input.target.value) return;
                  const nextStart = startOfDay(new Date(`${input.target.value}T12:00:00`));
                  change({ start: nextStart.toISOString(), end: addDays(nextStart, 1).toISOString() });
                }}
              />
            </label>
          ) : (
            <>
              <label><span>Starts</span><input aria-label="Event start" type="datetime-local" value={dateTimeInputValue(edited.start)} onChange={(input) => input.target.value && change({ start: new Date(input.target.value).toISOString() })} /></label>
              <label><span>Ends</span><input aria-label="Event end" type="datetime-local" value={dateTimeInputValue(edited.end)} onChange={(input) => input.target.value && change({ end: new Date(input.target.value).toISOString() })} /></label>
            </>
          )}
        </div>
        <div className="event-editor-inline-options">
          <label><input type="checkbox" checked={Boolean(edited.allDay)} onChange={(input) => toggleAllDay(input.target.checked)} /> All-day</label>
          <select aria-label="Time zone" value={zone} onChange={(input) => change({ timeZone: input.target.value })}>
            {[zone, "America/Los_Angeles", "America/New_York", "Europe/London", "UTC"].filter((item, index, list) => list.indexOf(item) === index).map((item) => <option key={item}>{item}</option>)}
          </select>
          <label><Repeat2 size={13} /><select aria-label="Repeat" value={recurrenceValue(edited)} disabled={Boolean(edited.recurringEventId)} onChange={(input) => change({ recurrence: recurrenceRule(input.target.value) })}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
        </div>
      </section>

      <section className="event-details-section event-editor-fields">
        <EventParticipantsEditor
          attendees={edited.attendees ?? []}
          onChange={(attendees) => change({ attendees })}
          onRespond={edited.provider === "google"
            ? (_, responseStatus) => onRespond(edited, responseStatus)
            : undefined}
        />
        <div className="event-editor-conference" data-state={conferenceState}>
          {conferenceState === "creating" ? <LoaderCircle className="spin" size={15} /> : edited.conferenceLink && edited.conferenceLink !== "pending" ? <GoogleMeetMark /> : <Video size={15} />}
          {edited.conferenceLink && edited.conferenceLink !== "pending" ? (
            <a href={edited.conferenceLink} target="_blank" rel="noreferrer">
              <strong>Google Meet</strong>
              <span>{googleMeetCode(edited.conferenceLink)}</span>
            </a>
          ) : conferenceState === "creating" ? (
            <span className="event-editor-conference-status"><strong>Creating Google Meet…</strong><small>Requesting a meeting code</small></span>
          ) : (
            <button type="button" disabled={edited.provider !== "google"} onClick={() => void createConference()}>
              <strong>{conferenceState === "error" ? "Try creating Google Meet again" : "Add Google Meet"}</strong>
              {conferenceError && <small>{conferenceError}</small>}
            </button>
          )}
        </div>
        <label><MapPin size={15} /><input aria-label="Location" placeholder="Location" value={edited.location ?? ""} onChange={(input) => change({ location: input.target.value })} /></label>
        <label><Link2 size={15} /><input aria-label="Links and attachments" placeholder="Add link or Google Drive attachment" type="url" value={attachmentUrl} onChange={(input) => change({ attachments: input.target.value ? [{ fileUrl: input.target.value }] : [] })} /></label>
        <label className="event-editor-description"><AlignLeft size={15} /><textarea aria-label="Notes" rows={2} placeholder="Add notes" value={edited.description ?? ""} onChange={(input) => change({ description: input.target.value })} /></label>
      </section>

      <section className="event-details-section event-editor-preferences">
        <EventColorPicker
          calendarColor={editedCalendar?.backgroundColor ?? edited.calendarColor}
          calendarTextColor={editedCalendar?.foregroundColor ?? "#ffffff"}
          colorId={edited.colorId}
          onChange={change}
        />
        <div className="event-editor-calendar-select event-editor-select-field">
          <span
            className="event-details-calendar-color"
            style={{ backgroundColor: editedCalendar?.backgroundColor ?? edited.calendarColor }}
          />
          <div className="event-editor-calendar-picker">
            <small>Calendar</small>
            <CalendarPicker
              calendars={editableCalendars}
              onChange={changeCalendar}
              value={edited.calendarId}
            />
          </div>
        </div>
        <div className="event-editor-pair">
          <label className="event-editor-select-field"><small>Availability</small><select aria-label="Availability" value={edited.transparency ?? "opaque"} onChange={(input) => change({ transparency: input.target.value as CalendarEvent["transparency"] })}><option value="opaque">Busy</option><option value="transparent">Available</option></select></label>
          <label className="event-editor-select-field"><small>Visibility</small><select aria-label="Visibility" value={edited.visibility ?? "default"} onChange={(input) => change({ visibility: input.target.value as CalendarEvent["visibility"] })}><option value="default">Default visibility</option><option value="private">Private</option><option value="public">Public</option></select></label>
        </div>
        <label className="event-editor-reminder event-editor-select-field"><Bell size={15} /><span><small>Reminder</small><select aria-label="Reminder" value={reminderValue(edited)} onChange={(input) => change({ reminders: input.target.value === "default" ? { useDefault: true } : input.target.value === "none" ? { useDefault: false, overrides: [] } : { useDefault: false, overrides: [{ method: "popup", minutes: Number(input.target.value) }] } })}><option value="default">Default reminder</option><option value="none">No reminder</option><option value="5">5 minutes before</option><option value="10">10 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option></select></span></label>
      </section>

      {edited.htmlLink && <a className="event-details-open event-editor-original" href={edited.htmlLink} target="_blank" rel="noreferrer">Open original event <ExternalLink size={13} /></a>}
    </div>
  );
}

export function EventCreationSidebar({
  calendarSources,
  calendars,
  draft,
  onCancel,
  onClearSelection,
  onBulkUpdateEvents,
  onCopySelection,
  onCreate,
  onCreateConference,
  onDeleteSelection,
  onDuplicateSelection,
  onRemoveSelection,
  onPreviewEvent,
  onRespondToEvent,
  onUpdateEvent,
  selectedEvents,
}: EventCreationSidebarProps) {
  const [title, setTitle] = React.useState("");
  const [calendarId, setCalendarId] = React.useState(draft?.calendarId ?? "");
  const selectedEvent = selectedEvents.length === 1 ? selectedEvents[0] : null;
  const selectedCalendar = selectedEvent ? calendarSources.find((calendar) => calendar.id === selectedEvent.calendarId) ?? null : null;
  const isShowingSelection = selectedEvents.length > 0 && !draft;
  const isShowingMultiSelection = selectedEvents.length > 1 && !draft;

  return (
    <div
      className="event-sidebar-panel"
      aria-label={isShowingSelection ? "Event details" : "Create event"}
      data-event-creation-surface="true"
    >
      <div className="event-creation-heading">
        <div>{isShowingSelection ? <CalendarDays size={17} /> : <CalendarPlus size={17} />}<span><strong>{isShowingMultiSelection ? `${selectedEvents.length} events` : isShowingSelection ? "Event details" : "New event"}</strong><small>{isShowingMultiSelection ? "Bulk edit selection" : isShowingSelection ? selectedCalendar?.name ?? "Edit event" : "Add it to your calendar"}</small></span></div>
        {(draft || isShowingSelection) && <button className="icon-button" onClick={draft ? onCancel : onClearSelection} aria-label={draft ? "Cancel event creation" : "Close event details"}><X size={16} /></button>}
      </div>

      {draft ? (
        <form className="event-creation-form" onSubmit={(submitEvent) => { submitEvent.preventDefault(); if (title.trim()) onCreate(title.trim(), calendarId); }}>
          <label><span>Event name</span><input autoFocus value={title} onChange={(input) => setTitle(input.target.value)} placeholder="What are you planning?" /></label>
          <div className="event-creation-time"><Clock3 size={14} /><span><strong>{format(draft.start, "EEEE, MMMM d")}</strong><small>{format(draft.start, "h:mm a")}–{format(draft.end, "h:mm a")}</small></span></div>
          <div className="event-creation-field">
            <span>Calendar</span>
            <CalendarPicker calendars={calendars} onChange={setCalendarId} value={calendarId} />
          </div>
          <div className="event-creation-actions"><button type="button" onClick={onCancel}>Cancel</button><button className="event-create-button" type="submit" disabled={!title.trim()}>Create event</button></div>
        </form>
      ) : selectedEvent ? (
        <EventDetailsEditor
          calendar={selectedCalendar}
          calendars={calendars}
          event={selectedEvent}
          onCreateConference={onCreateConference}
          onPreview={onPreviewEvent}
          onRespond={onRespondToEvent}
          onUpdate={onUpdateEvent}
        />
      ) : selectedEvents.length > 1 ? (
        <MultiEventSidebar
          calendars={calendarSources}
          events={selectedEvents}
          onBulkUpdate={onBulkUpdateEvents}
          onCopy={onCopySelection}
          onDelete={onDeleteSelection}
          onDuplicate={onDuplicateSelection}
          onRemoveSelection={onRemoveSelection}
        />
      ) : (
        <div className="event-creation-empty"><span><MousePointer2 size={19} /></span><strong>Select a time</strong><p>Drag across empty calendar space to choose when the event should happen.</p></div>
      )}
    </div>
  );
}

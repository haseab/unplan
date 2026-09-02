"use client";

import {
  AlignLeft,
  Bell,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  Clock3,
  ExternalLink,
  Link2,
  LoaderCircle,
  MapPin,
  MousePointer2,
  Repeat2,
  SlidersHorizontal,
  Video,
  X,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { addDays, differenceInMinutes, format, setHours, startOfDay } from "date-fns";
import { EventParticipantsEditor } from "@/components/event-participants-editor";
import { EventDescriptionEditor } from "@/components/event-description-editor";
import { EventColorPicker } from "@/components/event-color-picker";
import { EventTitleEditor } from "@/components/event-title-editor";
import { CalendarPicker } from "@/components/calendar-picker";
import { MultiEventSidebar } from "@/components/multi-event-sidebar";
import { useDebouncedEventUpdate } from "@/hooks/use-debounced-event-update";
import type {
  CalendarEvent,
  CalendarEventRsvpStatus,
  CalendarSource,
} from "@/lib/calendar-types";
import { shouldAutoCreateEventConference } from "@/lib/event-participants";
import {
  eventTitleEditAction,
  isEventDetailsSubmitShortcut,
} from "@/lib/event-keyboard-navigation";
import { googleMeetCode } from "@/lib/google-conference-client";
import { type EventColorChange, getEventTextColor } from "@/lib/event-color";
import {
  recentEventEditDurationMinutes,
  type RecentEventTitle,
} from "@/lib/recent-event-titles";
import { buildTimeZoneGroups, timeZoneDisplayName } from "@/lib/time-zones";

export type EventCreationDraft = {
  allDay?: boolean;
  calendarId: string;
  end: Date;
  start: Date;
};

export type EventTitleFocusMode = "caret-end" | "select-all" | null;

type EventCreationSidebarProps = {
  openSelectedEventCalendarPicker: boolean;
  selectedEventColorPickerFocusRequested: boolean;
  selectedEventTitleFocusMode: EventTitleFocusMode;
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
  onDraftPreviewChange: (preview: { calendarId: string; title: string }) => void;
  onFocusWithinChange: (focused: boolean) => void;
  onFocusEvent: (event: CalendarEvent) => void;
  onRemoveSelection: (eventId: string) => void;
  onRecentTitleUsed: (entry: RecentEventTitle) => void;
  onCreateFromRecent: (entry: RecentEventTitle) => void;
  onSelectedEventCalendarPickerClose: () => void;
  onSelectedEventCalendarPickerOpen: () => void;
  onSelectedEventColorPickerAutoFocused: () => void;
  onSelectedEventTitleAutoFocused: () => void;
  onRespondToEvent: (
    event: CalendarEvent,
    responseStatus: CalendarEventRsvpStatus,
  ) => Promise<boolean>;
  onPreviewEvent: (event: CalendarEvent | null) => void;
  onUpdateEvent: (event: CalendarEvent) => Promise<boolean>;
  selectedEvents: CalendarEvent[];
  recentTitles: RecentEventTitle[];
  selectedEventPendingCreation: boolean;
  syncPausedEventIds: ReadonlySet<string>;
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
const reminderMinutesValue = (event: CalendarEvent) => {
  if (!event.reminders || event.reminders.useDefault) return "";
  const minutes = event.reminders.overrides?.[0]?.minutes;
  return typeof minutes === "number" ? String(minutes) : "";
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
  openCalendarPicker,
  colorPickerFocusRequested,
  titleFocusMode,
  calendar,
  calendars,
  event,
  onCreateConference,
  onFocusEvent,
  onRecentTitleUsed,
  onTitleAutoFocused,
  onPreview,
  onRespond,
  onCalendarPickerClose,
  onCalendarPickerOpen,
  onColorPickerAutoFocused,
  onUpdate,
  pendingCreation,
  recentTitles,
}: {
  openCalendarPicker: boolean;
  colorPickerFocusRequested: boolean;
  titleFocusMode: EventTitleFocusMode;
  calendar: CalendarSource | null;
  calendars: CalendarSource[];
  event: CalendarEvent;
  onCreateConference: (event: CalendarEvent) => Promise<string>;
  onFocusEvent: (event: CalendarEvent) => void;
  onRecentTitleUsed: (entry: RecentEventTitle) => void;
  onTitleAutoFocused: () => void;
  onPreview: (event: CalendarEvent | null) => void;
  onRespond: (
    event: CalendarEvent,
    responseStatus: CalendarEventRsvpStatus,
  ) => Promise<boolean>;
  onCalendarPickerClose: () => void;
  onCalendarPickerOpen: () => void;
  onColorPickerAutoFocused: () => void;
  onUpdate: (event: CalendarEvent) => Promise<boolean>;
  pendingCreation: boolean;
  recentTitles: RecentEventTitle[];
}) {
  const {
    deferUpdate,
    draft: edited,
    flushUpdate,
    updateDraft,
    updateLocalDraft,
  } = useDebouncedEventUpdate({
    event,
    onPreview,
    onUpdate,
  });
  const [conferenceState, setConferenceState] = React.useState<
    "creating" | "error" | "idle" | "success"
  >(event.conferenceLink && event.conferenceLink !== "pending" ? "success" : "idle");
  const [conferenceError, setConferenceError] = React.useState<string | null>(null);
  const [showAdvancedPreferences, setShowAdvancedPreferences] = React.useState(() =>
    Boolean(
      event.transparency && event.transparency !== "opaque"
      || event.visibility && event.visibility !== "default"
      || event.location
      || event.attachments?.[0]?.fileUrl
    )
  );
  const [showAttachment, setShowAttachment] = React.useState(() =>
    Boolean(event.attachments?.[0]?.fileUrl)
  );
  const [focusedOptionalField, setFocusedOptionalField] = React.useState<
    "attachment" | "location" | "notes" | null
  >(null);
  const [showLocation, setShowLocation] = React.useState(() => Boolean(event.location));
  const [showNotes, setShowNotes] = React.useState(() => Boolean(event.description));
  const [showTimeDetails, setShowTimeDetails] = React.useState(false);
  const [focusedTimeField, setFocusedTimeField] = React.useState<"end" | "start" | null>(null);
  const endInputRef = React.useRef<HTMLInputElement>(null);
  const startInputRef = React.useRef<HTMLInputElement>(null);
  const titleRef = React.useRef<HTMLTextAreaElement>(null);
  const skipTitleBlurCommitRef = React.useRef(false);
  const titleCommittedRef = React.useRef(event.title);
  const [titleDraft, setTitleDraft] = React.useState(event.title);
  const start = new Date(edited.start);
  const end = new Date(edited.end);
  const zone = edited.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timeZoneGroups = React.useMemo(() => buildTimeZoneGroups(zone), [zone]);
  const recurrence = recurrenceValue(edited);
  const recurrenceLabel = recurrence === "none"
    ? ""
    : ` · Repeats ${recurrence}`;
  const reminderMinutes = reminderMinutesValue(edited);
  const attachmentUrl = edited.attachments?.[0]?.fileUrl ?? "";
  const editedCalendar = calendars.find((item) => item.id === edited.calendarId) ?? calendar;
  const editableCalendars = calendars.filter(
    (item) => !calendar?.accountId || item.accountId === calendar.accountId,
  );

  React.useEffect(() => {
    titleCommittedRef.current = event.title;
    if (document.activeElement !== titleRef.current) setTitleDraft(event.title);
  }, [event.id, event.title]);

  React.useLayoutEffect(() => {
    if (!titleFocusMode) return;
    const title = titleRef.current;
    if (!title) return;
    title.focus({ preventScroll: true });
    if (titleFocusMode === "select-all") {
      title.select();
    } else {
      const caretPosition = title.value.length;
      title.setSelectionRange(caretPosition, caretPosition);
    }
    onTitleAutoFocused();
  }, [onTitleAutoFocused, titleFocusMode]);

  React.useEffect(() => () => {
    if (openCalendarPicker) onCalendarPickerClose();
  }, [onCalendarPickerClose, openCalendarPicker]);

  const change = (patch: Partial<CalendarEvent>) => {
    updateDraft((current) => ({ ...current, ...patch }));
  };

  const applyColorChange = (current: CalendarEvent, colorChange: EventColorChange) => {
    const next = { ...current, ...colorChange };
    if (!colorChange.customColor) delete next.customColor;
    return next;
  };

  const previewColor = (colorChange: EventColorChange) => {
    let candidate = edited;
    updateLocalDraft((current) => {
      candidate = applyColorChange(current, colorChange);
      return candidate;
    });
    onPreview(candidate);
    console.debug("[BUG:COLOR-PICKER-NAV] [SIDEBAR:PREVIEW] applied optimistic color", {
      color: colorChange.color,
      colorId: colorChange.colorId ?? null,
      customColor: colorChange.customColor ?? null,
      eventId: candidate.id,
    });
  };

  const cancelColorPreview = () => {
    const originalColor: EventColorChange = {
      color: event.color,
      colorId: event.colorId,
      ...(event.customColor ? { customColor: event.customColor } : {}),
      textColor: event.textColor ?? getEventTextColor(event.color),
    };
    let candidate = edited;
    updateLocalDraft((current) => {
      candidate = applyColorChange(current, originalColor);
      return candidate;
    });
    onPreview(candidate);
    console.debug("[BUG:COLOR-PICKER-NAV] [SIDEBAR:CANCEL] restored saved color", {
      color: originalColor.color,
      eventId: candidate.id,
    });
  };

  const commitColor = (colorChange: EventColorChange, restoreFocus: boolean) => {
    updateDraft((current) => applyColorChange(current, colorChange));
    console.debug("[BUG:COLOR-PICKER-NAV] [SIDEBAR:COMMIT] queued color update", {
      color: colorChange.color,
      colorId: colorChange.colorId ?? null,
      customColor: colorChange.customColor ?? null,
      eventId: edited.id,
      restoreFocus,
    });
    if (restoreFocus) onFocusEvent(edited);
    void flushUpdate();
  };

  const previewTitle = (title: string) => {
    setTitleDraft(title);
    onPreview({ ...edited, title });
  };

  const commitTitle = async () => {
    const nextTitle = titleDraft.trim();
    const previousTitle = titleCommittedRef.current;
    if (nextTitle === previousTitle) return true;
    titleCommittedRef.current = nextTitle;
    setTitleDraft(nextTitle);
    updateDraft((current) => ({ ...current, title: nextTitle }));
    const saved = await flushUpdate();
    if (!saved && titleCommittedRef.current === nextTitle) {
      titleCommittedRef.current = previousTitle;
      setTitleDraft(previousTitle);
    }
    return saved;
  };

  const cancelTitle = () => {
    skipTitleBlurCommitRef.current = true;
    previewTitle(titleCommittedRef.current);
  };

  const previewDescription = (description: string) => {
    onPreview({ ...edited, description });
  };

  const commitDescription = async (nextDescription: string) => {
    const previousDescription = edited.description ?? "";
    if (nextDescription === previousDescription) return true;
    updateDraft((current) => ({ ...current, description: nextDescription }));
    return flushUpdate();
  };

  const openTimeField = (field: "end" | "start") => {
    const targetField = edited.allDay ? "start" : field;
    setFocusedTimeField(targetField);
    setShowTimeDetails(true);
    window.requestAnimationFrame(() => {
      const input = targetField === "start" ? startInputRef.current : endInputRef.current;
      input?.focus({ preventScroll: true });
    });
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

  const applyRecentTitleMetadata = (entry: RecentEventTitle) => {
    const nextCalendar = calendars.find((item) => item.id === entry.calendarId);
    updateDraft((current) => {
      const start = new Date(current.start);
      const currentDurationMinutes = Math.max(
        0,
        Math.round((new Date(current.end).getTime() - start.getTime()) / 60_000),
      );
      const durationMinutes = recentEventEditDurationMinutes({
        allDay: current.allDay === true,
        currentDurationMinutes,
        pendingCreation,
        recentDurationMinutes: entry.durationMinutes,
      });
      return {
        ...current,
        ...(nextCalendar ? {
          calendarId: nextCalendar.id,
          calendarColor: nextCalendar.backgroundColor,
          color: current.colorId ? current.color : nextCalendar.backgroundColor,
          textColor: current.colorId ? current.textColor : nextCalendar.foregroundColor,
        } : {}),
        end: pendingCreation
          ? new Date(start.getTime() + durationMinutes * 60_000).toISOString()
          : current.end,
      };
    });
  };

  const toggleAllDay = (allDay: boolean) => {
    const day = startOfDay(start);
    updateDraft((current) => allDay
      ? { ...current, allDay: true, start: day.toISOString(), end: addDays(day, 1).toISOString() }
      : { ...current, allDay: false, start: setHours(day, 9).toISOString(), end: setHours(day, 10).toISOString() });
  };

  const createConference = async (
    candidate = edited,
    prerequisite?: Promise<boolean>,
  ) => {
    if (conferenceState === "creating") return;
    setConferenceError(null);
    setConferenceState("creating");
    try {
      if (prerequisite && !await prerequisite) {
        setConferenceState("idle");
        return;
      }
      const conferenceLink = await onCreateConference(candidate);
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

  const changeParticipants = (attendees: CalendarEvent["attendees"]) => {
    const shouldCreateConference = shouldAutoCreateEventConference({
      conferenceLink: edited.conferenceLink,
      currentParticipantCount: edited.attendees?.length ?? 0,
      nextParticipantCount: attendees?.length ?? 0,
      provider: edited.provider,
    });
    let candidate = edited;
    updateDraft((current) => {
      candidate = { ...current, attendees };
      return candidate;
    });
    if (
      shouldCreateConference
      && conferenceState !== "creating"
    ) {
      void createConference(candidate, flushUpdate());
    }
  };

  const submitAndFocusEvent = (keyboardEvent: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      keyboardEvent.nativeEvent.isComposing
      || !isEventDetailsSubmitShortcut({
        altKey: keyboardEvent.altKey,
        ctrlKey: keyboardEvent.ctrlKey,
        key: keyboardEvent.key,
        metaKey: keyboardEvent.metaKey,
        shiftKey: keyboardEvent.shiftKey,
      })
    ) return;
    keyboardEvent.preventDefault();
    keyboardEvent.stopPropagation();
    if (keyboardEvent.target instanceof Element) {
      keyboardEvent.target
        .closest<HTMLElement>(".event-description-content")
        ?.blur();
    }
    onFocusEvent(edited);
    void flushUpdate();
  };

  return (
    <div
      className="event-details event-editor"
      onKeyDownCapture={(keyboardEvent) => {
        if (keyboardEvent.target === titleRef.current) return;
        if (
          keyboardEvent.target instanceof Element
          && keyboardEvent.target.closest(".calendar-picker-search-input")
        ) return;
        submitAndFocusEvent(keyboardEvent);
      }}
      onKeyDown={(keyboardEvent) => {
        if (
          !(keyboardEvent.target instanceof Element)
          || !keyboardEvent.target.closest(".calendar-picker-search-input")
        ) return;
        submitAndFocusEvent(keyboardEvent);
      }}
    >
      <EventTitleEditor
        ref={titleRef}
        accentColor={edited.color}
        aria-label="Event title"
        calendars={calendars}
        data-sidebar-primary-focus
        excludeCurrentTitle
        onRecentTitleNavigation={deferUpdate}
        onRecentTitleUsed={(entry) => {
          applyRecentTitleMetadata(entry);
          onRecentTitleUsed(entry);
        }}
        recentTitles={recentTitles}
        value={titleDraft}
        onBlur={() => {
          if (skipTitleBlurCommitRef.current) {
            skipTitleBlurCommitRef.current = false;
            return;
          }
          void commitTitle();
        }}
        onValueChange={previewTitle}
        onKeyDown={(keyboardEvent) => {
            const titleAction = eventTitleEditAction({
              altKey: keyboardEvent.altKey,
              isComposing: keyboardEvent.nativeEvent.isComposing,
              key: keyboardEvent.key,
              shiftKey: keyboardEvent.shiftKey,
            });
            if (titleAction) {
              keyboardEvent.preventDefault();
              keyboardEvent.stopPropagation();
              if (titleAction === "cancel") cancelTitle();
              else void commitTitle();
              onFocusEvent(edited);
              return;
            }
            if (
              keyboardEvent.key === "Tab"
              && !keyboardEvent.shiftKey
              && !keyboardEvent.metaKey
              && !keyboardEvent.ctrlKey
              && !keyboardEvent.altKey
            ) {
              keyboardEvent.preventDefault();
              onCalendarPickerOpen();
            }
        }}
      />

      <section className="event-details-section event-editor-calendar-section">
        <div className="event-editor-calendar-select event-editor-select-field">
          <div className="event-editor-calendar-picker">
            <small>Calendar</small>
            <CalendarPicker
              calendars={editableCalendars}
              forcedOpen={openCalendarPicker}
              onChange={changeCalendar}
              onOpenChange={(open) => {
                if (!open) onCalendarPickerClose();
              }}
              value={edited.calendarId}
            />
          </div>
        </div>
      </section>

      <section className="event-details-section event-editor-time">
        <div className="event-details-row event-details-time-row event-editor-summary-row">
          <Clock3 size={15} />
          <div>
            <strong>
              <button
                aria-label={`Edit start date and time, currently ${format(start, "EEEE, MMMM d 'at' h:mm a")}`}
                data-active={focusedTimeField === "start" && showTimeDetails ? "true" : undefined}
                onClick={() => openTimeField("start")}
                type="button"
              >
                {format(start, "h:mm a")}
              </button>
              <span>→</span>
              <button
                aria-label={`Edit end date and time, currently ${format(end, "EEEE, MMMM d 'at' h:mm a")}`}
                data-active={focusedTimeField === "end" && showTimeDetails ? "true" : undefined}
                onClick={() => openTimeField("end")}
                type="button"
              >
                {format(end, "h:mm a")}
              </button>
              <em>{formatDuration(start, end)}</em>
            </strong>
            <button
              className="event-editor-date-token"
              onClick={() => openTimeField("start")}
              type="button"
            >
              {format(start, "EEEE, MMMM d")}{edited.allDay ? " · All day" : ""}{recurrenceLabel}
            </button>
          </div>
          <button
            aria-expanded={showTimeDetails}
            aria-label={showTimeDetails ? "Hide date and time controls" : "Edit date and time"}
            onClick={() => setShowTimeDetails((current) => !current)}
            title={showTimeDetails ? "Hide date and time controls" : "Edit date and time"}
            type="button"
          >
            <ChevronDown size={14} />
          </button>
        </div>
        {showTimeDetails && <div className="event-editor-time-details">
          <div className="event-editor-time-inputs">
          {edited.allDay ? (
            <label>
              <span>Date</span>
              <input
                aria-label="Event date"
                ref={startInputRef}
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
              <label data-active={focusedTimeField === "start" ? "true" : undefined}><span>Starts</span><input aria-label="Event start" ref={startInputRef} type="datetime-local" value={dateTimeInputValue(edited.start)} onChange={(input) => input.target.value && change({ start: new Date(input.target.value).toISOString() })} /></label>
              <label data-active={focusedTimeField === "end" ? "true" : undefined}><span>Ends</span><input aria-label="Event end" ref={endInputRef} type="datetime-local" value={dateTimeInputValue(edited.end)} onChange={(input) => input.target.value && change({ end: new Date(input.target.value).toISOString() })} /></label>
            </>
          )}
          </div>
          <div className="event-editor-inline-options">
            <label><input type="checkbox" checked={Boolean(edited.allDay)} onChange={(input) => toggleAllDay(input.target.checked)} /> All-day</label>
            <select aria-label="Time zone" value={zone} onChange={(input) => change({ timeZone: input.target.value })}>
              {timeZoneGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.zones.map((timeZone) => (
                    <option key={timeZone} value={timeZone}>
                      {timeZoneDisplayName(timeZone)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <label><Repeat2 size={13} /><select aria-label="Repeat" value={recurrence} disabled={Boolean(edited.recurringEventId)} onChange={(input) => change({ recurrence: recurrenceRule(input.target.value) })}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
          </div>
        </div>}
      </section>

      <section className="event-details-section event-editor-fields">
        <EventParticipantsEditor
          attendees={edited.attendees ?? []}
          onChange={changeParticipants}
          onRespond={edited.provider === "google"
            ? (_, responseStatus) => onRespond(edited, responseStatus)
            : undefined}
        />
        {(Boolean(edited.conferenceLink) || conferenceState !== "idle" || edited.provider === "google" && Boolean(edited.attendees?.length)) && <div className="event-editor-conference" data-state={conferenceState}>
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
        </div>}
        {showNotes ? (
          <div className="event-editor-description"><AlignLeft size={15} /><EventDescriptionEditor autoFocus={focusedOptionalField === "notes"} value={edited.description ?? ""} onChange={previewDescription} onBlur={commitDescription} /></div>
        ) : (
          <button className="event-editor-optional-trigger" onClick={() => { setFocusedOptionalField("notes"); setShowNotes(true); }} type="button"><AlignLeft size={15} />Add notes</button>
        )}
        <label className="event-editor-reminder event-editor-select-field">
          <Bell size={15} />
          <span className="event-editor-reminder-control">
            <input
              aria-label="Reminder minutes before"
              inputMode="numeric"
              min="0"
              onChange={(input) => {
                const value = input.target.value;
                change({
                  reminders: value === ""
                    ? { useDefault: true }
                    : {
                        useDefault: false,
                        overrides: [{ method: "popup", minutes: Number(value) }],
                      },
                });
              }}
              placeholder="Default reminder"
              step="1"
              type="number"
              value={reminderMinutes}
            />
            {reminderMinutes !== "" && <em>minutes before</em>}
          </span>
        </label>
      </section>

      <section className="event-details-section event-editor-preferences">
        <EventColorPicker
          autoFocus={colorPickerFocusRequested}
          calendarColor={editedCalendar?.backgroundColor ?? edited.calendarColor}
          calendarTextColor={editedCalendar?.foregroundColor ?? "#ffffff"}
          colorId={event.colorId}
          customColor={event.customColor}
          onAutoFocused={onColorPickerAutoFocused}
          onCancel={cancelColorPreview}
          onCommit={commitColor}
          onExit={() => onFocusEvent(event)}
          onPreview={previewColor}
        />
        <button
          aria-expanded={showAdvancedPreferences}
          className="event-editor-more-trigger"
          onClick={() => setShowAdvancedPreferences((current) => !current)}
          type="button"
        >
          <SlidersHorizontal size={14} />
          More options
          <ChevronDown size={14} />
        </button>
        {showAdvancedPreferences && <div className="event-editor-advanced-options">
          {showLocation ? (
            <label className="event-editor-advanced-field"><MapPin size={15} /><input aria-label="Location" autoFocus={focusedOptionalField === "location"} placeholder="Location" value={edited.location ?? ""} onChange={(input) => change({ location: input.target.value })} /></label>
          ) : (
            <button className="event-editor-optional-trigger" onClick={() => { setFocusedOptionalField("location"); setShowLocation(true); }} type="button"><MapPin size={15} />Add location</button>
          )}
          {showAttachment ? (
            <label className="event-editor-advanced-field"><Link2 size={15} /><input aria-label="Links and attachments" autoFocus={focusedOptionalField === "attachment"} placeholder="Add link or Google Drive attachment" type="url" value={attachmentUrl} onChange={(input) => change({ attachments: input.target.value ? [{ fileUrl: input.target.value }] : [] })} /></label>
          ) : (
            <button className="event-editor-optional-trigger" onClick={() => { setFocusedOptionalField("attachment"); setShowAttachment(true); }} type="button"><Link2 size={15} />Add link or attachment</button>
          )}
          <div className="event-editor-pair">
            <label className="event-editor-select-field"><small>Availability</small><select aria-label="Availability" value={edited.transparency ?? "opaque"} onChange={(input) => change({ transparency: input.target.value as CalendarEvent["transparency"] })}><option value="opaque">Busy</option><option value="transparent">Available</option></select></label>
            <label className="event-editor-select-field"><small>Visibility</small><select aria-label="Visibility" value={edited.visibility ?? "default"} onChange={(input) => change({ visibility: input.target.value as CalendarEvent["visibility"] })}><option value="default">Default visibility</option><option value="private">Private</option><option value="public">Public</option></select></label>
          </div>
        </div>}
      </section>

      {edited.htmlLink && <a className="event-details-open event-editor-original" href={edited.htmlLink} target="_blank" rel="noreferrer">Open original event <ExternalLink size={13} /></a>}
    </div>
  );
}

export function EventCreationSidebar({
  openSelectedEventCalendarPicker,
  selectedEventColorPickerFocusRequested,
  selectedEventTitleFocusMode,
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
  onDraftPreviewChange,
  onFocusWithinChange,
  onFocusEvent,
  onRemoveSelection,
  onSelectedEventCalendarPickerClose,
  onSelectedEventCalendarPickerOpen,
  onSelectedEventColorPickerAutoFocused,
  onSelectedEventTitleAutoFocused,
  onPreviewEvent,
  onCreateFromRecent,
  onRecentTitleUsed,
  onRespondToEvent,
  onUpdateEvent,
  selectedEvents,
  recentTitles,
  selectedEventPendingCreation,
  syncPausedEventIds,
}: EventCreationSidebarProps) {
  const [title, setTitle] = React.useState("");
  const [calendarId, setCalendarId] = React.useState(draft?.calendarId ?? "");
  const [creationCalendarPickerOpen, setCreationCalendarPickerOpen] = React.useState(false);
  const selectedEvent = selectedEvents.length === 1 ? selectedEvents[0] : null;
  const selectedCalendar = selectedEvent ? calendarSources.find((calendar) => calendar.id === selectedEvent.calendarId) ?? null : null;
  const creationCalendar = calendars.find((calendar) => calendar.id === calendarId)
    ?? calendars[0]
    ?? null;
  const isShowingSelection = selectedEvents.length > 0 && !draft;
  const isShowingMultiSelection = selectedEvents.length > 1 && !draft;
  const submitCreation = () => {
    const normalizedTitle = title.trim();
    if (normalizedTitle) onCreate(normalizedTitle, calendarId);
  };

  return (
    <div
      className="event-sidebar-panel"
      aria-label={isShowingSelection ? "Event details" : "Create event"}
      data-event-creation-surface="true"
      onBlurCapture={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
          return;
        }
        onFocusWithinChange(false);
      }}
      onFocusCapture={() => onFocusWithinChange(true)}
    >
      <div className="event-creation-heading">
        <div>{isShowingSelection ? <CalendarDays size={17} /> : <CalendarPlus size={17} />}<span><strong>{isShowingMultiSelection ? `${selectedEvents.length} events` : isShowingSelection ? "Event details" : "New event"}</strong>{selectedEvents.some(({ id }) => syncPausedEventIds.has(id)) ? <small className="event-unsynced-label">Unsynced · editing keeps sync paused</small> : !selectedEvent && <small>{isShowingMultiSelection ? "Bulk edit selection" : "Add it to your calendar"}</small>}</span></div>
        {(draft || isShowingSelection) && <button className="icon-button" onClick={draft ? onCancel : onClearSelection} aria-label={draft ? "Cancel event creation" : "Close event details"}><X size={16} /></button>}
      </div>

      {draft ? (
        <form
          className="event-details event-editor event-creation-form"
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || !isEventDetailsSubmitShortcut({
              altKey: event.altKey,
              ctrlKey: event.ctrlKey,
              key: event.key,
              metaKey: event.metaKey,
              shiftKey: event.shiftKey,
            })) return;
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.requestSubmit();
          }}
          onSubmit={(event) => {
            event.preventDefault();
            submitCreation();
          }}
        >
          <EventTitleEditor
            accentColor={creationCalendar?.backgroundColor ?? "#9ba1ad"}
            aria-label="Event name"
            autoFocus
            calendars={calendars}
            onRecentTitleUsed={(entry) => {
              onRecentTitleUsed(entry);
              onCreateFromRecent(entry);
            }}
            recentTitles={recentTitles}
            onKeyDown={(event) => {
              if (
                event.key !== "Tab"
                || event.shiftKey
                || event.metaKey
                || event.ctrlKey
                || event.altKey
              ) return;
              event.preventDefault();
              setCreationCalendarPickerOpen(true);
            }}
            onSubmit={submitCreation}
            onValueChange={(nextTitle) => {
              setTitle(nextTitle);
              onDraftPreviewChange({ calendarId, title: nextTitle });
            }}
            placeholder="What are you planning?"
            value={title}
          />
          <section className="event-details-section event-editor-calendar-section">
            <div className="event-editor-calendar-select event-editor-select-field">
              <span
                className="event-details-calendar-color"
                style={{ backgroundColor: creationCalendar?.backgroundColor ?? "#9ba1ad" }}
              />
              <div className="event-editor-calendar-picker">
                <small>Calendar</small>
                <CalendarPicker
                  calendars={calendars}
                  forcedOpen={creationCalendarPickerOpen}
                  onChange={(nextCalendarId) => {
                    setCalendarId(nextCalendarId);
                    onDraftPreviewChange({ calendarId: nextCalendarId, title });
                  }}
                  onOpenChange={setCreationCalendarPickerOpen}
                  value={calendarId}
                />
              </div>
            </div>
          </section>
          <section className="event-details-section event-editor-time">
            <div className="event-details-row event-details-time-row">
              <Clock3 size={15} />
              <div>
                <strong>
                  {format(draft.start, "h:mm a")}
                  <span>→</span>
                  {format(draft.end, "h:mm a")}
                  <em>{formatDuration(draft.start, draft.end)}</em>
                </strong>
                <small>{format(draft.start, "EEEE, MMMM d")}</small>
              </div>
            </div>
          </section>
          <div className="event-creation-actions"><button type="button" onClick={onCancel}>Cancel</button><button className="event-create-button" type="submit" disabled={!title.trim()}>Create event</button></div>
        </form>
      ) : selectedEvent ? (
        <EventDetailsEditor
          openCalendarPicker={openSelectedEventCalendarPicker}
          colorPickerFocusRequested={selectedEventColorPickerFocusRequested}
          titleFocusMode={selectedEventTitleFocusMode}
          calendar={selectedCalendar}
          calendars={calendars}
          event={selectedEvent}
          onCreateConference={onCreateConference}
          onFocusEvent={onFocusEvent}
          onRecentTitleUsed={onRecentTitleUsed}
          onTitleAutoFocused={onSelectedEventTitleAutoFocused}
          onPreview={onPreviewEvent}
          onRespond={onRespondToEvent}
          onCalendarPickerClose={onSelectedEventCalendarPickerClose}
          onCalendarPickerOpen={onSelectedEventCalendarPickerOpen}
          onColorPickerAutoFocused={onSelectedEventColorPickerAutoFocused}
          onUpdate={onUpdateEvent}
          pendingCreation={selectedEventPendingCreation}
          recentTitles={recentTitles}
        />
      ) : selectedEvents.length > 1 ? (
        <MultiEventSidebar
          calendars={calendarSources}
          editableCalendars={calendars}
          events={selectedEvents}
          openCalendarPicker={openSelectedEventCalendarPicker}
          onBulkUpdate={onBulkUpdateEvents}
          onCalendarPickerClose={onSelectedEventCalendarPickerClose}
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

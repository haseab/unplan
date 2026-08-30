"use client";

import { ArrowLeft, CalendarPlus, Check, Clock3, Type, X } from "lucide-react";
import * as React from "react";
import { CalendarPicker } from "@/components/calendar-picker";
import type { CalendarSource } from "@/lib/calendar-types";
import { parseEventTime, type ParsedEventTime } from "@/lib/natural-language-event-time";

type NewTimeEntryDialogProps = {
  calendars: CalendarSource[];
  defaultCalendarId: string | null;
  onClose: () => void;
  onCreate: (entry: ParsedEventTime & { calendarId: string; title: string }) => void;
};

type Step = "calendar" | "title" | "when";

const stepNumber = (step: Step) => step === "title" ? 1 : step === "calendar" ? 2 : 3;

export function NewTimeEntryDialog({
  calendars,
  defaultCalendarId,
  onClose,
  onCreate,
}: NewTimeEntryDialogProps) {
  const [step, setStep] = React.useState<Step>("title");
  const [when, setWhen] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [calendarId, setCalendarId] = React.useState(defaultCalendarId);
  const [error, setError] = React.useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const whenRef = React.useRef<HTMLInputElement>(null);

  React.useLayoutEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  React.useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || calendarOpen) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", closeOnEscape, true);
    return () => document.removeEventListener("keydown", closeOnEscape, true);
  }, [calendarOpen, onClose]);

  const advanceWhen = (value = when) => {
    const parsed = parseEventTime(value);
    if (!parsed) {
      setError("Couldn’t understand that time. Try “tomorrow 5–6pm” or “next Friday at noon.”");
      return;
    }
    setWhen(value);
    setError(null);
    if (!calendarId || !title.trim()) return;
    onCreate({ ...parsed, calendarId, title: title.trim() });
  };

  const advanceTitle = (value = title) => {
    const trimmedTitle = value.trim();
    if (!trimmedTitle) {
      setError("Give this time entry a title.");
      return;
    }
    setTitle(trimmedTitle);
    setError(null);
    setStep("calendar");
    setCalendarOpen(true);
  };

  const selectedCalendar = calendars.find((calendar) => calendar.id === calendarId) ?? null;

  return (
    <div className="modal-backdrop new-time-entry-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="new-time-entry-title"
        aria-modal="true"
        className="new-time-entry-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="new-time-entry-heading">
          <div>
            <CalendarPlus aria-hidden="true" size={17} />
            <span>
              <strong id="new-time-entry-title">New time entry</strong>
              <small>Step {stepNumber(step)} of 3</small>
            </span>
          </div>
          <button aria-label="Close new time entry" className="icon-button" onClick={onClose} type="button"><X size={15} /></button>
        </header>

        <div className="new-time-entry-progress" aria-hidden="true">
          {[1, 2, 3].map((number) => <span data-complete={number <= stepNumber(step)} key={number} />)}
        </div>

        <div className="new-time-entry-body">
          {step === "when" && (
            <form onSubmit={(event) => { event.preventDefault(); advanceWhen(); }}>
              <button className="new-time-entry-back" onClick={() => { setStep("calendar"); setCalendarOpen(true); }} type="button"><ArrowLeft size={15} /> Change calendar</button>
              <div className="new-time-entry-summary">
                <Check size={15} />
                <span><strong>{title.trim()}</strong><small>{selectedCalendar?.name ?? "Choose a calendar"}</small></span>
              </div>
              <label htmlFor="new-entry-when"><Clock3 size={15} />When should it happen?</label>
              <input
                autoComplete="off"
                id="new-entry-when"
                onChange={(event) => { setWhen(event.target.value); setError(null); }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  advanceWhen(event.currentTarget.value);
                }}
                placeholder="5pm to 6pm"
                ref={whenRef}
                value={when}
              />
              <p className="new-time-entry-hint">Try “tomorrow 9–10”, “next Friday at 3 for 45 minutes,” or “all day Monday.”</p>
              {error && <p className="new-time-entry-error" role="alert">{error}</p>}
              <button className="new-time-entry-primary" disabled={!when.trim()} type="submit">Create time entry <kbd>↵</kbd></button>
            </form>
          )}

          {step === "title" && (
            <form onSubmit={(event) => { event.preventDefault(); advanceTitle(); }}>
              <label htmlFor="new-entry-title-input"><Type size={15} />What’s the title?</label>
              <input
                autoComplete="off"
                id="new-entry-title-input"
                onChange={(event) => { setTitle(event.target.value); setError(null); }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  advanceTitle(event.currentTarget.value);
                }}
                placeholder="Call with manager"
                ref={titleRef}
                value={title}
              />
              {error && <p className="new-time-entry-error" role="alert">{error}</p>}
              <button className="new-time-entry-primary" disabled={!title.trim()} type="submit">Choose calendar <kbd>↵</kbd></button>
            </form>
          )}

          {step === "calendar" && (
            <div className="new-time-entry-calendar-step">
              <button className="new-time-entry-back" onClick={() => { setCalendarOpen(false); setStep("title"); window.requestAnimationFrame(() => titleRef.current?.focus()); }} type="button"><ArrowLeft size={15} /> Change title</button>
              <div className="new-time-entry-summary"><Check size={15} /><span><strong>{title.trim()}</strong></span></div>
              <label><CalendarPlus size={15} />Which calendar?</label>
              <CalendarPicker
                ariaLabel="Calendar for new time entry"
                calendars={calendars}
                forcedOpen={calendarOpen}
                onChange={(nextCalendarId) => {
                  setCalendarId(nextCalendarId);
                  setCalendarOpen(false);
                  setStep("when");
                  window.requestAnimationFrame(() => whenRef.current?.focus({ preventScroll: true }));
                }}
                onOpenChange={setCalendarOpen}
                value={calendarId}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

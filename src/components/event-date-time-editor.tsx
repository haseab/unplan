"use client";

import * as React from "react";
import { addDays, addMonths, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ArrowRight, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { parseCalendarDateCommand } from "@/lib/calendar-date-command";
import { changeEventClockTime, moveEventToDay, setEventEndDay } from "@/lib/event-date-editing";
import type { CalendarEvent } from "@/lib/calendar-types";

type Props = {
  event: CalendarEvent;
  focusField: "start" | "end" | null;
  onChange: (change: Partial<CalendarEvent>) => void;
};

export function EventDateTimeEditor({ event, focusField, onChange }: Props) {
  const start = new Date(event.start), end = new Date(event.end);
  const [month, setMonth] = React.useState(() => startOfMonth(start));
  const [query, setQuery] = React.useState("");
  const [invalid, setInvalid] = React.useState(false);
  const [dayTarget, setDayTarget] = React.useState<"start" | "end">(focusField === "end" && !event.allDay ? "end" : "start");
  const queryRef = React.useRef<HTMLInputElement>(null);
  const endRef = React.useRef<HTMLInputElement>(null);
  const feedbackId = React.useId();
  const parsed = query.trim() ? parseCalendarDateCommand(query) : null;
  const gridStart = startOfWeek(startOfMonth(month));
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));

  React.useEffect(() => {
    (focusField === "end" && !event.allDay ? endRef.current : queryRef.current)?.focus({ preventScroll: true });
  }, [focusField, event.allDay]);

  const chooseDay = (day: Date) => {
    const change = dayTarget === "end" ? setEventEndDay(event, day) : moveEventToDay(event, day);
    if (!change) { setInvalid(true); return; }
    onChange(change);
    setMonth(startOfMonth(day));
    setQuery("");
    setInvalid(false);
  };
  const submit = () => {
    if (parsed) chooseDay(parsed);
    else setInvalid(true);
  };

  return (
    <div className="event-date-editor">
      <label className="event-date-command">
        <CalendarDays size={16} aria-hidden="true" />
        <input aria-label={dayTarget === "end" ? "Set event end day" : "Set event day"} aria-describedby={feedbackId} aria-invalid={invalid || undefined}
          placeholder="Tomorrow, next Friday, Oct 24…" ref={queryRef} value={query}
          onChange={(e) => { setQuery(e.target.value); setInvalid(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); e.stopPropagation(); submit(); }
            if (e.key === "Escape" && query) { e.preventDefault(); e.stopPropagation(); setQuery(""); setInvalid(false); }
          }} />
        <button aria-label="Apply event day" disabled={!parsed} onClick={submit} type="button"><ArrowRight size={16} /></button>
      </label>
      <p id={feedbackId} className="event-date-feedback" role="status">
        {invalid ? "Choose a valid date. The end must be after the start." : parsed ? `${dayTarget === "end" ? "End on" : "Move to"} ${format(parsed, "EEEE, MMM d, yyyy")} · Enter to apply` : dayTarget === "end" ? "Choose the end day. The start stays the same." : "Choose a day. Your time and duration stay the same."}
      </p>
      <div className="event-date-quick-actions">
        {["Today", "Tomorrow", "Next Monday"].map((label) => <button key={label} type="button" onClick={() => {
          const day = parseCalendarDateCommand(label); if (day) chooseDay(day);
        }}>{label}</button>)}
      </div>
      {!event.allDay && <div className="event-date-target" role="group" aria-label="Date to change">
        <button type="button" aria-pressed={dayTarget === "start"} onClick={() => { setDayTarget("start"); setInvalid(false); }}>Move event</button>
        <button type="button" aria-pressed={dayTarget === "end"} onClick={() => { setDayTarget("end"); setInvalid(false); }}>End day</button>
      </div>}
      <div className="event-date-month-header">
        <strong>{format(month, "MMMM yyyy")}</strong>
        <div>
          <button aria-label="Previous month" type="button" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft size={16} /></button>
          <button aria-label="Next month" type="button" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="event-date-grid" role="group" aria-label="Choose event day">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span className="event-date-weekday" key={day}>{day}</span>)}
        {days.map(day => <button key={format(day, "yyyy-MM-dd")} type="button"
          aria-label={format(day, "EEEE, MMMM d, yyyy")} aria-pressed={isSameDay(day, dayTarget === "end" ? end : start)}
          data-outside={!isSameMonth(day, month) || undefined} data-today={isSameDay(day, new Date()) || undefined}
          onClick={() => chooseDay(day)}>{format(day, "d")}</button>)}
      </div>
      {!event.allDay && <div className="event-date-clock-fields">
        {(["start", "end"] as const).map(field => <label key={field}>
          <span>{field === "start" ? "Starts" : "Ends"}</span>
          <input aria-label={field === "start" ? "Event start time" : "Event end time"} type="time"
            ref={field === "end" ? endRef : undefined} value={format(field === "start" ? start : end, "HH:mm")}
            onChange={e => { const next = changeEventClockTime(event, field, e.target.value); if (next) onChange(next); }} />
          {field === "end" && !isSameDay(start, end) && <small>{format(end, "EEE, MMM d")}</small>}
        </label>)}
      </div>}
    </div>
  );
}

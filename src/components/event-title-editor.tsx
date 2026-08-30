"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { Clock3 } from "lucide-react";
import * as React from "react";
import {
  EventTitleField,
  type EventTitleFieldProps,
} from "@/components/event-title-field";
import type { CalendarSource } from "@/lib/calendar-types";
import {
  searchRecentEventTitles,
  type RecentEventTitle,
} from "@/lib/recent-event-titles";

type EventTitleEditorProps = EventTitleFieldProps & {
  calendars: CalendarSource[];
  excludeCurrentTitle?: boolean;
  onRecentTitleNavigation?: () => void;
  onRecentTitleUsed: (entry: RecentEventTitle) => void;
  recentTitles: RecentEventTitle[];
};

const formatDuration = (minutes: number) => {
  if (minutes >= 24 * 60 && minutes % (24 * 60) === 0) {
    const days = minutes / (24 * 60);
    return `${days}d`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (!hours) return `${remaining}m`;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
};

export const EventTitleEditor = React.forwardRef<
  HTMLTextAreaElement,
  EventTitleEditorProps
>(function EventTitleEditor({
  calendars,
  excludeCurrentTitle = false,
  onBlur,
  onFocus,
  onKeyDown,
  onRecentTitleNavigation,
  onRecentTitleUsed,
  onValueChange,
  recentTitles,
  value,
  ...props
}, forwardedRef) {
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [dismissed, setDismissed] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const listboxId = React.useId();

  React.useImperativeHandle(forwardedRef, () => inputRef.current!, []);

  const results = React.useMemo(() => searchRecentEventTitles(
    recentTitles,
    touched ? value : "",
    {
      excludeTitle: excludeCurrentTitle && !touched ? value : undefined,
      limit: 5,
    },
  ), [excludeCurrentTitle, recentTitles, touched, value]);
  const open = focused && !dismissed && results.length > 0;
  const calendarNames = React.useMemo(
    () => new Map(calendars.map((calendar) => [calendar.id, calendar.name])),
    [calendars],
  );

  React.useEffect(() => {
    if (activeIndex >= results.length) setActiveIndex(results.length - 1);
  }, [activeIndex, results.length]);

  const choose = (entry: RecentEventTitle) => {
    onValueChange(entry.title);
    onRecentTitleUsed(entry);
    setTouched(true);
    setDismissed(true);
    setActiveIndex(-1);
    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      input.setSelectionRange(entry.title.length, entry.title.length);
    });
  };

  return (
    <div className="event-title-editor" data-open={open ? "true" : undefined}>
      <EventTitleField
        {...props}
        aria-activedescendant={open && activeIndex >= 0
          ? `${listboxId}-option-${activeIndex}`
          : undefined}
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        onBlur={(event) => {
          setFocused(false);
          setActiveIndex(-1);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          setDismissed(false);
          onFocus?.(event);
        }}
        onKeyDown={(event) => {
          if (open && event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setDismissed(true);
            setActiveIndex(-1);
            return;
          }
          if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            onRecentTitleNavigation?.();
            const delta = event.key === "ArrowDown" ? 1 : -1;
            setActiveIndex((current) => {
              const start = current < 0 ? (delta > 0 ? -1 : 0) : current;
              return (start + delta + results.length) % results.length;
            });
            return;
          }
          if (
            open
            && event.key === "Enter"
            && activeIndex >= 0
            && !event.metaKey
            && !event.ctrlKey
            && !event.altKey
            && !event.shiftKey
          ) {
            event.preventDefault();
            event.stopPropagation();
            choose(results[activeIndex]);
            return;
          }
          if (event.key === "Tab") {
            setDismissed(true);
            setActiveIndex(-1);
          }
          onKeyDown?.(event);
        }}
        onValueChange={(nextValue) => {
          setTouched(true);
          setDismissed(false);
          setActiveIndex(0);
          onValueChange(nextValue);
        }}
        ref={inputRef}
        value={value}
      />

      {open && (
        <section className="recent-event-titles" aria-label="Recent timers">
          <header><Clock3 size={12} /><span>Recent timers</span><small>↑↓ to browse</small></header>
          <div id={listboxId} role="listbox" aria-label="Recent event titles">
            {results.map((entry, index) => (
              <button
                aria-selected={index === activeIndex}
                className="recent-event-title-option"
                id={`${listboxId}-option-${index}`}
                key={entry.normalizedTitle}
                onClick={() => choose(entry)}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
                type="button"
              >
                <span
                  className="recent-event-title-color"
                  style={{ backgroundColor: entry.calendarColor }}
                />
                <span className="recent-event-title-copy">
                  <strong>{entry.title}</strong>
                  <small>
                    {calendarNames.get(entry.calendarId) ?? "Calendar"}
                    <span aria-hidden="true"> · </span>
                    {formatDistanceToNowStrict(entry.lastUsedAt, { addSuffix: true })}
                  </small>
                </span>
                <em>{formatDuration(entry.durationMinutes)}</em>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
});

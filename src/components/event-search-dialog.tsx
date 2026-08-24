"use client";

import { format, parseISO } from "date-fns";
import { CornerDownLeft, LoaderCircle, MapPin, Search, X } from "lucide-react";
import * as React from "react";
import type { CalendarEvent, CalendarSource } from "@/lib/calendar-types";
import type { EventSearchTimeRange } from "@/lib/event-search";

type SearchStatus = "idle" | "loading" | "ready" | "error";

type EventSearchDialogProps = {
  calendars: CalendarSource[];
  onOpenChange: (open: boolean) => void;
  onSelect: (event: CalendarEvent) => void;
  open: boolean;
  searchEvents: (
    query: string,
    timeRange: EventSearchTimeRange,
    signal: AbortSignal,
    onPartialResults: (results: CalendarEvent[]) => void,
  ) => Promise<CalendarEvent[]>;
};

const SEARCH_DEBOUNCE_MS = 180;
const MINIMUM_QUERY_LENGTH = 2;
const resultKey = (event: CalendarEvent) => `${event.calendarId}:${event.id}`;
const TIME_RANGES: Array<{ label: string; value: EventSearchTimeRange }> = [
  { label: "All", value: "all" },
  { label: "Future", value: "future" },
  { label: "Past", value: "past" },
];

const eventDateLabel = (event: CalendarEvent) => {
  const start = parseISO(event.start);
  return event.allDay
    ? format(start, "EEE, MMM d, yyyy · 'All day'")
    : format(start, "EEE, MMM d, yyyy · h:mm a");
};

export function EventSearchDialog({
  calendars,
  onOpenChange,
  onSelect,
  open,
  searchEvents,
}: EventSearchDialogProps) {
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [error, setError] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<CalendarEvent[]>([]);
  const [status, setStatus] = React.useState<SearchStatus>("idle");
  const [timeRange, setTimeRange] = React.useState<EventSearchTimeRange>("all");
  const dialogRef = React.useRef<HTMLElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const activeResultKeyRef = React.useRef<string | null>(null);
  const listboxId = React.useId();

  const calendarNames = React.useMemo(
    () => new Map(calendars.map((calendar) => [calendar.id, calendar.name])),
    [calendars],
  );

  React.useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < MINIMUM_QUERY_LENGTH) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setStatus("loading");
      setError("");
      const applyResults = (nextResults: CalendarEvent[], complete: boolean) => {
        if (controller.signal.aborted) return;
        setResults(nextResults);
        setActiveIndex(() => {
          const preservedIndex = activeResultKeyRef.current
            ? nextResults.findIndex(
              (event) => resultKey(event) === activeResultKeyRef.current,
            )
            : -1;
          const nextIndex = preservedIndex >= 0
            ? preservedIndex
            : nextResults.length ? 0 : -1;
          activeResultKeyRef.current = nextIndex >= 0
            ? resultKey(nextResults[nextIndex])
            : null;
          return nextIndex;
        });
        setStatus(complete ? "ready" : "loading");
      };
      void searchEvents(
        normalizedQuery,
        timeRange,
        controller.signal,
        (partialResults) => applyResults(partialResults, false),
      )
        .then((nextResults) => {
          applyResults(nextResults, true);
        })
        .catch((searchError: unknown) => {
          if (controller.signal.aborted) return;
          setResults([]);
          setActiveIndex(-1);
          setError(
            searchError instanceof Error
              ? searchError.message
              : "Events could not be searched",
          );
          setStatus("error");
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query, searchEvents, timeRange]);

  React.useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`${listboxId}-option-${activeIndex}`)?.scrollIntoView({
      block: "nearest",
    });
  }, [activeIndex, listboxId]);

  if (!open) return null;

  const chooseResult = (event: CalendarEvent) => {
    onSelect(event);
    onOpenChange(false);
  };

  const updateQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    activeResultKeyRef.current = null;
    setActiveIndex(-1);
    setError("");
    setResults([]);
    setStatus(
      nextQuery.trim().length < MINIMUM_QUERY_LENGTH ? "idle" : "loading",
    );
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
      return;
    }
    if (
      ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.key)
      && results.length
    ) {
      event.preventDefault();
      const delta = event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : -1;
      setActiveIndex((current) => {
        const startIndex = current >= 0 ? current : delta > 0 ? -1 : 0;
        const nextIndex = (startIndex + delta + results.length) % results.length;
        activeResultKeyRef.current = resultKey(results[nextIndex]);
        return nextIndex;
      });
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      chooseResult(results[activeIndex]);
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;

    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled])",
    )];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const prompt = query.trim().length < MINIMUM_QUERY_LENGTH
    ? "Type at least two characters to search events."
    : status === "loading" && results.length === 0
      ? `Searching ${timeRange} events…`
      : status === "error"
        ? error
        : results.length === 0
          ? `No events found for “${query.trim()}”.`
          : "";

  return (
    <div className="modal-backdrop" onMouseDown={() => onOpenChange(false)}>
      <section
        ref={dialogRef}
        className="event-search-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-search-title"
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="event-search-heading">
          <Search size={18} aria-hidden="true" />
          <label id="event-search-title" htmlFor="event-search-input">
            Search events
          </label>
          <button
            className="icon-button"
            onClick={() => onOpenChange(false)}
            aria-label="Close event search"
          >
            <X size={16} />
          </button>
        </div>
        <div className="event-search-input-row">
          <Search size={15} aria-hidden="true" />
          <input
            ref={inputRef}
            id="event-search-input"
            type="search"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="Find titles, locations, or guests…"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={results.length > 0}
            aria-activedescendant={
              activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
            }
          />
          {status === "loading" && <LoaderCircle className="spin" size={15} />}
        </div>

        <div className="event-search-time-filter" role="group" aria-label="Event time range">
          {TIME_RANGES.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              aria-pressed={timeRange === value}
              onClick={() => {
                if (timeRange === value) return;
                setTimeRange(value);
                activeResultKeyRef.current = null;
                setActiveIndex(-1);
                setError("");
                setResults([]);
                setStatus(
                  query.trim().length < MINIMUM_QUERY_LENGTH ? "idle" : "loading",
                );
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="event-search-results" id={listboxId} role="listbox">
          {prompt ? (
            <div className={`event-search-empty ${status === "error" ? "event-search-error" : ""}`}>
              {prompt}
            </div>
          ) : results.map((event, index) => (
            <button
              key={`${event.calendarId}-${event.id}`}
              id={`${listboxId}-option-${index}`}
              className={index === activeIndex ? "event-search-result-active" : ""}
              role="option"
              aria-selected={index === activeIndex}
              onClick={() => chooseResult(event)}
              onMouseMove={() => {
                activeResultKeyRef.current = resultKey(event);
                setActiveIndex(index);
              }}
            >
              <span
                className="event-search-color"
                style={{ background: event.color || event.calendarColor }}
                aria-hidden="true"
              />
              <span className="event-search-result-copy">
                <strong>{event.title}</strong>
                <small>
                  <span>{eventDateLabel(event)}</span>
                  <span>{calendarNames.get(event.calendarId) ?? "Calendar"}</span>
                  {event.location && (
                    <span><MapPin size={10} />{event.location}</span>
                  )}
                </small>
              </span>
              <CornerDownLeft size={14} aria-hidden="true" />
            </button>
          ))}
        </div>

        <div className="event-search-footer">
          <span><kbd>←</kbd><kbd>→</kbd> Cycle</span>
          <span><kbd>↵</kbd> Open</span>
          <span><kbd>Esc</kbd> Close</span>
        </div>
      </section>
    </div>
  );
}

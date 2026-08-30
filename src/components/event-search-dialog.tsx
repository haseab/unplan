"use client";

import { format, parseISO } from "date-fns";
import { CalendarDays, CornerDownLeft, ListTodo, LoaderCircle, MapPin, Search, X } from "lucide-react";
import * as React from "react";
import type { CalendarEvent, CalendarSource } from "@/lib/calendar-types";
import type { EventSearchTimeRange } from "@/lib/event-search";
import type { TodoistTask } from "@/lib/todoist";
import {
  searchTodoistTasks,
  type TodoistTaskSearchResult,
} from "@/lib/todoist-calendar";

type SearchStatus = "idle" | "loading" | "ready" | "error";

type EventSearchDialogProps = {
  calendars: CalendarSource[];
  onOpenChange: (open: boolean) => void;
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectTask: (task: TodoistTask) => void;
  open: boolean;
  searchEvents: (
    query: string,
    timeRange: EventSearchTimeRange,
    signal: AbortSignal,
    onPartialResults: (results: CalendarEvent[]) => void,
  ) => Promise<CalendarEvent[]>;
  tasks: TodoistTask[];
};

type UnifiedSearchResult =
  | { event: CalendarEvent; kind: "event" }
  | ({ kind: "task" } & TodoistTaskSearchResult);

const SEARCH_DEBOUNCE_MS = 180;
const MINIMUM_QUERY_LENGTH = 2;
const resultKey = (result: UnifiedSearchResult) => result.kind === "event"
  ? `event:${result.event.calendarId}:${result.event.id}`
  : `task:${result.task.id}`;
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
  onSelectEvent,
  onSelectTask,
  open,
  searchEvents,
  tasks,
}: EventSearchDialogProps) {
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [error, setError] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<UnifiedSearchResult[]>([]);
  const [status, setStatus] = React.useState<SearchStatus>("idle");
  const [timeRange, setTimeRange] = React.useState<EventSearchTimeRange>("past");
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
      const taskResults: UnifiedSearchResult[] = searchTodoistTasks(
        tasks,
        normalizedQuery,
      ).map((result) => ({ ...result, kind: "task" }));
      const applyResults = (nextEvents: CalendarEvent[], complete: boolean) => {
        if (controller.signal.aborted) return;
        const nextResults: UnifiedSearchResult[] = [
          ...nextEvents.map((event): UnifiedSearchResult => ({ event, kind: "event" })),
          ...taskResults,
        ];
        setResults(nextResults);
        setActiveIndex(() => {
          const preservedIndex = activeResultKeyRef.current
            ? nextResults.findIndex(
              (result) => resultKey(result) === activeResultKeyRef.current,
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
      applyResults([], false);
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
          setResults(taskResults);
          setActiveIndex(taskResults.length ? 0 : -1);
          activeResultKeyRef.current = taskResults.length
            ? resultKey(taskResults[0])
            : null;
          setError(
            searchError instanceof Error
              ? searchError.message
              : "Events could not be searched",
          );
          setStatus(taskResults.length ? "ready" : "error");
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query, searchEvents, tasks, timeRange]);

  React.useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`${listboxId}-option-${activeIndex}`)?.scrollIntoView({
      block: "nearest",
    });
  }, [activeIndex, listboxId]);

  if (!open) return null;

  const chooseResult = (result: UnifiedSearchResult) => {
    if (result.kind === "event") onSelectEvent(result.event);
    else onSelectTask(result.task);
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
    ? "Type at least two characters to search events and tasks."
    : status === "loading" && results.length === 0
      ? "Searching events and tasks…"
      : status === "error"
        ? error
        : results.length === 0
          ? `No events or tasks found for “${query.trim()}”.`
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
            Search events and tasks
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
            placeholder="Find events, tasks, folders, or guests…"
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
          ) : results.map((result, index) => (
            <button
              key={resultKey(result)}
              id={`${listboxId}-option-${index}`}
              className={index === activeIndex ? "event-search-result-active" : ""}
              role="option"
              aria-selected={index === activeIndex}
              onClick={() => chooseResult(result)}
              onMouseMove={() => {
                activeResultKeyRef.current = resultKey(result);
                setActiveIndex(index);
              }}
            >
              {result.kind === "event" ? (
                <>
                  <span
                    className="event-search-color"
                    style={{ background: result.event.color || result.event.calendarColor }}
                    aria-hidden="true"
                  />
                  <span className="event-search-result-copy">
                    <strong>{result.event.title}</strong>
                    <small>
                      <span><CalendarDays size={10} />{eventDateLabel(result.event)}</span>
                      <span>{calendarNames.get(result.event.calendarId) ?? "Calendar"}</span>
                      {result.event.location && (
                        <span><MapPin size={10} />{result.event.location}</span>
                      )}
                    </small>
                  </span>
                </>
              ) : (
                <>
                  <span className="event-search-color event-search-task-color" aria-hidden="true" />
                  <span className="event-search-result-copy">
                    <strong>{result.title}</strong>
                    <small>
                      <span><ListTodo size={10} />Task sidebar</span>
                      <span>{result.group}</span>
                      {result.task.description && <span>{result.task.description}</span>}
                    </small>
                  </span>
                </>
              )}
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

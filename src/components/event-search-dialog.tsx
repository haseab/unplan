"use client";

import { format, parseISO } from "date-fns";
import { CalendarDays, CornerDownLeft, ListTodo, LoaderCircle, MapPin, Search, X } from "lucide-react";
import * as React from "react";
import { SearchBulkEditor } from "@/components/search-bulk-editor";
import { SearchTaskBulkEditor } from "@/components/search-task-bulk-editor";
import type { CalendarEvent, CalendarSource } from "@/lib/calendar-types";
import type { EventSearchTimeRange } from "@/lib/event-search";
import type { TodoistTask } from "@/lib/todoist";
import {
  searchTodoistTasks,
  type TodoistTaskSearchResult,
} from "@/lib/todoist-calendar";

type SearchStatus = "idle" | "loading" | "ready";

type EventSearchDialogProps = {
  calendars: CalendarSource[];
  onBulkUpdate: (updated: CalendarEvent[], originals: CalendarEvent[]) => Promise<boolean>;
  onBulkTasksCalendar: (tasks: TodoistTask[], calendarId: string) => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectTask: (task: TodoistTask) => void;
  open: boolean;
  searchEvents: (
    query: string,
    timeRange: EventSearchTimeRange,
    signal: AbortSignal,
    onPartialResults: (results: CalendarEvent[]) => void,
    sourceCalendarId?: string,
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
  { label: "Last 2 weeks", value: "fortnight" },
];

const eventDateLabel = (event: CalendarEvent) => {
  const start = parseISO(event.start);
  return event.allDay
    ? format(start, "EEE, MMM d, yyyy · 'All day'")
    : format(start, "EEE, MMM d, yyyy · h:mm a");
};

export function EventSearchDialog({
  calendars,
  onBulkUpdate,
  onBulkTasksCalendar,
  onOpenChange,
  onSelectEvent,
  onSelectTask,
  open,
  searchEvents,
  tasks,
}: EventSearchDialogProps) {
  const [reviewing, setReviewing] = React.useState<"events" | "tasks" | null>(null);
  const [sourceCalendarId, setSourceCalendarId] = React.useState("");
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
    if (!open || reviewing) return;
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
        const visibleResults = nextResults.filter(result => !sourceCalendarId || (result.kind === "event" && result.event.calendarId === sourceCalendarId));
        setActiveIndex(() => {
          const preservedIndex = activeResultKeyRef.current
            ? visibleResults.findIndex(
              (result) => resultKey(result) === activeResultKeyRef.current,
            )
            : -1;
          const nextIndex = preservedIndex >= 0
            ? preservedIndex
            : visibleResults.length ? 0 : -1;
          activeResultKeyRef.current = nextIndex >= 0
            ? resultKey(visibleResults[nextIndex])
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
        sourceCalendarId || undefined,
      )
        .then((nextResults) => {
          applyResults(nextResults, true);
        })
        .catch((searchError: unknown) => {
          if (controller.signal.aborted) return;
          setResults(current => [...current.filter(result => result.kind === "event"), ...taskResults]);
          setActiveIndex(-1);
          activeResultKeyRef.current = null;
          setError(
            searchError instanceof Error
              ? searchError.message
              : "Events could not be searched",
          );
          setStatus("ready");
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query, reviewing, searchEvents, sourceCalendarId, tasks, timeRange]);

  React.useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`${listboxId}-option-${activeIndex}`)?.scrollIntoView({
      block: "nearest",
    });
  }, [activeIndex, listboxId]);

  if (!open) return null;
  const filteredResults = results.filter(result => !sourceCalendarId || (result.kind === "event" && result.event.calendarId === sourceCalendarId));
  const eventMatches = filteredResults.flatMap(result => result.kind === "event" ? [result.event] : []);
  const taskMatches = filteredResults.flatMap(result => result.kind === "task" ? [result.task] : []);
  const backToSearch = () => { setReviewing(null); window.requestAnimationFrame(() => inputRef.current?.focus()); };
  if (reviewing === "events") return <SearchBulkEditor calendars={calendars} events={eventMatches} query={query}
    scope={`${TIME_RANGES.find(range => range.value === timeRange)?.label} · ${sourceCalendarId ? calendarNames.get(sourceCalendarId) : "All calendars"}`}
    onBack={backToSearch} onApply={async (updated, originals) => { const applied = await onBulkUpdate(updated, originals); if (applied) onOpenChange(false); return applied; }} />;
  if (reviewing === "tasks") return <SearchTaskBulkEditor calendars={calendars} tasks={taskMatches} query={query} onBack={backToSearch}
    onApply={async (selected, calendarId) => { const applied = await onBulkTasksCalendar(selected, calendarId); if (applied) onOpenChange(false); return applied; }} />;

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
    if (event.target !== inputRef.current && event.key !== "Tab") return;
    if (
      ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.key)
      && filteredResults.length
    ) {
      event.preventDefault();
      const delta = event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : -1;
      setActiveIndex((current) => {
        const startIndex = current >= 0 ? current : delta > 0 ? -1 : 0;
        const nextIndex = (startIndex + delta + filteredResults.length) % filteredResults.length;
        activeResultKeyRef.current = resultKey(filteredResults[nextIndex]);
        return nextIndex;
      });
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      if (filteredResults[activeIndex]) chooseResult(filteredResults[activeIndex]);
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;

    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled])",
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
      : filteredResults.length === 0
        ? error || `No events or tasks found for “${query.trim()}”.`
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

        <div className="search-bulk-toolbar">
          <select aria-label="Search source calendar" value={sourceCalendarId} onChange={event => { setSourceCalendarId(event.target.value); setActiveIndex(0); setStatus(query.trim().length >= MINIMUM_QUERY_LENGTH ? "loading" : "idle"); }}>
            <option value="">All calendars and tasks</option>
            {calendars.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}
          </select>
          <button disabled={status !== "ready" || Boolean(error) || !eventMatches.length} onClick={() => setReviewing("events")}>Edit {eventMatches.length} {eventMatches.length === 1 ? "event" : "events"}…</button>
          <button disabled={status !== "ready" || !taskMatches.length} onClick={() => setReviewing("tasks")}>Edit {taskMatches.length} {taskMatches.length === 1 ? "task" : "tasks"}…</button>
        </div>
        <p className="search-bulk-hint">Event scope: {timeRange === "all" ? "all history and future" : TIME_RANGES.find(range => range.value === timeRange)?.label.toLowerCase()}. Tasks search all currently synced tasks.</p>
        {error && <p className="event-search-error" role="alert">{error} Bulk event editing is unavailable until search completes successfully.</p>}
        <div className="event-search-results" id={listboxId} role="listbox">
          {prompt ? (
            <div className={`event-search-empty ${error ? "event-search-error" : ""}`}>
              {prompt}
            </div>
          ) : filteredResults.map((result, index) => (
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

"use client";

import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import * as React from "react";
import type { CalendarEvent } from "@/lib/calendar-types";
import { searchVisibleEvents } from "@/lib/visible-event-search";

type VisibleEventFinderProps = {
  activeEventKey: string | null;
  getViewportEvents: () => CalendarEvent[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  onCancel: () => void;
  onCommit: (event: CalendarEvent) => void;
  onMatchesChange: (eventKeys: ReadonlySet<string>) => void;
  onNavigate: (event: CalendarEvent) => void;
};

const SEARCH_DEBOUNCE_MS = 0;
const eventKey = (event: CalendarEvent) => `${event.calendarId}:${event.id}`;

export function VisibleEventFinder({
  activeEventKey,
  getViewportEvents,
  inputRef,
  onCancel,
  onCommit,
  onMatchesChange,
  onNavigate,
}: VisibleEventFinderProps) {
  const [candidateCount, setCandidateCount] = React.useState(
    () => getViewportEvents().length,
  );
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<CalendarEvent[]>([]);
  const [searching, setSearching] = React.useState(false);
  const resolvedActiveIndex = results.length
    ? Math.max(results.findIndex((event) => eventKey(event) === activeEventKey), 0)
    : -1;

  const searchViewport = React.useCallback((searchQuery: string) => {
    const viewportEvents = getViewportEvents();
    const nextResults = searchVisibleEvents(viewportEvents, searchQuery);
    setCandidateCount(viewportEvents.length);
    setResults(nextResults);
    setSearching(false);
    onMatchesChange(new Set(nextResults.map(eventKey)));
  }, [getViewportEvents, onMatchesChange]);

  React.useLayoutEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, [inputRef]);

  React.useEffect(() => {
    const searchQuery = query.trim();
    if (!searchQuery) return;
    const timer = window.setTimeout(
      () => searchViewport(searchQuery),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [query, searchViewport]);

  React.useEffect(() => {
    const scrollContainer = document.querySelector<HTMLElement>(".calendar-scroll");
    if (!scrollContainer) return;
    let timer: number | null = null;
    const refreshAfterScroll = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (query.trim()) searchViewport(query.trim());
        else setCandidateCount(getViewportEvents().length);
      }, SEARCH_DEBOUNCE_MS);
    };
    scrollContainer.addEventListener("scroll", refreshAfterScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener("scroll", refreshAfterScroll);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [getViewportEvents, query, searchViewport]);

  React.useEffect(() => () => onMatchesChange(new Set()), [onMatchesChange]);

  React.useEffect(() => {
    if (resolvedActiveIndex < 0) return;
    const activeEvent = results[resolvedActiveIndex];
    if (activeEvent && eventKey(activeEvent) !== activeEventKey) {
      onNavigate(activeEvent);
    }
  }, [activeEventKey, onNavigate, resolvedActiveIndex, results]);

  const move = (delta: number) => {
    if (!results.length) return;
    const nextIndex = (
      ((resolvedActiveIndex < 0 ? (delta > 0 ? -1 : 0) : resolvedActiveIndex) + delta + results.length)
      % results.length
    );
    onNavigate(results[nextIndex]);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      (event.metaKey || event.ctrlKey)
      && !event.altKey
      && !event.shiftKey
      && event.key.toLowerCase() === "f"
    ) {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.select();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (
      event.key === "Enter"
      && (event.metaKey || event.ctrlKey)
      && !event.altKey
      && !event.shiftKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      const activeEvent = results[resolvedActiveIndex];
      if (activeEvent) onCommit(activeEvent);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      move(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
    }
  };

  const resultLabel = !query.trim()
    ? `${candidateCount} visible`
    : searching
      ? "Searching…"
    : results.length
      ? `${resolvedActiveIndex + 1} of ${results.length}`
      : "No matches";

  return (
    <section className="visible-event-finder" aria-label="Find visible calendar events">
      <Search size={15} aria-hidden="true" />
      <input
        ref={inputRef}
        aria-label="Find visible calendar events"
        autoComplete="off"
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          if (nextQuery.trim()) {
            setSearching(SEARCH_DEBOUNCE_MS > 0);
            return;
          }
          setResults([]);
          setSearching(false);
          onMatchesChange(new Set());
          setCandidateCount(getViewportEvents().length);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Find visible events…"
        type="search"
        value={query}
      />
      <span className="visible-event-finder-count" aria-live="polite">
        {resultLabel}
      </span>
      <button aria-label="Previous match" disabled={!results.length} onClick={() => move(-1)} onPointerDown={(event) => event.preventDefault()} type="button">
        <ChevronUp size={14} />
      </button>
      <button aria-label="Next match" disabled={!results.length} onClick={() => move(1)} onPointerDown={(event) => event.preventDefault()} type="button">
        <ChevronDown size={14} />
      </button>
      <button aria-label="Cancel quick find" onClick={onCancel} type="button">
        <X size={14} />
      </button>
    </section>
  );
}

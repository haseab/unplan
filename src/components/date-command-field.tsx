"use client";

import { format } from "date-fns";
import { ArrowRight, CalendarDays } from "lucide-react";
import * as React from "react";
import { parseCalendarDateCommand } from "@/lib/calendar-date-command";

type DateCommandFieldProps = {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onNavigate: (date: Date) => void;
};

export function DateCommandField({ inputRef, onNavigate }: DateCommandFieldProps) {
  const [query, setQuery] = React.useState("");
  const [submittedInvalidQuery, setSubmittedInvalidQuery] = React.useState(false);
  const parsedDate = React.useMemo(
    () => parseCalendarDateCommand(query),
    [query],
  );
  const parsedLabel = parsedDate ? format(parsedDate, "EEE, MMM d, yyyy") : "";

  const submit = () => {
    if (!parsedDate) {
      setSubmittedInvalidQuery(Boolean(query.trim()));
      return;
    }
    onNavigate(parsedDate);
    setQuery("");
    setSubmittedInvalidQuery(false);
    inputRef.current?.blur();
  };

  return (
    <form
      className="date-command"
      data-invalid={submittedInvalidQuery || undefined}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <CalendarDays size={15} aria-hidden="true" />
      <label className="sr-only" htmlFor="date-command-input">Go to a date</label>
      <span className="date-command-copy">
        <input
          ref={inputRef}
          id="date-command-input"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSubmittedInvalidQuery(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setQuery("");
              setSubmittedInvalidQuery(false);
              event.currentTarget.blur();
            }
          }}
          placeholder="Go to any date…"
          autoComplete="off"
          spellCheck={false}
          aria-describedby="date-command-feedback"
          aria-invalid={submittedInvalidQuery || undefined}
        />
        <small id="date-command-feedback" aria-live="polite">
          {parsedDate
            ? parsedLabel
            : submittedInvalidQuery
              ? "Try “next Friday” or “August 12”"
              : "Try “tomorrow” or “in two weeks”"}
        </small>
      </span>
      {query ? (
        <button
          className="date-command-submit"
          type="submit"
          disabled={!parsedDate}
          aria-label={parsedDate ? `Go to ${parsedLabel}` : "Enter a recognized date"}
        >
          <ArrowRight size={13} strokeWidth={2.5} />
        </button>
      ) : <kbd>⌘ G</kbd>}
    </form>
  );
}

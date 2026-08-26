"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import * as React from "react";
import type { CalendarSource } from "@/lib/calendar-types";

type CalendarPickerProps = {
  calendars: CalendarSource[];
  onChange: (calendarId: string) => void;
  value: string;
};

export function CalendarPicker({ calendars, onChange, value }: CalendarPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = React.useId();
  const optionIdPrefix = React.useId();
  const selectedIndex = Math.max(
    calendars.findIndex((calendar) => calendar.id === value),
    0,
  );
  const selectedCalendar = calendars[selectedIndex] ?? null;
  const filteredCalendars = React.useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return calendars;

    return calendars.filter((calendar) =>
      [calendar.name, calendar.accountEmail]
        .some((field) => field?.toLocaleLowerCase().includes(normalizedQuery))
    );
  }, [calendars, query]);

  const openPicker = React.useCallback((index = selectedIndex) => {
    setQuery("");
    setActiveIndex(index);
    setOpen(true);
  }, [selectedIndex]);

  const closePicker = React.useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closePicker();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
  }, [closePicker, open]);

  React.useLayoutEffect(() => {
    if (!open) return;
    searchRef.current?.focus({ preventScroll: true });
  }, [open]);

  React.useLayoutEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const closeAndRestoreFocus = () => {
    closePicker();
    triggerRef.current?.focus({ preventScroll: true });
  };

  const selectCalendar = (calendarId: string) => {
    onChange(calendarId);
    closePicker();
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredCalendars.length === 0) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) =>
        (current + direction + filteredCalendars.length) % filteredCalendars.length
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const activeCalendar = filteredCalendars[activeIndex];
      if (activeCalendar) selectCalendar(activeCalendar.id);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeAndRestoreFocus();
    } else if (event.key === "Tab") {
      closePicker();
    }
  };

  return (
    <div className="calendar-picker" ref={rootRef}>
      <button
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="calendar-picker-trigger"
        disabled={!selectedCalendar}
        onClick={() => open ? closePicker() : openPicker()}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          openPicker(event.key === "ArrowDown" ? selectedIndex : calendars.length - 1);
        }}
        ref={triggerRef}
        type="button"
      >
        {selectedCalendar && (
          <>
            <span
              className="calendar-picker-color"
              style={{ backgroundColor: selectedCalendar.backgroundColor }}
            />
            <span className="calendar-picker-copy">
              <strong>{selectedCalendar.name}</strong>
              <small>{selectedCalendar.accountEmail ?? "Local calendar"}</small>
            </span>
            <ChevronDown className="calendar-picker-chevron" size={15} />
          </>
        )}
      </button>

      {open && (
        <div className="calendar-picker-menu">
          <div className="calendar-picker-menu-heading">
            <span>Choose calendar</span>
            <small>{filteredCalendars.length}</small>
          </div>
          <label className="calendar-picker-search">
            <Search aria-hidden="true" size={14} />
            <input
              aria-activedescendant={filteredCalendars[activeIndex] ? `${optionIdPrefix}-${activeIndex}` : undefined}
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-expanded="true"
              aria-label="Search calendars"
              autoComplete="off"
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search calendars"
              ref={searchRef}
              role="combobox"
              type="search"
              value={query}
            />
          </label>
          <div
            aria-label="Calendars"
            className="calendar-picker-options"
            id={listboxId}
            role="listbox"
          >
            {filteredCalendars.map((calendar, index) => {
              const selected = calendar.id === value;
              return (
                <button
                  aria-selected={selected}
                  className="calendar-picker-option"
                  data-active={index === activeIndex ? "true" : undefined}
                  id={`${optionIdPrefix}-${index}`}
                  key={calendar.id}
                  onClick={() => selectCalendar(calendar.id)}
                  onMouseMove={() => setActiveIndex(index)}
                  ref={(element) => { optionRefs.current[index] = element; }}
                  role="option"
                  tabIndex={-1}
                  type="button"
                >
                  <span
                    className="calendar-picker-color"
                    style={{ backgroundColor: calendar.backgroundColor }}
                  />
                  <span className="calendar-picker-copy">
                    <strong>{calendar.name}</strong>
                    <small>{calendar.accountEmail ?? "Local calendar"}</small>
                  </span>
                  <span className="calendar-picker-check" aria-hidden="true">
                    {selected && <Check size={13} strokeWidth={2.8} />}
                  </span>
                </button>
              );
            })}
            {filteredCalendars.length === 0 && (
              <p className="calendar-picker-empty">No calendars found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

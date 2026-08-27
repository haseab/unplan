"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import * as React from "react";
import type { CalendarSource } from "@/lib/calendar-types";

type CalendarPickerProps = {
  calendars: CalendarSource[];
  forcedOpen?: boolean;
  onChange: (calendarId: string) => void;
  onOpenChange?: (open: boolean) => void;
  value: string;
};

export function CalendarPicker({
  calendars,
  forcedOpen = false,
  onChange,
  onOpenChange,
  value,
}: CalendarPickerProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = forcedOpen || internalOpen;
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
  const calendarGroups = React.useMemo(() => {
    const groups = new Map<string, {
      calendars: Array<{ calendar: CalendarSource; index: number }>;
      label: string;
    }>();

    filteredCalendars.forEach((calendar, index) => {
      const label = calendar.accountEmail?.trim() || "Local calendars";
      const key = label.toLocaleLowerCase();
      const group = groups.get(key);
      const item = { calendar, index };

      if (group) group.calendars.push(item);
      else groups.set(key, { calendars: [item], label });
    });

    return [...groups.values()];
  }, [filteredCalendars]);

  const openPicker = React.useCallback((index = selectedIndex) => {
    setQuery("");
    setActiveIndex(index);
    setInternalOpen(true);
    onOpenChange?.(true);
  }, [onOpenChange, selectedIndex]);

  const closePicker = React.useCallback(() => {
    setInternalOpen(false);
    setQuery("");
    onOpenChange?.(false);
  }, [onOpenChange]);

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
            {calendarGroups.map((group, groupIndex) => {
              const groupLabelId = `${optionIdPrefix}-group-${groupIndex}`;
              return (
                <div
                  aria-labelledby={groupLabelId}
                  className="calendar-picker-group"
                  key={group.label.toLocaleLowerCase()}
                  role="group"
                >
                  <div className="calendar-picker-group-label" id={groupLabelId}>
                    {group.label}
                  </div>
                  {group.calendars.map(({ calendar, index }) => {
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
                        </span>
                        <span className="calendar-picker-check" aria-hidden="true">
                          {selected && <Check size={13} strokeWidth={2.8} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
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

"use client";

import { Check, ChevronDown } from "lucide-react";
import * as React from "react";
import type { CalendarSource } from "@/lib/calendar-types";

type CalendarPickerProps = {
  calendars: CalendarSource[];
  onChange: (calendarId: string) => void;
  value: string;
};

export function CalendarPicker({ calendars, onChange, value }: CalendarPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = React.useId();
  const selectedIndex = Math.max(
    calendars.findIndex((calendar) => calendar.id === value),
    0,
  );
  const selectedCalendar = calendars[selectedIndex] ?? null;

  const openPicker = React.useCallback((index = selectedIndex) => {
    setActiveIndex(index);
    setOpen(true);
  }, [selectedIndex]);

  React.useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
  }, [open]);

  React.useLayoutEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.focus({ preventScroll: true });
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const closeAndRestoreFocus = () => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  const selectCalendar = (calendarId: string) => {
    onChange(calendarId);
    setOpen(false);
  };

  const handleOptionKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) =>
        (current + direction + calendars.length) % calendars.length
      );
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : calendars.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeAndRestoreFocus();
    } else if (event.key === "Tab") {
      setOpen(false);
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
        onClick={() => open ? setOpen(false) : openPicker()}
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
            <small>{calendars.length}</small>
          </div>
          <div
            aria-label="Calendars"
            className="calendar-picker-options"
            id={listboxId}
            role="listbox"
          >
            {calendars.map((calendar, index) => {
              const selected = calendar.id === value;
              return (
                <button
                  aria-selected={selected}
                  className="calendar-picker-option"
                  key={calendar.id}
                  onClick={() => selectCalendar(calendar.id)}
                  onFocus={() => setActiveIndex(index)}
                  onKeyDown={handleOptionKeyDown}
                  ref={(element) => { optionRefs.current[index] = element; }}
                  role="option"
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
          </div>
        </div>
      )}
    </div>
  );
}

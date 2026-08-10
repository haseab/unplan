"use client";

import { CalendarDays, Check, ChevronDown, Minus, Plus } from "lucide-react";
import * as React from "react";
import { MAX_VISIBLE_DAYS } from "@/hooks/use-day-count";

type DayCountPickerProps = {
  dayCount: number;
  onChange: (dayCount: number) => void;
};

const quickChoices = [1, 2, 3, 5, 7, 14, 21, 30];

export function DayCountPicker({ dayCount, onChange }: DayCountPickerProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  return (
    <div className="day-count-picker" ref={rootRef}>
      <button
        className="view-button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <CalendarDays size={14} />
        {dayCount} {dayCount === 1 ? "day" : "days"}
        <ChevronDown size={13} />
      </button>
      {open && (
        <section className="day-count-popover" aria-label="Visible days">
          <div className="day-count-stepper">
            <button onClick={() => onChange(dayCount - 1)} disabled={dayCount <= 1} aria-label="Show one fewer day"><Minus size={14} /></button>
            <span><strong>{dayCount}</strong><small>days visible</small></span>
            <button onClick={() => onChange(dayCount + 1)} disabled={dayCount >= MAX_VISIBLE_DAYS} aria-label="Show one more day"><Plus size={14} /></button>
          </div>
          <input
            className="duration-slider"
            type="range"
            min="1"
            max={MAX_VISIBLE_DAYS}
            step="1"
            value={dayCount}
            onChange={(event) => onChange(Number(event.target.value))}
            aria-label="Number of visible days"
          />
          <div className="day-count-range-labels"><span>1</span><span>30 days</span></div>
          <div className="day-count-choices">
            {quickChoices.map((choice) => (
              <button key={choice} className={dayCount === choice ? "day-count-active" : ""} onClick={() => onChange(choice)}>
                {dayCount === choice && <Check size={10} />}{choice}
              </button>
            ))}
          </div>
          <p>Press <kbd>1</kbd>–<kbd>9</kbd> anytime to switch instantly.</p>
        </section>
      )}
    </div>
  );
}

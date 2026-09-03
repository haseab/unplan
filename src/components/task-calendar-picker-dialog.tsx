"use client";

import { CalendarDays, LoaderCircle } from "lucide-react";
import * as React from "react";
import { CalendarPicker } from "@/components/calendar-picker";
import type { CalendarSource } from "@/lib/calendar-types";

type TaskCalendarPickerDialogProps = {
  calendars: CalendarSource[];
  currentCalendarId: string | null;
  onChange: (calendarId: string) => Promise<boolean>;
  onClose: () => void;
  taskCount: number;
};

export function TaskCalendarPickerDialog({
  calendars,
  currentCalendarId,
  onChange,
  onClose,
  taskCount,
}: TaskCalendarPickerDialogProps) {
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  const changeCalendar = async (calendarId: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (await onChange(calendarId)) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop confirmation-backdrop task-calendar-picker-backdrop"
      onMouseDown={submitting ? undefined : onClose}
    >
      <section
        aria-describedby="task-calendar-picker-description"
        aria-labelledby="task-calendar-picker-title"
        aria-modal="true"
        aria-busy={submitting}
        className="confirmation-modal task-calendar-picker-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="confirmation-header">
          <div className="confirmation-icon">
            {submitting
              ? <LoaderCircle aria-hidden="true" className="spin" size={20} />
              : <CalendarDays aria-hidden="true" size={20} strokeWidth={1.8} />}
          </div>
          <div className="confirmation-copy">
            <strong id="task-calendar-picker-title">
              Choose a calendar
            </strong>
            <p id="task-calendar-picker-description">
              Update the calendar for {taskCount} selected {taskCount === 1 ? "event task" : "event tasks"}.
            </p>
          </div>
        </div>
        <div className="task-calendar-picker-field">
          <CalendarPicker
            ariaLabel="Calendar for selected event tasks"
            calendars={calendars}
            forcedOpen
            onChange={(calendarId) => void changeCalendar(calendarId)}
            placeholder={currentCalendarId ? "Choose calendar" : "Multiple calendars"}
            value={currentCalendarId}
          />
        </div>
        <div className="task-calendar-picker-footer">
          <span><kbd>C</kbd> to open</span>
          <span><kbd>Esc</kbd> to close</span>
        </div>
      </section>
    </div>
  );
}

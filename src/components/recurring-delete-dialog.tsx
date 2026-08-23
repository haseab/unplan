"use client";

import { CalendarMinus, Repeat2 } from "lucide-react";
import * as React from "react";
import type { RecurringDeleteRequest } from "@/hooks/use-recurring-delete-confirmation";
import type { RecurringDeleteScope } from "@/lib/recurring-delete";

type RecurringDeleteDialogProps = {
  onCancel: () => void;
  onChoose: (scope: RecurringDeleteScope) => void;
  request: RecurringDeleteRequest | null;
};

export function RecurringDeleteDialog({
  onCancel,
  onChoose,
  request,
}: RecurringDeleteDialogProps) {
  React.useEffect(() => {
    if (!request) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel, request]);

  if (!request) return null;
  const eventLabel = request.events.length === 1
    ? `“${request.events[0].title}” is a repeating event.`
    : `${request.events.length} selected events repeat.`;

  return (
    <div className="modal-backdrop confirmation-backdrop" onMouseDown={onCancel}>
      <section
        className="confirmation-modal recurring-delete-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="recurring-delete-title"
        aria-describedby="recurring-delete-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="confirmation-header">
          <div className="confirmation-icon confirmation-icon-delete">
            <Repeat2 size={19} strokeWidth={1.8} />
          </div>
          <div className="confirmation-copy">
            <strong id="recurring-delete-title">Delete repeating event?</strong>
            <p id="recurring-delete-description">{eventLabel} Choose where deletion should stop.</p>
          </div>
        </div>
        <div className="recurring-delete-options">
          <button autoFocus onClick={() => onChoose("single")}>
            <CalendarMinus size={17} />
            <span>
              <strong>This event only</strong>
              <small>Keep every other occurrence in the series.</small>
            </span>
          </button>
          <button onClick={() => onChoose("following")}>
            <Repeat2 size={17} />
            <span>
              <strong>This and following</strong>
              <small>Keep earlier events and remove this point forward.</small>
            </span>
          </button>
        </div>
        <div className="confirmation-actions recurring-delete-actions">
          <button className="confirmation-cancel" onClick={onCancel}>Cancel</button>
        </div>
      </section>
    </div>
  );
}

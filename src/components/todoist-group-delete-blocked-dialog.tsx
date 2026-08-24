"use client";

import { Trash2 } from "lucide-react";
import * as React from "react";

type TodoistGroupDeleteBlockedDialogProps = {
  group: string | null;
  onClose: () => void;
  taskCount: number;
};

export function TodoistGroupDeleteBlockedDialog({
  group,
  onClose,
  taskCount,
}: TodoistGroupDeleteBlockedDialogProps) {
  React.useEffect(() => {
    if (!group) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [group, onClose]);

  if (!group) return null;

  return (
    <div className="modal-backdrop confirmation-backdrop" onMouseDown={onClose}>
      <section
        aria-describedby="group-delete-blocked-description"
        aria-labelledby="group-delete-blocked-title"
        aria-modal="true"
        className="confirmation-modal group-delete-blocked-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="alertdialog"
      >
        <div className="confirmation-header">
          <div className="confirmation-icon confirmation-icon-delete">
            <Trash2 aria-hidden="true" size={19} strokeWidth={1.8} />
          </div>
          <div className="confirmation-copy">
            <strong id="group-delete-blocked-title">Move events before deleting</strong>
            <p id="group-delete-blocked-description">
              “{group}” still contains {taskCount} {taskCount === 1 ? "event" : "events"}.
              Move them to another section before deleting this section.
            </p>
          </div>
        </div>
        <div className="confirmation-actions">
          <button autoFocus className="group-delete-blocked-dismiss" onClick={onClose} type="button">
            Got it
          </button>
        </div>
      </section>
    </div>
  );
}

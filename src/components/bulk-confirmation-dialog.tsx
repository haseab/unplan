"use client";

import { CalendarRange, CopyPlus, Pencil, Trash2 } from "lucide-react";
import * as React from "react";
import type { BulkConfirmationRequest } from "@/hooks/use-bulk-confirmation";

type BulkConfirmationDialogProps = {
  onCancel: () => void;
  onConfirm: () => void;
  request: BulkConfirmationRequest | null;
};

const actionCopy = {
  create: {
    description: "New events will be added to Google Calendar. You can still undo before they are saved.",
    Icon: CopyPlus,
    label: "Create",
  },
  delete: {
    description: "These events will be removed from Google Calendar. You can still undo before they are deleted.",
    Icon: Trash2,
    label: "Delete",
  },
  move: {
    description: "All selected events will move together. You can still undo before the changes are saved.",
    Icon: CalendarRange,
    label: "Move",
  },
  update: {
    description: "The shared changes will be applied to every selected event. You can still undo before they are saved.",
    Icon: Pencil,
    label: "Update",
  },
};

export function BulkConfirmationDialog({
  onCancel,
  onConfirm,
  request,
}: BulkConfirmationDialogProps) {
  React.useEffect(() => {
    if (!request) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
        return;
      }
      if (event.key === "Enter" && event.metaKey && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        onConfirm();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel, onConfirm, request]);

  if (!request) return null;
  const copy = actionCopy[request.action];
  const Icon = copy.Icon;
  const subject = request.subject ?? "events";
  const title = `${copy.label} ${request.count} ${subject}?`;
  const description = subject === "tasks" && request.action === "delete"
    ? "These tasks will be permanently removed from Todoist. You can still undo before they are deleted."
    : copy.description;

  return (
    <div className="modal-backdrop confirmation-backdrop" onMouseDown={onCancel}>
      <section
        className="confirmation-modal bulk-confirmation-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bulk-confirmation-title"
        aria-describedby="bulk-confirmation-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="confirmation-header">
          <div className={`confirmation-icon confirmation-icon-${request.action}`}>
            <Icon size={21} strokeWidth={1.8} />
          </div>
          <div className="confirmation-copy">
            <strong id="bulk-confirmation-title">{title}</strong>
            <p id="bulk-confirmation-description">{description}</p>
          </div>
        </div>
        <div className="confirmation-actions">
          <button className="confirmation-cancel" autoFocus onClick={onCancel}>Cancel</button>
          <button
            className={request.action === "delete" ? "confirmation-danger" : "confirmation-primary"}
            aria-keyshortcuts="Meta+Enter"
            onClick={onConfirm}
          >
            {copy.label} {request.count}
          </button>
        </div>
      </section>
    </div>
  );
}

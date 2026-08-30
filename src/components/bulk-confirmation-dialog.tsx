"use client";

import { CalendarRange, CopyPlus, Pencil, RotateCcw, Trash2 } from "lucide-react";
import * as React from "react";
import type { BulkConfirmationRequest } from "@/hooks/use-bulk-confirmation";

type BulkConfirmationDialogProps = {
  onCancel: () => void;
  onConfirm: () => void;
  request: BulkConfirmationRequest | null;
};

const actionCopy = {
  create: {
    description: (count: number) => `${count} new events will be added to Google Calendar.`,
    Icon: CopyPlus,
    label: "Create",
  },
  delete: {
    description: (count: number) => `All ${count} selected events will be removed from Google Calendar.`,
    Icon: Trash2,
    label: "Delete",
  },
  move: {
    description: (count: number) => `The move will apply to all ${count} selected events.`,
    Icon: CalendarRange,
    label: "Move",
  },
  update: {
    description: (count: number) => `The changes will apply to all ${count} selected events.`,
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
  const title = request.title ?? `${copy.label} ${request.count} selected ${subject}?`;
  const description = request.description ?? (subject === "tasks" && request.action === "delete"
    ? `All ${request.count} selected tasks will be permanently removed from Todoist.`
    : copy.description(request.count));
  const undoDestination = subject === "tasks" ? "Todoist" : "Google Calendar";

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
            <div className="confirmation-undo-note">
              <RotateCcw aria-hidden="true" size={14} strokeWidth={1.8} />
              <span>You’ll have a few seconds to undo before {undoDestination} is updated.</span>
            </div>
          </div>
        </div>
        <div className="confirmation-actions">
          <button className="confirmation-cancel" autoFocus onClick={onCancel}>Cancel</button>
          <button
            className={request.action === "delete" ? "confirmation-danger" : "confirmation-primary"}
            aria-keyshortcuts="Meta+Enter"
            onClick={onConfirm}
          >
            {request.confirmLabel ?? `${copy.label} all ${request.count}`}
          </button>
        </div>
      </section>
    </div>
  );
}

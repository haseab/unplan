"use client";

import { Mail } from "lucide-react";
import * as React from "react";
import type { GoogleSendUpdates } from "@/lib/calendar-types";
import type { GuestNotificationRequest } from "@/hooks/use-guest-notification-confirmation";

type GuestNotificationDialogProps = {
  onCancel: () => void;
  onChoose: (choice: GoogleSendUpdates) => void;
  request: GuestNotificationRequest | null;
};

const actionCopy = {
  create: {
    description: (eventLabel: string) => `Creating ${eventLabel}. Choose whether to email the invitation.`,
    quietLabel: "Create quietly",
    sendLabel: "Create & invite",
    title: "Send invitations?",
  },
  delete: {
    description: (eventLabel: string) => `Deleting ${eventLabel}. Choose whether to email a cancellation.`,
    quietLabel: "Delete quietly",
    sendLabel: "Delete & notify",
    title: "Notify guests?",
  },
  update: {
    description: (eventLabel: string) => `Updating ${eventLabel}. Choose whether to email the change.`,
    quietLabel: "Update quietly",
    sendLabel: "Update & notify",
    title: "Notify guests?",
  },
};

export function GuestNotificationDialog({
  onCancel,
  onChoose,
  request,
}: GuestNotificationDialogProps) {
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
  const copy = actionCopy[request.action];
  const eventLabel = request.events.length === 1
    ? `“${request.events[0].title}”`
    : `${request.events.length} events`;

  return (
    <div className="modal-backdrop confirmation-backdrop" onMouseDown={onCancel}>
      <section
        className="confirmation-modal guest-notification-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="guest-notification-title"
        aria-describedby="guest-notification-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="confirmation-header">
          <div className="confirmation-icon confirmation-icon-notification">
            <Mail size={21} strokeWidth={1.8} />
          </div>
          <div className="confirmation-copy">
            <strong id="guest-notification-title">{copy.title}</strong>
            <p id="guest-notification-description">{copy.description(eventLabel)}</p>
          </div>
        </div>
        <div className="guest-notification-attendees">
          <div className="guest-notification-attendees-heading">
            <strong>Guests</strong>
            <span>{request.attendees.length}</span>
          </div>
          {request.attendees.slice(0, 4).map((attendee, index) => (
            <div className="guest-notification-attendee" key={attendee.email ?? attendee.displayName ?? index}>
              <span className="guest-notification-avatar" aria-hidden="true">
                {(attendee.displayName || attendee.email || "G").slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{attendee.displayName || attendee.email || "Guest"}</strong>
                {attendee.displayName && attendee.email && <small>{attendee.email}</small>}
              </span>
            </div>
          ))}
          {request.attendees.length > 4 && <small className="guest-notification-more">+{request.attendees.length - 4} more guests</small>}
        </div>
        <div className="confirmation-actions guest-notification-actions">
          <button className="confirmation-cancel" onClick={onCancel}>Cancel</button>
          <button autoFocus onClick={() => onChoose("none")}>{copy.quietLabel}</button>
          <button className="confirmation-primary" onClick={() => onChoose("all")}>
            {copy.sendLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

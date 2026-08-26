"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  HelpCircle,
  LoaderCircle,
  Mail,
  Plus,
  Users,
  X,
} from "lucide-react";
import * as React from "react";
import type {
  CalendarEventAttendee,
  CalendarEventRsvpStatus,
} from "@/lib/calendar-types";
import {
  mergeParticipantEmails,
  participantInitials,
  participantResponseSummary,
  participantResponseSummaryLabel,
} from "@/lib/event-participants";

const COLLAPSED_PARTICIPANT_COUNT = 4;

const responseCopy = (attendee: CalendarEventAttendee) => {
  if (attendee.organizer) return "Organizer";
  if (attendee.responseStatus === "accepted") return "Accepted";
  if (attendee.responseStatus === "declined") return "Declined";
  if (attendee.responseStatus === "tentative") return "Maybe";
  return "Awaiting response";
};

function ParticipantResponseIcon({ attendee }: { attendee: CalendarEventAttendee }) {
  if (attendee.responseStatus === "accepted") return <Check size={11} />;
  if (attendee.responseStatus === "declined") return <X size={11} />;
  if (attendee.responseStatus === "tentative") return <HelpCircle size={11} />;
  return <Clock3 size={11} />;
}

export function EventParticipantsEditor({
  attendees,
  onChange,
  onRespond,
}: {
  attendees: CalendarEventAttendee[];
  onChange: (attendees: CalendarEventAttendee[]) => void;
  onRespond?: (
    attendee: CalendarEventAttendee,
    responseStatus: CalendarEventRsvpStatus,
  ) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [newParticipants, setNewParticipants] = React.useState("");
  const [responding, setResponding] = React.useState<{
    attendeeKey: string;
    responseStatus: CalendarEventRsvpStatus;
  } | null>(null);
  const summary = participantResponseSummary(attendees);
  const visibleAttendees = expanded
    ? attendees
    : attendees.slice(0, COLLAPSED_PARTICIPANT_COUNT);
  const hiddenCount = attendees.length - visibleAttendees.length;
  const participantEmails = attendees.flatMap(({ email }) => email ? [email] : []);

  const addParticipants = () => {
    const next = mergeParticipantEmails(attendees, newParticipants);
    if (next.length === attendees.length) return;
    onChange(next);
    setNewParticipants("");
  };

  const respond = async (
    attendee: CalendarEventAttendee,
    attendeeKey: string,
    responseStatus: CalendarEventRsvpStatus,
  ) => {
    if (!onRespond || responding) return;
    setResponding({ attendeeKey, responseStatus });
    try {
      await onRespond(attendee, responseStatus);
    } finally {
      setResponding(null);
    }
  };

  return (
    <div className="event-participants-editor" data-empty={summary.total === 0}>
      {summary.total > 0 && (
        <div className="event-participants-summary">
          <Users size={16} />
          <div>
            <strong>{summary.total} {summary.total === 1 ? "participant" : "participants"}</strong>
            <small>{participantResponseSummaryLabel(summary)}</small>
          </div>
          {participantEmails.length > 0 && (
            <a
              aria-label="Email participants"
              href={`mailto:${participantEmails.join(",")}`}
              title="Email participants"
            >
              <Mail size={14} />
            </a>
          )}
        </div>
      )}

      {visibleAttendees.length > 0 && (
        <div className="event-participant-list">
          {visibleAttendees.map((attendee, index) => {
            const label = attendee.displayName || attendee.email || "Guest";
            const avatarSeed = attendee.email || attendee.displayName || String(index);
            const attendeeKey = `${attendee.email ?? attendee.displayName ?? "guest"}-${index}`;
            const optimisticResponse = responding?.attendeeKey === attendeeKey
              ? responding.responseStatus
              : attendee.responseStatus;
            const displayedAttendee = { ...attendee, responseStatus: optimisticResponse };
            const canRespond = attendee.self && !attendee.organizer && Boolean(onRespond);
            const hue = [...avatarSeed].reduce((total, character) =>
              total + character.charCodeAt(0), 0) % 360;
            return (
              <div
                className="event-participant-row"
                data-self={canRespond ? "true" : undefined}
                key={attendeeKey}
              >
                <span
                  className="event-participant-avatar"
                  style={{ "--participant-hue": hue } as React.CSSProperties}
                >
                  {participantInitials(attendee)}
                </span>
                <span className="event-participant-copy">
                  <strong>{attendee.self ? `${label} (you)` : label}</strong>
                  <small>{responseCopy(displayedAttendee)}</small>
                </span>
                {canRespond ? (
                  <div aria-label="Respond to invitation" className="event-participant-rsvp" role="group">
                    {([
                      ["accepted", "Yes", Check],
                      ["tentative", "Maybe", HelpCircle],
                      ["declined", "No", X],
                    ] as const).map(([responseStatus, copy, Icon]) => {
                      const active = optimisticResponse === responseStatus;
                      const saving = responding?.attendeeKey === attendeeKey
                        && responding.responseStatus === responseStatus;
                      return (
                        <button
                          aria-label={`${copy} to ${label}`}
                          aria-pressed={active}
                          data-response={responseStatus}
                          disabled={responding !== null}
                          key={responseStatus}
                          onClick={() => void respond(attendee, attendeeKey, responseStatus)}
                          type="button"
                        >
                          {saving ? <LoaderCircle className="spin" size={11} /> : <Icon size={11} />}
                          {copy}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <span
                    className={`event-participant-response event-participant-response-${attendee.responseStatus ?? "needsAction"}`}
                    title={responseCopy(attendee)}
                  >
                    <ParticipantResponseIcon attendee={attendee} />
                  </span>
                )}
                {!attendee.self && !attendee.organizer && (
                  <button
                    aria-label={`Remove ${label}`}
                    onClick={() => onChange(attendees.filter((_, attendeeIndex) => attendeeIndex !== index))}
                    title={`Remove ${label}`}
                    type="button"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
          {(hiddenCount > 0 || expanded && attendees.length > COLLAPSED_PARTICIPANT_COUNT) && (
            <button
              className="event-participants-expand"
              onClick={() => setExpanded((current) => !current)}
              type="button"
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {expanded ? "Show fewer" : `See all ${attendees.length} participants`}
            </button>
          )}
        </div>
      )}

      <div className="event-participant-add">
        <Plus size={14} />
        <input
          aria-label="Add participants or rooms"
          onChange={(input) => setNewParticipants(input.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            addParticipants();
          }}
          placeholder="Add participant or room"
          type="email"
          value={newParticipants}
        />
        {newParticipants.trim() && (
          <button onClick={addParticipants} type="button">Add</button>
        )}
      </div>
    </div>
  );
}

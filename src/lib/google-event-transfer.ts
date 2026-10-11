import { parseGoogleCalendarSourceId } from "./google-source-id";
import type { CalendarEvent } from "./calendar-types";

export const applyGoogleEventSaveResult = (event: CalendarEvent, result: {
  id?: string; htmlLink?: string; hangoutLink?: string; transferred: boolean;
}): CalendarEvent => ({
  ...event,
  ...(result.id ? { providerEventId: result.id } : {}),
  ...(result.htmlLink ? { htmlLink: result.htmlLink } : {}),
  ...(result.transferred ? {
    recurringEventId: undefined, originalStart: undefined,
    conferenceLink: result.hangoutLink, organizerSelf: true,
    attendees: event.attendees?.map((attendee) => {
      const copy = { ...attendee };
      delete copy.self;
      delete copy.organizer;
      return copy;
    }),
  } : {}),
});

export const isCrossAccountCalendarMove = (sourceId: string | undefined, destinationId: string) => {
  const source = sourceId ? parseGoogleCalendarSourceId(sourceId) : null;
  const destination = parseGoogleCalendarSourceId(destinationId);
  return Boolean(source && destination && source.accountId !== destination.accountId);
};

/** Only writable event fields; never copy provider identity or ownership. */
export const transferableGoogleEventFields = (event: Record<string, unknown>) => {
  const fields = ["description", "conferenceData", "extendedProperties", "guestsCanInviteOthers",
    "guestsCanModify", "guestsCanSeeOtherGuests"];
  return Object.fromEntries(fields.filter((field) => event[field] !== undefined)
    .map((field) => [field, event[field]]));
};

export class CalendarTransferCleanupError extends Error {}

export async function transferCalendarEvent<Result>({ create, deleteSource, rollback }: {
  create: () => Promise<Result>;
  deleteSource: () => Promise<void>;
  rollback: (result: Result) => Promise<void>;
}): Promise<Result> {
  const result = await create();
  try {
    await deleteSource();
  } catch (error) {
    if (error instanceof CalendarTransferCleanupError) throw error;
    try {
      await rollback(result);
    } catch {
      throw new CalendarTransferCleanupError("The original event could not be deleted, and a copy remains in the destination calendar. Refresh calendars before trying again.");
    }
    throw error;
  }
  return result;
}

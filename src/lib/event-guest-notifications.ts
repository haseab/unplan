import type {
  CalendarEvent,
  CalendarEventAttendee,
  GoogleSendUpdates,
} from "@/lib/calendar-types";

export type GuestNotificationAction = "create" | "delete" | "update";

export type GuestNotificationTarget = {
  attendees: CalendarEventAttendee[];
  events: CalendarEvent[];
};

export const eventHasNotifiableGuests = (event: CalendarEvent) =>
  event.organizerSelf === true
  && event.attendees?.some((attendee) => !attendee.self) === true;

export const sendUpdatesForEvent = (
  event: CalendarEvent,
  choice: GoogleSendUpdates,
): GoogleSendUpdates =>
  choice === "all" && eventHasNotifiableGuests(event) ? "all" : "none";

export const guestNotificationTarget = (
  events: CalendarEvent[],
): GuestNotificationTarget | null => {
  const organizedEvents = events.filter(eventHasNotifiableGuests);
  if (!organizedEvents.length) return null;

  const attendees = new Map<string, CalendarEventAttendee>();
  organizedEvents.forEach((event) => {
    event.attendees?.forEach((attendee) => {
      if (attendee.self) return;
      const key = attendee.email?.toLowerCase() ?? attendee.displayName;
      if (key) attendees.set(key, attendee);
    });
  });

  return { attendees: [...attendees.values()], events: organizedEvents };
};

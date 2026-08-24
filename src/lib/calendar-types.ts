export type CalendarSource = {
  id: string;
  accountId?: string;
  accountEmail?: string;
  name: string;
  backgroundColor: string;
  foregroundColor: string;
  primary?: boolean;
  selected?: boolean;
  writable?: boolean;
  provider: "google" | "demo";
  providerCalendarId?: string;
};

export type CalendarEvent = {
  id: string;
  calendarId: string;
  providerEventId?: string;
  title: string;
  start: string;
  end: string;
  createdAt?: string;
  calendarColor: string;
  color: string;
  colorId?: string;
  textColor?: string;
  allDay?: boolean;
  description?: string;
  location?: string;
  htmlLink?: string;
  conferenceLink?: string;
  timeZone?: string;
  recurrence?: string[];
  recurringEventId?: string;
  originalStart?: string;
  transparency?: "opaque" | "transparent";
  visibility?: "default" | "public" | "private" | "confidential";
  reminders?: CalendarEventReminders;
  attachments?: Array<{ fileUrl: string; title?: string }>;
  organizerSelf?: boolean;
  attendees?: CalendarEventAttendee[];
  provider: "google" | "demo";
};

export type CalendarEventReminders = {
  useDefault: boolean;
  overrides?: Array<{ method: "email" | "popup"; minutes: number }>;
};

export type CalendarEventAttendee = {
  displayName?: string;
  email?: string;
  organizer?: boolean;
  optional?: boolean;
  responseStatus?: "accepted" | "declined" | "needsAction" | "tentative";
  self?: boolean;
};

export type GoogleSendUpdates = "all" | "none";

export type GoogleCalendarEventPayload = {
  calendarSourceId: string;
  sourceCalendarSourceId?: string;
  eventId?: string;
  title?: string;
  start: string;
  end: string;
  allDay?: boolean;
  colorId?: string | null;
  description?: string;
  location?: string;
  timeZone?: string;
  recurrence?: string[];
  recurringEventId?: string;
  originalStart?: string;
  deleteScope?: "single" | "following";
  transparency?: "opaque" | "transparent";
  visibility?: "default" | "public" | "private" | "confidential";
  reminders?: CalendarEventReminders;
  attachments?: Array<{ fileUrl: string; title?: string }>;
  createConference?: boolean;
  attendees?: Array<{ email: string }>;
  sendUpdates?: GoogleSendUpdates;
};

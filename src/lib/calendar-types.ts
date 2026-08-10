export type CalendarSource = {
  id: string;
  name: string;
  backgroundColor: string;
  foregroundColor: string;
  primary?: boolean;
  writable?: boolean;
  provider: "google" | "demo";
};

export type CalendarEvent = {
  id: string;
  calendarId: string;
  title: string;
  start: string;
  end: string;
  calendarColor: string;
  color: string;
  colorId?: string;
  textColor?: string;
  allDay?: boolean;
  location?: string;
  htmlLink?: string;
  provider: "google" | "demo";
};

export type GoogleCalendarEventPayload = {
  calendarId: string;
  eventId?: string;
  title?: string;
  start: string;
  end: string;
  allDay?: boolean;
  colorId?: string;
};

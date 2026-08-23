import type { CalendarEvent } from "./calendar-types";

export type RecurringDeleteScope = "single" | "following";

export type EventDeletionOperation = {
  affectedIds: string[];
  event: CalendarEvent;
};

const seriesKey = (event: CalendarEvent) =>
  event.recurringEventId
    ? `${event.calendarId}:${event.recurringEventId}`
    : null;

const originalStart = (event: CalendarEvent) =>
  event.originalStart ?? event.start;

export const recurringDeleteCandidates = (events: CalendarEvent[]) =>
  events.filter((event) => Boolean(event.recurringEventId));

export const buildEventDeletionPlan = (
  allEvents: CalendarEvent[],
  selectedEvents: CalendarEvent[],
  scope: RecurringDeleteScope,
) => {
  const selectedIds = new Set(selectedEvents.map((event) => event.id));
  if (scope === "single") {
    return {
      operations: selectedEvents.map((event) => ({
        affectedIds: [event.id],
        event,
      })),
      removedIds: selectedIds,
    };
  }

  const earliestBySeries = new Map<string, CalendarEvent>();
  const standalone = selectedEvents.filter((event) => {
    const key = seriesKey(event);
    if (!key) return true;
    const current = earliestBySeries.get(key);
    if (!current || originalStart(event) < originalStart(current)) {
      earliestBySeries.set(key, event);
    }
    return false;
  });

  const operations: EventDeletionOperation[] = standalone.map((event) => ({
    affectedIds: [event.id],
    event,
  }));
  earliestBySeries.forEach((event, key) => {
    const cutoff = originalStart(event);
    const affectedIds = allEvents.flatMap((candidate) =>
      seriesKey(candidate) === key && originalStart(candidate) >= cutoff
        ? [candidate.id]
        : [],
    );
    operations.push({
      affectedIds: affectedIds.length ? affectedIds : [event.id],
      event,
    });
  });

  return {
    operations,
    removedIds: new Set(operations.flatMap(({ affectedIds }) => affectedIds)),
  };
};

const utcRecurrenceDateTime = (date: Date) =>
  date.toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");

const allDayUntil = (date: string) => {
  const previousDay = new Date(`${date}T00:00:00.000Z`);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  return previousDay.toISOString().slice(0, 10).replaceAll("-", "");
};

const rdateValueIsBefore = (value: string, originalStart: string) => {
  const normalized = value.trim();
  if (/^\d{8}$/.test(normalized)) {
    return normalized < originalStart.slice(0, 10).replaceAll("-", "");
  }
  if (/^\d{8}T\d{6}Z$/.test(normalized)) {
    const target = utcRecurrenceDateTime(new Date(originalStart));
    return normalized < target;
  }
  if (/^\d{8}T\d{6}$/.test(normalized)) {
    const target = originalStart.slice(0, 19).replaceAll("-", "").replaceAll(":", "");
    return normalized < target;
  }
  return true;
};

export const trimRecurrenceBefore = (
  recurrence: string[],
  originalStart: string,
) => {
  const allDay = /^\d{4}-\d{2}-\d{2}$/.test(originalStart);
  const until = allDay
    ? allDayUntil(originalStart)
    : utcRecurrenceDateTime(new Date(new Date(originalStart).getTime() - 1_000));
  let trimmedRule = false;

  const trimmed = recurrence.flatMap((line) => {
    if (line.startsWith("RRULE:")) {
      trimmedRule = true;
      const parts = line.slice(6).split(";").filter(
        (part) => !part.startsWith("COUNT=") && !part.startsWith("UNTIL="),
      );
      return [`RRULE:${parts.join(";")};UNTIL=${until}`];
    }
    if (line.startsWith("RDATE")) {
      const separator = line.indexOf(":");
      if (separator < 0) return [line];
      const prefix = line.slice(0, separator + 1);
      const values = line.slice(separator + 1).split(",").filter(
        (value) => rdateValueIsBefore(value, originalStart),
      );
      return values.length ? [`${prefix}${values.join(",")}`] : [];
    }
    return [line];
  });

  if (!trimmedRule) {
    throw new Error("This recurring event does not have a supported recurrence rule");
  }
  return trimmed;
};

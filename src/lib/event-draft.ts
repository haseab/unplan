import { addMinutes } from "date-fns";

import type { CalendarEvent } from "./calendar-types";

export const normalizeEventDraft = (candidate: CalendarEvent): CalendarEvent => {
  const start = new Date(candidate.start);
  const end = new Date(candidate.end);
  return {
    ...candidate,
    title: candidate.title.trim(),
    end: end > start
      ? candidate.end
      : addMinutes(start, candidate.allDay ? 24 * 60 : 30).toISOString(),
  };
};

const valuesEqual = (first: unknown, second: unknown): boolean => {
  if (Object.is(first, second)) return true;
  if (Array.isArray(first) || Array.isArray(second)) {
    return Array.isArray(first)
      && Array.isArray(second)
      && first.length === second.length
      && first.every((value, index) => valuesEqual(value, second[index]));
  }
  if (
    !first
    || !second
    || typeof first !== "object"
    || typeof second !== "object"
  ) return false;

  const firstRecord = first as Record<string, unknown>;
  const secondRecord = second as Record<string, unknown>;
  const firstKeys = Object.keys(firstRecord);
  const secondKeys = Object.keys(secondRecord);
  return firstKeys.length === secondKeys.length
    && firstKeys.every((key) => Object.hasOwn(secondRecord, key)
      && valuesEqual(firstRecord[key], secondRecord[key]));
};

export const eventDraftsEqual = (first: CalendarEvent, second: CalendarEvent) =>
  valuesEqual(normalizeEventDraft(first), normalizeEventDraft(second));

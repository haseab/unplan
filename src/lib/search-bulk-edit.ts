import type { CalendarEvent, CalendarSource } from "./calendar-types";
import type { EventColorChange } from "./event-color";
import { calendarsForEventSelection, moveSelectionToCalendar, recolorEventSelection } from "./multi-event-selection";

export type SearchBulkChanges = {
  calendarId?: string;
  color?: EventColorChange;
  transparency?: CalendarEvent["transparency"];
  visibility?: CalendarEvent["visibility"];
};

export const searchEventKey = (event: CalendarEvent) => `${event.calendarId}:${event.id}`;

export const editableSearchEvents = (events: CalendarEvent[], calendars: CalendarSource[]) => {
  const writable = new Set(calendars.filter(calendar => calendar.writable !== false).map(calendar => calendar.id));
  const unique = new Map(events.filter(event => writable.has(event.calendarId))
    .map(event => [searchEventKey(event), event]));
  return [...unique.values()];
};

/** Apply only staged fields, retaining snapshots for undo and offscreen provider moves. */
export const buildSearchBulkUpdates = (
  events: CalendarEvent[],
  selectedKeys: ReadonlySet<string>,
  changes: SearchBulkChanges,
  calendars: CalendarSource[],
) => {
  const originals = editableSearchEvents(events, calendars).filter(event => selectedKeys.has(searchEventKey(event)));
  const destination = changes.calendarId ? calendars.find(calendar => calendar.id === changes.calendarId && calendar.writable !== false) : undefined;
  if (changes.calendarId && (!destination || !calendarsForEventSelection(originals, calendars, calendars.filter(calendar => calendar.writable !== false)).some(calendar => calendar.id === destination.id))) return { originals: [], updated: [] };
  let updated = destination ? moveSelectionToCalendar(originals, destination) : originals;
  if (changes.color) updated = recolorEventSelection(updated, changes.color, calendars);
  updated = updated.map(event => ({ ...event,
    ...(changes.transparency ? { transparency: changes.transparency } : {}),
    ...(changes.visibility ? { visibility: changes.visibility } : {}),
  }));
  const changed = updated.flatMap((event, index) => JSON.stringify(event) !== JSON.stringify(originals[index]) ? [index] : []);
  return { originals: changed.map(index => originals[index]), updated: changed.map(index => updated[index]) };
};

/** Include offscreen matches without replacing newer in-memory copies. */
export const mergeSearchSnapshots = (loaded: CalendarEvent[], snapshots: CalendarEvent[]) => {
  const byId = new Map(snapshots.map(event => [event.id, event]));
  loaded.forEach(event => byId.set(event.id, event));
  return [...byId.values()];
};

/** Rebase only reviewed field changes onto the latest loaded version. */
export const rebaseSearchBulkUpdates = (
  updated: CalendarEvent[],
  reviewed: CalendarEvent[],
  loaded: CalendarEvent[],
) => {
  const latestById = new Map(loaded.map(event => [event.id, event]));
  const reviewedById = new Map(reviewed.map(event => [event.id, event]));
  return updated.map(next => {
    const snapshot = reviewedById.get(next.id);
    if (!snapshot) throw new Error("Search review is missing an event. Search again before applying.");
    const latest = latestById.get(next.id) ?? snapshot;
    if (latest.calendarId !== snapshot.calendarId) throw new Error("An event moved since this review. Search again before applying.");
    const patch: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(snapshot), ...Object.keys(next)])) {
      const field = key as keyof CalendarEvent;
      if (JSON.stringify(snapshot[field]) !== JSON.stringify(next[field])) patch[field] = next[field];
    }
    return { ...latest, ...patch };
  });
};

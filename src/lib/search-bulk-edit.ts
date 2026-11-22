import type { CalendarEvent, CalendarSource } from "./calendar-types";

export const searchEventKey = (event: CalendarEvent) => `${event.calendarId}:${event.id}`;

export const editableSearchEvents = (events: CalendarEvent[], calendars: CalendarSource[]) => {
  const writable = new Set(calendars.filter(calendar => calendar.writable !== false).map(calendar => calendar.id));
  const unique = new Map(events.filter(event => writable.has(event.calendarId))
    .map(event => [searchEventKey(event), event]));
  return [...unique.values()];
};

/** Include offscreen matches without replacing newer in-memory copies. */
export const mergeSearchSnapshots = (loaded: CalendarEvent[], snapshots: CalendarEvent[]) => {
  const byId = new Map(snapshots.map(event => [event.id, event]));
  loaded.forEach(event => byId.set(event.id, event));
  return [...byId.values()];
};

/** Transfer only completed search matches to the ordinary selection editor. */
export const selectSearchMatches = (
  loaded: CalendarEvent[],
  matches: CalendarEvent[],
  calendars: CalendarSource[],
) => {
  const latestById = new Map(loaded.map(event => [event.id, event]));
  return editableSearchEvents(matches.flatMap(snapshot => {
    const latest = latestById.get(snapshot.id);
    // A moved event no longer belongs to the searched source calendar.
    if (latest && latest.calendarId !== snapshot.calendarId) return [];
    return [latest ?? snapshot];
  }), calendars);
};

export const isSearchMatchesEditShortcut = (event: {
  metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; key: string;
}) => (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key === "ArrowRight";

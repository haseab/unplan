import type { CalendarEvent } from "./calendar-types";

export type OptimisticCalendarReconciliation = {
  confirmedIds: string[];
  confirmedRemovalIds: string[];
  events: CalendarEvent[];
  preservedIds: string[];
  suppressedRemovalIds: string[];
};

export type RefreshedEventSelection = {
  events: CalendarEvent[];
  selectedIds: Set<string>;
  selectedIdReplacements: Map<string, string>;
};

export const withCalendarEventPreview = (
  events: CalendarEvent[],
  preview: CalendarEvent | null,
) => preview
  ? events.map((event) =>
      event.id === preview.id
        ? preview
        : event
    )
  : events;

export const calendarEventViews = (
  events: CalendarEvent[],
  selectedEventIds: ReadonlySet<string>,
  preview: CalendarEvent | null,
) => ({
  displayedEvents: withCalendarEventPreview(
    events,
    preview && selectedEventIds.has(preview.id) ? preview : null,
  ),
  // Editors need the committed records as their comparison baseline. A live
  // preview is presentation state and must not feed back in as persisted data.
  selectedEvents: events.filter((event) => selectedEventIds.has(event.id)),
});

/**
 * Prevents a provider request that started before a local mutation from
 * replacing the optimistic event when that older snapshot arrives. Pending
 * events missing from the snapshot are retained as well (for example, while
 * moving an event between calendars).
 */
export const preservePendingCalendarEventUpdates = (
  refreshedEvents: CalendarEvent[],
  currentEvents: CalendarEvent[],
  pendingEventIds: Iterable<string>,
) => {
  const pendingIds = new Set(pendingEventIds);
  if (!pendingIds.size) return refreshedEvents;

  const currentPendingEvents = currentEvents.filter(({ id }) => pendingIds.has(id));
  const currentPendingById = new Map(currentPendingEvents.map((event) => [event.id, event]));
  const refreshedIds = new Set(refreshedEvents.map(({ id }) => id));

  return [
    ...refreshedEvents.map((event) => currentPendingById.get(event.id) ?? event),
    ...currentPendingEvents.filter(({ id }) => !refreshedIds.has(id)),
  ];
};

/**
 * Reconciles a provider snapshot without allowing it to erase mutations that
 * are still being committed. Provider records win once an optimistic ID is
 * visible in the snapshot.
 */
export const reconcileOptimisticCalendarEvents = (
  loadedEvents: CalendarEvent[],
  pendingEvents: Iterable<CalendarEvent>,
  pendingRemovalIds: Iterable<string> = [],
): OptimisticCalendarReconciliation => {
  const loadedIds = new Set(loadedEvents.map(({ id }) => id));
  const removalIds = [...pendingRemovalIds];
  const removalIdSet = new Set(removalIds);
  const visibleLoadedEvents = loadedEvents.filter(({ id }) => !removalIdSet.has(id));
  const pending = [...pendingEvents];
  const confirmedIds = pending
    .filter(({ id }) => loadedIds.has(id))
    .map(({ id }) => id);
  const preserved = pending.filter(({ id }) => !loadedIds.has(id));

  return {
    confirmedIds,
    confirmedRemovalIds: removalIds.filter((id) => !loadedIds.has(id)),
    events: [...visibleLoadedEvents, ...preserved],
    preservedIds: preserved.map(({ id }) => id),
    suppressedRemovalIds: removalIds.filter((id) => loadedIds.has(id)),
  };
};

/**
 * Keeps a user's explicit selection stable while replacing the provider
 * snapshot. Google events can acquire a new local ID when they move between
 * calendars, so providerEventId is used as the durable identity when possible.
 * A selected event missing from one snapshot is retained until the user moves
 * the selection; this prevents a transient refresh gap from erasing context.
 */
export const reconcileRefreshedEventSelection = (
  previousEvents: CalendarEvent[],
  refreshedEvents: CalendarEvent[],
  selectedIds: ReadonlySet<string>,
): RefreshedEventSelection => {
  if (!selectedIds.size) {
    return {
      events: refreshedEvents,
      selectedIds: new Set(),
      selectedIdReplacements: new Map(),
    };
  }

  const previousById = new Map(previousEvents.map((event) => [event.id, event]));
  const refreshedById = new Map(refreshedEvents.map((event) => [event.id, event]));
  const refreshedByProviderId = new Map<string, CalendarEvent[]>();
  refreshedEvents.forEach((event) => {
    if (!event.providerEventId) return;
    const matches = refreshedByProviderId.get(event.providerEventId) ?? [];
    matches.push(event);
    refreshedByProviderId.set(event.providerEventId, matches);
  });

  const nextSelectedIds = new Set<string>();
  const selectedIdReplacements = new Map<string, string>();
  const retainedEvents: CalendarEvent[] = [];

  selectedIds.forEach((selectedId) => {
    if (refreshedById.has(selectedId)) {
      nextSelectedIds.add(selectedId);
      return;
    }

    const previous = previousById.get(selectedId);
    const providerMatches = previous?.providerEventId
      ? refreshedByProviderId.get(previous.providerEventId) ?? []
      : [];
    const sameCalendarMatch = providerMatches.find(
      (event) => event.calendarId === previous?.calendarId,
    );
    const replacement = sameCalendarMatch
      ?? (providerMatches.length === 1 ? providerMatches[0] : null);

    if (replacement) {
      nextSelectedIds.add(replacement.id);
      selectedIdReplacements.set(selectedId, replacement.id);
      return;
    }

    if (previous) {
      retainedEvents.push(previous);
      nextSelectedIds.add(previous.id);
    }
  });

  return {
    events: [...refreshedEvents, ...retainedEvents],
    selectedIds: nextSelectedIds,
    selectedIdReplacements,
  };
};

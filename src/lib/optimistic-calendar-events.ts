import type { CalendarEvent } from "./calendar-types";

export type OptimisticCalendarReconciliation = {
  confirmedIds: string[];
  confirmedRemovalIds: string[];
  events: CalendarEvent[];
  preservedIds: string[];
  suppressedRemovalIds: string[];
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

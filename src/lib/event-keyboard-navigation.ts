export type EventNavigationDirection = "down" | "left" | "right" | "up";

export type EventNavigationTransition = {
  direction: EventNavigationDirection;
  fromEventKey: string;
  toEventKey: string;
};

export type EventNavigationRect = {
  bottom: number;
  dayIndex: number;
  endMinute: number;
  eventKey: string;
  left: number;
  right: number;
  startMinute: number;
  top: number;
};

export type EventNavigationTimePoint = Pick<
  EventNavigationRect,
  "dayIndex" | "endMinute" | "eventKey" | "startMinute"
>;

export type SidebarHorizontalArrowAction = "suppress";

export type EventMoveShortcut = {
  dayDelta: number;
  minuteDelta: number;
};

export type EventResizeShortcut = {
  minuteDelta: number;
};

export const isEventMoveToPresentShortcut = ({
  activeCalendar,
  altKey,
  ctrlKey,
  editable,
  includesAllDay,
  key,
  metaKey,
  modalOpen,
  repeat,
  selectedCount,
  shiftKey,
}: {
  activeCalendar: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  editable: boolean;
  includesAllDay: boolean;
  key: string;
  metaKey: boolean;
  modalOpen: boolean;
  repeat: boolean;
  selectedCount: number;
  shiftKey: boolean;
}) => (
  activeCalendar
  && altKey
  && !ctrlKey
  && !editable
  && !includesAllDay
  && key === "ArrowDown"
  && metaKey
  && !modalOpen
  && !repeat
  && selectedCount === 1
  && !shiftKey
);

export type CrossSurfaceMoveAction =
  | "schedule-sidebar-task"
  | "triage-calendar-events";

export const crossSurfaceMoveShortcut = ({
  activeSurface,
  altKey,
  editable,
  key,
  metaKey,
  modalOpen,
  shiftKey,
}: {
  activeSurface: "calendar" | "sidebar";
  altKey: boolean;
  editable: boolean;
  key: string;
  metaKey: boolean;
  modalOpen: boolean;
  shiftKey: boolean;
}): CrossSurfaceMoveAction | null => {
  if (!metaKey || !shiftKey || altKey || editable || modalOpen) return null;
  if (activeSurface === "sidebar" && key === "ArrowLeft") {
    return "schedule-sidebar-task";
  }
  if (activeSurface === "calendar" && key === "ArrowRight") {
    return "triage-calendar-events";
  }
  return null;
};

export const isEventMoveAtOrigin = ({
  dayDelta,
  minuteDelta,
}: EventMoveShortcut) => dayDelta === 0 && minuteDelta === 0;

export const eventMoveShortcut = ({
  activeCalendar,
  altKey,
  ctrlKey,
  editable,
  includesAllDay,
  key,
  metaKey,
  modalOpen,
  selectedCount,
  shiftKey,
}: {
  activeCalendar: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  editable: boolean;
  includesAllDay: boolean;
  key: string;
  metaKey: boolean;
  modalOpen: boolean;
  repeat: boolean;
  selectedCount: number;
  shiftKey: boolean;
}): EventMoveShortcut | null => {
  if (
    !activeCalendar
    || !altKey
    || ctrlKey
    || editable
    || metaKey
    || modalOpen
    || selectedCount === 0
    || shiftKey
  ) return null;

  if (key === "ArrowLeft") return { dayDelta: -1, minuteDelta: 0 };
  if (key === "ArrowRight") return { dayDelta: 1, minuteDelta: 0 };
  if (includesAllDay) return null;
  if (key === "ArrowUp") return { dayDelta: 0, minuteDelta: -15 };
  if (key === "ArrowDown") return { dayDelta: 0, minuteDelta: 15 };
  return null;
};

export const eventResizeShortcut = ({
  activeCalendar,
  altKey,
  ctrlKey,
  editable,
  includesAllDay,
  key,
  metaKey,
  modalOpen,
  selectedCount,
  shiftKey,
}: {
  activeCalendar: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  editable: boolean;
  includesAllDay: boolean;
  key: string;
  metaKey: boolean;
  modalOpen: boolean;
  repeat: boolean;
  selectedCount: number;
  shiftKey: boolean;
}): EventResizeShortcut | null => {
  if (
    !activeCalendar
    || !altKey
    || ctrlKey
    || editable
    || includesAllDay
    || metaKey
    || modalOpen
    || selectedCount === 0
    || !shiftKey
  ) return null;

  if (key === "ArrowUp") return { minuteDelta: -15 };
  if (key === "ArrowDown") return { minuteDelta: 15 };
  return null;
};

export const isEventCalendarPickerShortcut = ({
  altKey,
  key,
  modifier,
  modalOpen,
  repeat,
  selectedCount,
  shiftKey,
}: {
  altKey: boolean;
  key: string;
  modifier: boolean;
  modalOpen: boolean;
  repeat: boolean;
  selectedCount: number;
  shiftKey: boolean;
}) => (
  !altKey
  && !modifier
  && !modalOpen
  && !repeat
  && selectedCount > 0
  && !shiftKey
  && key.toLowerCase() === "c"
);

export const isEventTitleFocusShortcut = ({
  activeCalendar,
  altKey,
  calendarEventFocused,
  focusIsNeutral,
  key,
  modalOpen,
  modifier,
  selectedCount,
  shiftKey,
}: {
  activeCalendar: boolean;
  altKey: boolean;
  calendarEventFocused: boolean;
  focusIsNeutral: boolean;
  key: string;
  modalOpen: boolean;
  modifier: boolean;
  selectedCount: number;
  shiftKey: boolean;
}) => (
  key === "Enter"
  && !modifier
  && !altKey
  && !shiftKey
  && selectedCount > 0
  && !modalOpen
  && (calendarEventFocused || (activeCalendar && focusIsNeutral))
);

export const sidebarHorizontalArrowAction = ({
  altKey,
  ctrlKey,
  editable,
  key,
  metaKey,
  shiftKey,
}: {
  altKey: boolean;
  ctrlKey: boolean;
  editable: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}): SidebarHorizontalArrowAction | null => {
  if (altKey || ctrlKey || editable || metaKey || shiftKey) return null;
  if (key === "ArrowLeft" || key === "ArrowRight") return "suppress";
  return null;
};

const center = (start: number, end: number) => start + (end - start) / 2;

export const findEventClosestToTime = (
  events: EventNavigationTimePoint[],
  targetDayIndex: number,
  targetMinute: number,
) => {
  const target = targetDayIndex * 24 * 60 + targetMinute;
  return events.reduce<{ eventKey: string; score: number } | null>((best, event) => {
    const eventTime = event.dayIndex * 24 * 60
      + center(event.startMinute, event.endMinute);
    const score = Math.abs(eventTime - target);
    return !best || score < best.score ? { eventKey: event.eventKey, score } : best;
  }, null)?.eventKey ?? null;
};

export const findRenderedEventClosestToPresent = (
  events: EventNavigationTimePoint[],
  presentDayIndex: number,
  presentMinute: number,
  renderedDayCount: number,
) => presentDayIndex >= 0 && presentDayIndex < renderedDayCount
  ? findEventClosestToTime(events, presentDayIndex, presentMinute)
  : null;

export const resolveCalendarFocusTargetKey = (
  rememberedEventKey: string | null,
  renderedEventKeys: string[],
  presentEventKey: string | null,
) => rememberedEventKey && renderedEventKeys.includes(rememberedEventKey)
  ? rememberedEventKey
  : presentEventKey;

export const shouldConsumeEventNavigationKey = ({
  activeCalendar,
  navigated,
  selectedCount,
}: {
  activeCalendar: boolean;
  navigated: boolean;
  selectedCount: number;
}) => navigated || (activeCalendar && selectedCount > 0);

const centerDistance = (
  anchor: EventNavigationRect,
  candidate: EventNavigationRect,
) => Math.hypot(
  center(candidate.left, candidate.right) - center(anchor.left, anchor.right),
  center(candidate.top, candidate.bottom) - center(anchor.top, anchor.bottom),
);

const rectangleDistance = (
  anchor: EventNavigationRect,
  candidate: EventNavigationRect,
) => {
  const horizontalGap = Math.max(
    anchor.left - candidate.right,
    candidate.left - anchor.right,
    0,
  );
  const verticalGap = Math.max(
    anchor.top - candidate.bottom,
    candidate.top - anchor.bottom,
    0,
  );
  return Math.hypot(horizontalGap, verticalGap);
};

const nearestEventKey = (
  anchor: EventNavigationRect,
  candidates: EventNavigationRect[],
) => candidates.reduce<{
  centerScore: number;
  eventKey: string;
  rectangleScore: number;
} | null>(
  (best, candidate) => {
    const rectangleScore = rectangleDistance(anchor, candidate);
    const centerScore = centerDistance(anchor, candidate);
    return !best
      || rectangleScore < best.rectangleScore
      || (
        rectangleScore === best.rectangleScore
        && centerScore < best.centerScore
      )
      ? { centerScore, eventKey: candidate.eventKey, rectangleScore }
      : best;
  },
  null,
)?.eventKey ?? null;

export const resolveEventNavigationAnchorKey = (
  selectedKey: string | null,
  focusedKey: string | null,
  renderedKeys: string[],
) => {
  if (selectedKey && renderedKeys.includes(selectedKey)) return selectedKey;
  if (focusedKey && renderedKeys.includes(focusedKey)) return focusedKey;
  return null;
};

const oppositeDirection: Record<
  EventNavigationDirection,
  EventNavigationDirection
> = {
  down: "up",
  left: "right",
  right: "left",
  up: "down",
};

export const findEventNavigationBacktrackKey = (
  history: EventNavigationTransition[],
  anchorKey: string,
  direction: EventNavigationDirection,
) => {
  const previous = history.at(-1);
  if (
    !previous
    || previous.toEventKey !== anchorKey
    || oppositeDirection[previous.direction] !== direction
  ) {
    return null;
  }
  return previous.fromEventKey;
};

export const isHorizontalEventNavigationCandidate = (
  anchor: EventNavigationRect,
  candidate: EventNavigationRect,
  direction: "left" | "right",
) => {
  const movesRight = direction === "right";
  if (candidate.dayIndex !== anchor.dayIndex) {
    return movesRight
      ? candidate.dayIndex > anchor.dayIndex
      : candidate.dayIndex < anchor.dayIndex;
  }
  if (
    candidate.startMinute !== anchor.startMinute
    || candidate.endMinute !== anchor.endMinute
  ) {
    return false;
  }
  const anchorX = center(anchor.left, anchor.right);
  const candidateX = center(candidate.left, candidate.right);
  return movesRight ? candidateX > anchorX + 1 : candidateX < anchorX - 1;
};

export const findDirectionalEventKey = (
  anchor: EventNavigationRect,
  candidates: EventNavigationRect[],
  direction: EventNavigationDirection,
) => {
  const anchorX = center(anchor.left, anchor.right);
  const anchorY = center(anchor.top, anchor.bottom);
  const available = candidates.filter(
    (candidate) => candidate.eventKey !== anchor.eventKey,
  );

  if (direction === "left" || direction === "right") {
    const directionalEvents = available.filter((candidate) =>
      isHorizontalEventNavigationCandidate(anchor, candidate, direction)
    );
    return nearestEventKey(anchor, directionalEvents);
  }

  let best: { eventKey: string; score: number } | null = null;

  for (const candidate of available) {
    if (candidate.dayIndex !== anchor.dayIndex) continue;

    const candidateX = center(candidate.left, candidate.right);
    const candidateY = center(candidate.top, candidate.bottom);
    const primary = direction === "up"
      ? anchorY - candidateY
      : candidateY - anchorY;
    if (primary <= 1) continue;

    const perpendicular = Math.abs(candidateX - anchorX);
    const score = Math.hypot(primary, perpendicular);
    if (!best || score < best.score) {
      best = { eventKey: candidate.eventKey, score };
    }
  }

  return best?.eventKey ?? null;
};

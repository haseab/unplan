export type EventNavigationDirection = "down" | "left" | "right" | "up";

export type EventNavigationTransition = {
  direction: EventNavigationDirection;
  fromEventKey: string;
  toEventKey: string;
};

export const eventNavigationRangeKeys = (
  anchorEventKey: string,
  transitions: EventNavigationTransition[],
) => new Set([
  anchorEventKey,
  ...transitions.map(({ toEventKey }) => toEventKey),
]);

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

export type EventGapFillDirection = "down" | "up";

export const KEYBOARD_MOVE_GUEST_PROMPT_DELAY_MS = 500;
export const KEYBOARD_RESIZE_TOAST_DEBOUNCE_MS = 1_000;

export const restartKeyboardMoveIdleTimer = <TimerHandle>({
  cancelTimer,
  currentTimer,
  delay = KEYBOARD_MOVE_GUEST_PROMPT_DELAY_MS,
  onIdle,
  scheduleTimer,
}: {
  cancelTimer: (timer: TimerHandle) => void;
  currentTimer: TimerHandle | null;
  delay?: number;
  onIdle: () => void;
  scheduleTimer: (callback: () => void, delay: number) => TimerHandle;
}) => {
  if (currentTimer !== null) cancelTimer(currentTimer);
  return scheduleTimer(onIdle, delay);
};

export const isLeftSidebarToggleShortcut = ({
  altKey,
  code,
  ctrlKey,
  key,
  metaKey,
  modalOpen,
  repeat,
  shiftKey,
}: {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  modalOpen: boolean;
  repeat: boolean;
  shiftKey: boolean;
}) => (
  (metaKey || ctrlKey)
  && !altKey
  && !shiftKey
  && !modalOpen
  && !repeat
  && (key === "\\" || code === "Backslash")
);

export const isSettingsShortcut = ({
  altKey,
  code,
  ctrlKey,
  key,
  metaKey,
  repeat,
  shiftKey,
}: {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  repeat: boolean;
  shiftKey: boolean;
}) => (
  (metaKey || ctrlKey)
  && !altKey
  && !shiftKey
  && !repeat
  && (key === "," || code === "Comma")
);

export const eventGapFillShortcut = ({
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
}): EventGapFillDirection | null => {
  if (
    !activeCalendar
    || !altKey
    || ctrlKey
    || editable
    || includesAllDay
    || !metaKey
    || modalOpen
    || repeat
    || selectedCount !== 1
    || !shiftKey
  ) return null;

  if (key === "ArrowUp") return "up";
  if (key === "ArrowDown") return "down";
  return null;
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

export const isPastEventDuplicateShortcut = ({
  activeCalendar,
  altKey,
  ctrlKey,
  editable,
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
  key: string;
  metaKey: boolean;
  modalOpen: boolean;
  repeat: boolean;
  selectedCount: number;
  shiftKey: boolean;
}) => (
  activeCalendar
  && !altKey
  && !ctrlKey
  && !editable
  && key.toLowerCase() === "s"
  && !metaKey
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
  const minuteDelta = repeat ? 30 : 15;
  if (key === "ArrowUp") return { dayDelta: 0, minuteDelta: -minuteDelta };
  if (key === "ArrowDown") return { dayDelta: 0, minuteDelta };
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

export const isEventDetailsSubmitShortcut = ({
  altKey,
  ctrlKey,
  key,
  metaKey,
  shiftKey,
}: {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}) => (
  key === "Enter"
  && (metaKey || ctrlKey)
  && !altKey
  && !shiftKey
);

export const eventTitleEditAction = ({
  altKey,
  isComposing,
  key,
  shiftKey,
}: {
  altKey: boolean;
  isComposing: boolean;
  key: string;
  shiftKey: boolean;
}): "cancel" | "commit" | null => {
  if (isComposing) return null;
  if (key === "Escape") return "cancel";
  if (key === "Enter" && !altKey && !shiftKey) return "commit";
  return null;
};

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

export const findClosestEventKey = (
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

const compareVerticalEventOrder = (
  first: EventNavigationRect,
  second: EventNavigationRect,
) => first.dayIndex - second.dayIndex
  || first.startMinute - second.startMinute
  || first.left - second.left
  || first.endMinute - second.endMinute
  || first.eventKey.localeCompare(second.eventKey);

export const findVerticalEventKey = (
  anchor: EventNavigationRect,
  candidates: EventNavigationRect[],
  direction: "down" | "up",
) => {
  const ordered = [
    anchor,
    ...candidates.filter((candidate) =>
      candidate.eventKey !== anchor.eventKey
    ),
  ].sort(compareVerticalEventOrder);
  const anchorIndex = ordered.findIndex(
    (candidate) => candidate.eventKey === anchor.eventKey,
  );
  const nextIndex = anchorIndex + (direction === "up" ? -1 : 1);
  return ordered[nextIndex]?.eventKey ?? null;
};

export const findDirectionalEventKey = (
  anchor: EventNavigationRect,
  candidates: EventNavigationRect[],
  direction: EventNavigationDirection,
) => {
  const available = candidates.filter(
    (candidate) => candidate.eventKey !== anchor.eventKey,
  );

  if (direction === "left" || direction === "right") {
    const directionalEvents = available.filter((candidate) =>
      isHorizontalEventNavigationCandidate(anchor, candidate, direction)
    );
    return findClosestEventKey(anchor, directionalEvents);
  }
  return findVerticalEventKey(anchor, available, direction);
};

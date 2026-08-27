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

export type SidebarHorizontalArrowAction = "focus-calendar" | "suppress";

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
  if (key === "ArrowLeft") return "focus-calendar";
  if (key === "ArrowRight") return "suppress";
  return null;
};

const center = (start: number, end: number) => start + (end - start) / 2;

export const findEventClosestToMiddleDayNoon = (
  events: EventNavigationTimePoint[],
  renderedDayCount: number,
) => {
  const target = ((renderedDayCount - 1) / 2) * 24 * 60 + 12 * 60;
  return events.reduce<{ eventKey: string; score: number } | null>((best, event) => {
    const eventTime = event.dayIndex * 24 * 60
      + center(event.startMinute, event.endMinute);
    const score = Math.abs(eventTime - target);
    return !best || score < best.score ? { eventKey: event.eventKey, score } : best;
  }, null)?.eventKey ?? null;
};

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

export type EventNavigationDirection = "down" | "left" | "right" | "up";

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

const center = (start: number, end: number) => start + (end - start) / 2;

const centerDistance = (
  anchor: EventNavigationRect,
  candidate: EventNavigationRect,
) => Math.hypot(
  center(candidate.left, candidate.right) - center(anchor.left, anchor.right),
  center(candidate.top, candidate.bottom) - center(anchor.top, anchor.bottom),
);

const nearestEventKey = (
  anchor: EventNavigationRect,
  candidates: EventNavigationRect[],
) => candidates.reduce<{ eventKey: string; score: number } | null>(
  (best, candidate) => {
    const score = centerDistance(anchor, candidate);
    return !best || score < best.score
      ? { eventKey: candidate.eventKey, score }
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
    const movesRight = direction === "right";
    const matchingTime = (candidate: EventNavigationRect) =>
      candidate.startMinute === anchor.startMinute
      && candidate.endMinute === anchor.endMinute;
    const sameDayMatches = available.filter((candidate) => {
      if (candidate.dayIndex !== anchor.dayIndex || !matchingTime(candidate)) {
        return false;
      }
      const candidateX = center(candidate.left, candidate.right);
      return movesRight ? candidateX > anchorX + 1 : candidateX < anchorX - 1;
    });
    const sameDayKey = nearestEventKey(anchor, sameDayMatches);
    if (sameDayKey) return sameDayKey;

    const adjacentDay = anchor.dayIndex + (movesRight ? 1 : -1);
    const adjacentEvents = available.filter(
      (candidate) => candidate.dayIndex === adjacentDay,
    );
    const adjacentMatch = nearestEventKey(
      anchor,
      adjacentEvents.filter(matchingTime),
    );
    if (adjacentMatch) return adjacentMatch;

    const fallbackEvents = adjacentEvents.filter((candidate) =>
      movesRight
        ? candidate.startMinute > anchor.startMinute
        : candidate.startMinute < anchor.startMinute
    );
    if (!fallbackEvents.length) return null;
    const fallbackStart = movesRight
      ? Math.min(...fallbackEvents.map((candidate) => candidate.startMinute))
      : Math.max(...fallbackEvents.map((candidate) => candidate.startMinute));
    return nearestEventKey(
      anchor,
      fallbackEvents.filter(
        (candidate) => candidate.startMinute === fallbackStart,
      ),
    );
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

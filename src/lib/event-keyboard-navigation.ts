export type EventNavigationDirection = "down" | "left" | "right" | "up";

export type EventNavigationRect = {
  bottom: number;
  eventKey: string;
  left: number;
  right: number;
  top: number;
};

const center = (start: number, end: number) => start + (end - start) / 2;

export const findDirectionalEventKey = (
  anchor: EventNavigationRect,
  candidates: EventNavigationRect[],
  direction: EventNavigationDirection,
) => {
  const anchorX = center(anchor.left, anchor.right);
  const anchorY = center(anchor.top, anchor.bottom);
  let best: { eventKey: string; score: number } | null = null;

  for (const candidate of candidates) {
    if (candidate.eventKey === anchor.eventKey) continue;
    const candidateX = center(candidate.left, candidate.right);
    const candidateY = center(candidate.top, candidate.bottom);
    const horizontal = direction === "left" || direction === "right";
    const primary = direction === "left"
      ? anchorX - candidateX
      : direction === "right"
        ? candidateX - anchorX
        : direction === "up"
          ? anchorY - candidateY
          : candidateY - anchorY;
    if (primary <= 1) continue;

    const perpendicular = horizontal
      ? Math.abs(candidateY - anchorY)
      : Math.abs(candidateX - anchorX);
    if (primary < perpendicular * 0.15) continue;
    const score = primary + perpendicular * 0.35;
    if (!best || score < best.score) {
      best = { eventKey: candidate.eventKey, score };
    }
  }

  return best?.eventKey ?? null;
};

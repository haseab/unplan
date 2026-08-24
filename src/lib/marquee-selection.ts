export type SelectionRectangle = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export type MarqueeHitRegion = SelectionRectangle & {
  eventId: string;
  stackIndex: number;
};

export const addMarqueeSelection = (
  baseSelection: ReadonlySet<string>,
  marqueeSelection: ReadonlySet<string>,
) => new Set([...baseSelection, ...marqueeSelection]);

const intersection = (
  first: SelectionRectangle,
  second: SelectionRectangle,
): SelectionRectangle | null => {
  const overlap = {
    bottom: Math.min(first.bottom, second.bottom),
    left: Math.max(first.left, second.left),
    right: Math.min(first.right, second.right),
    top: Math.max(first.top, second.top),
  };

  return overlap.left < overlap.right && overlap.top < overlap.bottom
    ? overlap
    : null;
};

const subtractRectangle = (
  source: SelectionRectangle,
  cover: SelectionRectangle,
) => {
  const overlap = intersection(source, cover);
  if (!overlap) return [source];

  return [
    { ...source, bottom: overlap.top },
    { ...source, top: overlap.bottom },
    {
      bottom: overlap.bottom,
      left: source.left,
      right: overlap.left,
      top: overlap.top,
    },
    {
      bottom: overlap.bottom,
      left: overlap.right,
      right: source.right,
      top: overlap.top,
    },
  ].filter((rectangle) =>
    rectangle.left < rectangle.right && rectangle.top < rectangle.bottom
  );
};

export const visibleEventIdsIntersectingRectangle = (
  regions: MarqueeHitRegion[],
  selection: SelectionRectangle,
) => {
  const matches = new Set<string>();

  regions.forEach((region) => {
    const selectedArea = intersection(region, selection);
    if (!selectedArea) return;

    const visiblePieces = regions
      .filter((candidate) => candidate.stackIndex > region.stackIndex)
      .reduce<SelectionRectangle[]>(
        (pieces, cover) => pieces.flatMap((piece) =>
          subtractRectangle(piece, cover)
        ),
        [selectedArea],
      );

    if (visiblePieces.length > 0) matches.add(region.eventId);
  });

  return matches;
};

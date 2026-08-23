export type TimedEventSegment = {
  dayIndex: number;
  endMinute: number;
  key: string;
  sortOrder: number;
  startMinute: number;
};

export type TimedEventLayout = {
  left: number;
  overlapping: boolean;
  width: number;
  zIndex: number;
};

const CASCADE_INSET = 0.05;
const LABEL_SAFE_MINUTES = 45;

const duration = (segment: TimedEventSegment) =>
  segment.endMinute - segment.startMinute;

const segmentsOverlap = (
  first: TimedEventSegment,
  second: TimedEventSegment,
) => first.startMinute < second.endMinute && first.endMinute > second.startMinute;

const sortChronologically = (
  first: TimedEventSegment,
  second: TimedEventSegment,
) =>
  first.startMinute - second.startMinute ||
  second.endMinute - first.endMinute ||
  first.key.localeCompare(second.key);

const sortLargestFirst = (
  first: TimedEventSegment,
  second: TimedEventSegment,
) =>
  duration(second) - duration(first) ||
  first.sortOrder - second.sortOrder ||
  first.startMinute - second.startMinute ||
  first.key.localeCompare(second.key);

const forEachConflictGroup = (
  segments: TimedEventSegment[],
  visit: (group: TimedEventSegment[]) => void,
) => {
  const sorted = [...segments].sort(sortChronologically);
  let group: TimedEventSegment[] = [];
  let groupEnd = Number.NEGATIVE_INFINITY;

  const flush = () => {
    if (group.length > 0) visit(group);
    group = [];
    groupEnd = Number.NEGATIVE_INFINITY;
  };

  sorted.forEach((segment) => {
    if (group.length > 0 && segment.startMinute >= groupEnd) flush();
    group.push(segment);
    groupEnd = Math.max(groupEnd, segment.endMinute);
  });
  flush();
};

const assignLanesLargestFirst = (segments: TimedEventSegment[]) => {
  const lanes: TimedEventSegment[][] = [];
  const assignments = new Map<string, number>();

  [...segments].sort(sortLargestFirst).forEach((segment) => {
    let lane = lanes.findIndex((laneSegments) =>
      laneSegments.every((candidate) => !segmentsOverlap(segment, candidate)),
    );
    if (lane === -1) {
      lane = lanes.length;
      lanes.push([]);
    }
    lanes[lane].push(segment);
    assignments.set(segment.key, lane);
  });

  return { assignments, laneCount: lanes.length, lanes };
};

const layoutAsColumns = (
  segments: TimedEventSegment[],
  layouts: Map<string, TimedEventLayout>,
  left = 0,
  width = 1,
  zIndex = 0,
) => {
  const { assignments, laneCount } = assignLanesLargestFirst(segments);
  segments.forEach((segment) => {
    const lane = assignments.get(segment.key) ?? 0;
    layouts.set(segment.key, {
      left: left + (lane / laneCount) * width,
      overlapping: laneCount > 1 || left > 0,
      width: width / laneCount,
      zIndex: zIndex + lane,
    });
  });
};

const layoutConflictGroup = (
  segments: TimedEventSegment[],
  layouts: Map<string, TimedEventLayout>,
  left = 0,
  width = 1,
  zIndex = 0,
  isNested = false,
) => {
  if (segments.length === 1) {
    layouts.set(segments[0].key, {
      left,
      overlapping: isNested,
      width,
      zIndex,
    });
    return;
  }

  const largestFirst = [...segments].sort(sortLargestFirst);
  const dominant = largestFirst[0];
  const secondaries = largestFirst.slice(1);
  const hasUniqueDominant = duration(dominant) > duration(secondaries[0]);

  if (!hasUniqueDominant) {
    layoutAsColumns(segments, layouts, left, width, zIndex);
    return;
  }

  layouts.set(dominant.key, {
    left,
    overlapping: true,
    width,
    zIndex,
  });
  const safeLabelEnd = dominant.startMinute + Math.min(
    LABEL_SAFE_MINUTES,
    duration(dominant),
  );
  forEachConflictGroup(secondaries, (secondaryGroup) => {
    const protectsDominantLabel = secondaryGroup.some(
      (segment) => segment.startMinute < safeLabelEnd,
    );
    const inset = protectsDominantLabel ? 0.5 : CASCADE_INSET;
    layoutConflictGroup(
      secondaryGroup,
      layouts,
      left + inset * width,
      (1 - inset) * width,
      zIndex + 1,
      true,
    );
  });
};

/**
 * Produces Cron-style overlap geometry within each day. A uniquely longest
 * event stays full-width underneath shorter events, which cascade from a 5%
 * inset. Equal-duration conflicts use equal-width columns, ordered oldest to
 * newest from left to right. Only the shorter row that collides with the
 * longest event's label moves to the right half. The same rule is applied
 * recursively, so every locally longest event keeps its full width behind its
 * shorter children.
 */
export const layoutTimedEventSegments = (segments: TimedEventSegment[]) => {
  const layouts = new Map<string, TimedEventLayout>();
  const segmentsByDay = new Map<number, TimedEventSegment[]>();

  segments.forEach((segment) => {
    const daySegments = segmentsByDay.get(segment.dayIndex) ?? [];
    daySegments.push(segment);
    segmentsByDay.set(segment.dayIndex, daySegments);
  });

  segmentsByDay.forEach((daySegments) => {
    forEachConflictGroup(daySegments, (group) =>
      layoutConflictGroup(group, layouts),
    );
  });

  return layouts;
};

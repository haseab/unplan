export const horizontalCalendarDayShift = (
  scrollLeft: number,
  pageWidth: number,
  dayCount: number,
) => {
  if (pageWidth <= 0 || dayCount <= 0) return 0;
  const dayWidth = pageWidth / dayCount;
  const rawShift = (scrollLeft - pageWidth) / dayWidth;
  const roundedShift = Math.sign(rawShift) * Math.floor(Math.abs(rawShift) + 0.5);
  if (roundedShift === 0) return 0;
  return Math.max(-dayCount, Math.min(dayCount, roundedShift));
};

export const recenteredCalendarScrollLeft = (
  anchorScrollLeft: number,
  dayShift: number,
  pageWidth: number,
  dayCount: number,
) => dayCount > 0
  ? anchorScrollLeft - dayShift * (pageWidth / dayCount)
  : anchorScrollLeft;

export const dominantAxisCalendarScrollDelta = (
  deltaX: number,
  deltaY: number,
) => {
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return { left: deltaX, top: 0 };
  }
  return { left: 0, top: deltaY };
};

export type CalendarScrollAxis = "horizontal" | "vertical";

export const canSettleCalendarHorizontalInteraction = ({
  horizontalWheelScrolling,
  pendingBufferPosition,
  recentering,
}: {
  horizontalWheelScrolling: boolean;
  pendingBufferPosition: boolean;
  recentering: boolean;
}) => !horizontalWheelScrolling && !pendingBufferPosition && !recentering;

const AXIS_SWITCH_DOMINANCE_RATIO = 1.6;
const AXIS_SWITCH_MIN_DELTA = 4;

export const intentionalCalendarScrollDelta = (
  deltaX: number,
  deltaY: number,
  currentAxis: CalendarScrollAxis | null,
) => {
  const horizontalMagnitude = Math.abs(deltaX);
  const verticalMagnitude = Math.abs(deltaY);
  let axis = currentAxis;

  if (!axis) {
    axis = horizontalMagnitude > verticalMagnitude ? "horizontal" : "vertical";
  } else if (
    axis === "horizontal"
    && verticalMagnitude >= AXIS_SWITCH_MIN_DELTA
    && verticalMagnitude > horizontalMagnitude * AXIS_SWITCH_DOMINANCE_RATIO
  ) {
    axis = "vertical";
  } else if (
    axis === "vertical"
    && horizontalMagnitude >= AXIS_SWITCH_MIN_DELTA
    && horizontalMagnitude > verticalMagnitude * AXIS_SWITCH_DOMINANCE_RATIO
  ) {
    axis = "horizontal";
  }

  return {
    axis,
    left: axis === "horizontal" ? deltaX : 0,
    top: axis === "vertical" ? deltaY : 0,
  };
};

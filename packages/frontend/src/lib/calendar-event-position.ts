export const calendarEventInlinePosition = ({
  dayCount,
  dayIndex,
  endInset,
  layoutLeft = 0,
  layoutWidth = 1,
  startInset,
}: {
  dayCount: number;
  dayIndex: number;
  endInset: number;
  layoutLeft?: number;
  layoutWidth?: number;
  startInset: number;
}) => {
  const dayWidth = 100 / dayCount;
  const dayEndGutter = endInset - startInset;
  const leftOffset = startInset - layoutLeft * dayEndGutter;

  return {
    left: `calc(${(dayIndex + layoutLeft) * dayWidth}% ${leftOffset < 0 ? "-" : "+"} ${Math.abs(leftOffset)}px)`,
    width: `calc(${layoutWidth * dayWidth}% - ${startInset * 2 + layoutWidth * dayEndGutter}px)`,
  };
};

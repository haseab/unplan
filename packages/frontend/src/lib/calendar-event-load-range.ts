export type CalendarEventLoadRange = {
  end: number;
  start: number;
};

export type CalendarEventLoadCoverage = CalendarEventLoadRange & {
  key: string;
};

export type CalendarEventLoadPlan = {
  mode: "merge" | "replace";
  range: CalendarEventLoadRange;
};

export const planCalendarEventLoad = (
  key: string,
  target: CalendarEventLoadRange,
  coverage: CalendarEventLoadCoverage | null,
  forceReplace = false,
): CalendarEventLoadPlan | null => {
  if (
    forceReplace
    || !coverage
    || coverage.key !== key
    || target.end <= coverage.start
    || target.start >= coverage.end
  ) {
    return { mode: "replace", range: target };
  }
  if (target.start < coverage.start) {
    return {
      mode: "merge",
      range: { end: coverage.start, start: target.start },
    };
  }
  if (target.end > coverage.end) {
    return {
      mode: "merge",
      range: { end: target.end, start: coverage.end },
    };
  }
  return null;
};

export const includeCalendarEventLoadRange = (
  key: string,
  coverage: CalendarEventLoadCoverage | null,
  loaded: CalendarEventLoadRange,
  replace: boolean,
): CalendarEventLoadCoverage => replace || !coverage || coverage.key !== key
  ? { key, ...loaded }
  : {
      key,
      end: Math.max(coverage.end, loaded.end),
      start: Math.min(coverage.start, loaded.start),
    };

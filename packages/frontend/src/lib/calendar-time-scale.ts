export const CALENDAR_TIME_SCALE_STORAGE_KEY = "unplan:calendar-time-scale";
export const DEFAULT_CALENDAR_TIME_SCALE = 1;
export const MIN_CALENDAR_TIME_SCALE = 0.5;
export const MAX_CALENDAR_TIME_SCALE = 2;
export const CALENDAR_TIME_SCALE_STEP = 0.05;

const DRAG_PIXELS_PER_SCALE_UNIT = 300;
const MIN_HALF_HOUR_LINE_SPACING = 24;
const MIN_HOUR_LINE_SPACING = 36;

export type CalendarGridLineDensity = {
  hourInterval: 1 | 2;
  showHalfHourLines: boolean;
};

export const calendarGridLineDensity = (
  pixelsPerMinute: number,
): CalendarGridLineDensity => {
  const hourHeight = pixelsPerMinute * 60;
  return {
    hourInterval: hourHeight < MIN_HOUR_LINE_SPACING ? 2 : 1,
    showHalfHourLines:
      pixelsPerMinute * 30 >= MIN_HALF_HOUR_LINE_SPACING,
  };
};

export const normalizeCalendarTimeScale = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_CALENDAR_TIME_SCALE;
  const clamped = Math.min(
    Math.max(value, MIN_CALENDAR_TIME_SCALE),
    MAX_CALENDAR_TIME_SCALE,
  );
  return Number(
    (Math.round(clamped / CALENDAR_TIME_SCALE_STEP)
      * CALENDAR_TIME_SCALE_STEP).toFixed(2),
  );
};

export const calendarTimeScaleFromDrag = (
  startScale: number,
  verticalDelta: number,
) => normalizeCalendarTimeScale(
  startScale + verticalDelta / DRAG_PIXELS_PER_SCALE_UNIT,
);

export const parseStoredCalendarTimeScale = (storedValue: string | null) => {
  if (storedValue === null || storedValue.trim() === "") {
    return DEFAULT_CALENDAR_TIME_SCALE;
  }
  const parsed = Number(storedValue);
  return Number.isFinite(parsed)
    ? normalizeCalendarTimeScale(parsed)
    : DEFAULT_CALENDAR_TIME_SCALE;
};

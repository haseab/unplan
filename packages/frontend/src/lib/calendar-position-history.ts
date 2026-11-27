export type CalendarPosition = {
  dayCount: number;
  scrollTop: number;
  viewStart: string;
};

export type CalendarPositionHistory = {
  entries: CalendarPosition[];
  index: number;
};

export const CALENDAR_POSITION_STORAGE_KEY = "unplan:calendar-position";
const MAX_POSITION_HISTORY = 100;

export const parseStoredCalendarPosition = (
  stored: string | null,
): CalendarPosition | null => {
  if (!stored) return null;
  try {
    const candidate = JSON.parse(stored) as Partial<CalendarPosition>;
    if (
      !Number.isInteger(candidate.dayCount)
      || (candidate.dayCount ?? 0) < 1
      || !Number.isFinite(candidate.scrollTop)
      || (candidate.scrollTop ?? -1) < 0
      || typeof candidate.viewStart !== "string"
      || !Number.isFinite(Date.parse(candidate.viewStart))
    ) {
      return null;
    }
    return {
      dayCount: candidate.dayCount!,
      scrollTop: candidate.scrollTop!,
      viewStart: candidate.viewStart,
    };
  } catch {
    return null;
  }
};

export const serializeCalendarPosition = (position: CalendarPosition) =>
  JSON.stringify(position);

const samePosition = (first: CalendarPosition, second: CalendarPosition) =>
  first.dayCount === second.dayCount
  && Math.round(first.scrollTop) === Math.round(second.scrollTop)
  && first.viewStart === second.viewStart;

export const createCalendarPositionHistory = (
  initial: CalendarPosition,
): CalendarPositionHistory => ({ entries: [initial], index: 0 });

export const pushCalendarPosition = (
  history: CalendarPositionHistory,
  position: CalendarPosition,
): CalendarPositionHistory => {
  if (samePosition(history.entries[history.index], position)) return history;
  const entries = [...history.entries.slice(0, history.index + 1), position]
    .slice(-MAX_POSITION_HISTORY);
  return { entries, index: entries.length - 1 };
};

export const undoCalendarPosition = (
  history: CalendarPositionHistory,
) => {
  if (history.index <= 0) return { history, position: null };
  const index = history.index - 1;
  return {
    history: { ...history, index },
    position: history.entries[index],
  };
};

export const redoCalendarPosition = (
  history: CalendarPositionHistory,
) => {
  if (history.index >= history.entries.length - 1) {
    return { history, position: null };
  }
  const index = history.index + 1;
  return {
    history: { ...history, index },
    position: history.entries[index],
  };
};

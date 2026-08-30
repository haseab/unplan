import { casual } from "chrono-node";
import { addDays, addMinutes, startOfDay } from "date-fns";

export type ParsedEventTime = {
  allDay: boolean;
  end: Date;
  start: Date;
};

const DEFAULT_EVENT_MINUTES = 60;
const EVENT_TIME_INCREMENT_MINUTES = 15;
const DURATION_PATTERN = /\bfor\s+(?:(half)\s+(?:an?\s+)?|(an?)\s+)?(\d+(?:\.\d+)?)?\s*(minutes?|mins?|m|hours?|hrs?|h)\b/i;

const normalizeCompactRangeTimes = (input: string) => {
  if (!/(?:\s(?:to|through|thru|until)\s|\s[-–—]\s|\d\s*[-–—]\s*\d)/i.test(input)) {
    return input;
  }

  return input.replace(/\b(\d{3,4})(\s*(?:a\.?m?\.?|p\.?m?\.?))?\b/gi, (match, digits: string, suffix = "") => {
    const hour = Number(digits.slice(0, -2));
    const minute = Number(digits.slice(-2));
    if (hour > 23 || minute > 59) return match;
    return `${hour}:${String(minute).padStart(2, "0")}${suffix}`;
  });
};

const durationMinutesFromInput = (input: string) => {
  const match = input.match(DURATION_PATTERN);
  if (!match) return null;
  const unit = match[4].toLowerCase();
  const amount = match[3]
    ? Number(match[3])
    : match[1]
      ? 0.5
      : 1;
  return Math.round(amount * (/^(?:hours?|hrs?|h)$/.test(unit) ? 60 : 1));
};

const withoutDuration = (input: string) => input.replace(DURATION_PATTERN, " ")
  .replace(/\s+/g, " ").trim();

const isExplicitAllDay = (input: string) => /\ball[ -]?day\b/i.test(input);

const roundsFromNow = (input: string) => /\bnow\b/i.test(input);

const roundToEventTimeIncrement = (date: Date) => {
  const rounded = new Date(date);
  rounded.setMinutes(
    Math.round(rounded.getMinutes() / EVENT_TIME_INCREMENT_MINUTES)
      * EVENT_TIME_INCREMENT_MINUTES,
    0,
    0,
  );
  return rounded;
};

const hasExplicitTime = (result: ReturnType<typeof casual.parse>[number]) =>
  result.start.isCertain("hour") || Boolean(result.end?.isCertain("hour"));

const trailingRangeEnd = (input: string, start: Date) => {
  const match = input.match(
    /(?:\b(?:to|through|thru|until)\b|[-–—])\s*(noon|midnight|\d{1,2}(?::\d{1,2})?\s*(?:a\.?m?\.?|p\.?m?\.?)?)\s*$/i,
  );
  if (!match) return null;
  const token = match[1].toLowerCase().replace(/[.\s]/g, "");
  let hour: number;
  let minute = 0;
  if (token === "noon") hour = 12;
  else if (token === "midnight") hour = 0;
  else {
    const timeMatch = token.match(/^(\d{1,2})(?::(\d{1,2}))?(am?|pm?)?$/);
    if (!timeMatch) return null;
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2] ?? 0);
    if (hour > 23 || minute > 59) return null;
    const meridiem = timeMatch[3];
    if (meridiem?.startsWith("p") && hour < 12) hour += 12;
    if (meridiem?.startsWith("a") && hour === 12) hour = 0;
    if (!meridiem && hour <= 12) {
      while (hour < start.getHours() || (hour === start.getHours() && minute <= start.getMinutes())) {
        hour += 12;
      }
    }
  }
  const end = new Date(start);
  end.setHours(hour, minute, 0, 0);
  if (end <= start) end.setDate(end.getDate() + 1);
  return end;
};

export const parseEventTime = (
  input: string,
  referenceDate = new Date(),
): ParsedEventTime | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const allDayRequested = isExplicitAllDay(trimmed);
  const durationMinutes = durationMinutesFromInput(trimmed);
  const parseable = normalizeCompactRangeTimes(
    withoutDuration(trimmed.replace(/\ball[ -]?day\b/gi, " ")),
  );
  let result = casual.parse(parseable, referenceDate, { forwardDate: false })[0];
  if (!result) return null;
  if (
    result.start.isCertain("day")
    || result.start.isCertain("month")
    || result.start.isCertain("weekday")
    || result.start.isCertain("year")
  ) {
    result = casual.parse(parseable, referenceDate, { forwardDate: true })[0] ?? result;
  }

  if (allDayRequested) {
    const start = startOfDay(result.start.date());
    return { allDay: true, end: addDays(start, 1), start };
  }

  let start = result.start.date();
  if (roundsFromNow(parseable)) {
    start = roundToEventTimeIncrement(start);
  } else if (!hasExplicitTime(result)) {
    start = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
      9,
    );
  }
  const end = result.end?.date()
    ?? trailingRangeEnd(parseable, start)
    ?? addMinutes(start, durationMinutes ?? DEFAULT_EVENT_MINUTES);

  if (end <= start) return null;
  return { allDay: false, end, start };
};

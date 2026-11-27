import { casual } from "chrono-node";
import { startOfDay } from "date-fns";

const DATE_RELATIVE_SHORTHAND = /^(\d+)\s*(day|days|d|week|weeks|wk|wks|w|month|months|mo|mos|year|years|yr|yrs|y)\.?\s*(ago|before|later|earlier|after|af|a|b|e|l)$/i;

const normalizeDateRelativeShorthand = (input: string) => {
  const match = input.match(DATE_RELATIVE_SHORTHAND);
  if (!match) return input;

  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) return input;

  const unitToken = match[2].toLowerCase();
  const unit = unitToken.startsWith("d")
    ? "day"
    : unitToken.startsWith("w")
      ? "week"
      : unitToken.startsWith("m")
        ? "month"
        : "year";
  const directionToken = match[3].toLowerCase();
  const direction = directionToken === "af"
    ? "after"
    : directionToken === "a"
      ? "ago"
      : directionToken === "b"
        ? "before"
        : directionToken === "e"
          ? "earlier"
          : directionToken === "l"
            ? "later"
            : directionToken;

  return `${amount} ${unit}${amount === 1 ? "" : "s"} ${direction}`;
};

export const parseCalendarDateCommand = (
  input: string,
  referenceDate = new Date(),
) => {
  const query = input.trim();
  if (!query) return null;

  const normalizedQuery = normalizeDateRelativeShorthand(query);
  const result = casual.parse(normalizedQuery, referenceDate, { forwardDate: true })[0];
  if (!result) return null;

  return startOfDay(result.start.date());
};

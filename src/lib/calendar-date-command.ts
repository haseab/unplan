import { casual } from "chrono-node";
import { startOfDay } from "date-fns";

export const parseCalendarDateCommand = (
  input: string,
  referenceDate = new Date(),
) => {
  const query = input.trim();
  if (!query) return null;

  const result = casual.parse(query, referenceDate, { forwardDate: true })[0];
  if (!result) return null;

  return startOfDay(result.start.date());
};

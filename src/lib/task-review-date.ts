import { casual } from "chrono-node";
import { startOfDay } from "date-fns";

import { nextTaskReviewDate, parseTaskReviewPeriod } from "./task-review-period";

/** Relative durations preserve time; named dates return at local midnight. */
export function parseTaskReviewDate(input: string, now = new Date()): Date | null {
  const query = input.trim();
  if (query.toLowerCase() === "now") return new Date(now);
  const period = parseTaskReviewPeriod(query, now);
  let date: Date;
  if (period) {
    date = nextTaskReviewDate(period, now);
  } else {
    const result = casual.parse(query, now, { forwardDate: true })[0];
    if (!result || result.index !== 0 || result.text.length !== query.length) return null;
    date = result.start.isCertain("hour") ? result.start.date() : startOfDay(result.start.date());
  }
  return Number.isFinite(date.getTime()) && date > now ? date : null;
}

export type TaskReviewPeriod = {
  amount: number;
  unit: "minute" | "hour" | "day" | "week" | "month" | "year";
  dayOfMonth: number;
  monthOfYear: number;
};

const units: Record<string, TaskReviewPeriod["unit"]> = {
  m: "minute", min: "minute", mins: "minute", minute: "minute", minutes: "minute",
  h: "hour", hr: "hour", hrs: "hour", hour: "hour", hours: "hour",
  d: "day", day: "day", days: "day", w: "week", wk: "week", wks: "week", week: "week", weeks: "week",
  mo: "month", month: "month", months: "month", y: "year", yr: "year", yrs: "year", year: "year", years: "year",
};

export function parseTaskReviewPeriod(input: string, now = new Date()): TaskReviewPeriod | null {
  const query = input.trim().toLowerCase().replace(/^next\s+/, "1 ");
  const match = query.match(/^(?:in\s+)?(\d+|a|an|one)\s*([a-z]+)$/);
  if (!match) return null;
  const amount = /^(a|an|one)$/.test(match[1]) ? 1 : Number(match[1]);
  const unit = Object.hasOwn(units, match[2]) ? units[match[2]] : undefined;
  if (!unit || !Number.isSafeInteger(amount) || amount <= 0) return null;
  return { amount, unit, dayOfMonth: now.getDate(), monthOfYear: now.getMonth() };
}

export function readTaskReviewPeriod(value: string | undefined): TaskReviewPeriod | undefined {
  if (!value) return undefined;
  try {
    const period = JSON.parse(value) as TaskReviewPeriod | null;
    if (!period || !Number.isSafeInteger(period.amount) || period.amount <= 0
      || !Object.values(units).includes(period.unit)
      || !Number.isInteger(period.dayOfMonth) || period.dayOfMonth < 1 || period.dayOfMonth > 31
      || !Number.isInteger(period.monthOfYear) || period.monthOfYear < 0 || period.monthOfYear > 11) return undefined;
    return period;
  } catch { return undefined; }
}

/** Calendar periods preserve their units; month/year anchors survive shorter months. */
export function nextTaskReviewDate(period: TaskReviewPeriod, now: Date): Date {
  const { amount, unit } = period;
  if (unit === "minute" || unit === "hour") {
    return new Date(now.getTime() + amount * (unit === "hour" ? 3_600_000 : 60_000));
  }
  const date = new Date(now);
  if (unit === "day" || unit === "week") {
    date.setDate(date.getDate() + amount * (unit === "week" ? 7 : 1));
    return date;
  }
  // Set day 1 before changing months so JavaScript cannot overflow into the following month.
  if (unit === "year") date.setFullYear(date.getFullYear() + amount, period.monthOfYear, 1);
  else date.setMonth(date.getMonth() + amount, 1);
  if (!Number.isFinite(date.getTime())) return date;
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(period.dayOfMonth, lastDay));
  return date;
}

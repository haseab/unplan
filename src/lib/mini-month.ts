import { addDays, differenceInCalendarDays, endOfMonth, startOfMonth } from "date-fns";
import { startOfCalendarWeek } from "./calendar-utils";

export function miniMonthDays(month: Date): Date[] {
  const start = startOfCalendarWeek(startOfMonth(month));
  const daysThroughMonthEnd = differenceInCalendarDays(endOfMonth(month), start) + 1;
  const cellCount = Math.max(35, Math.ceil(daysThroughMonthEnd / 7) * 7);
  return Array.from({ length: cellCount }, (_, index) => addDays(start, index));
}

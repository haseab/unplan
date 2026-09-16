import type { CalendarEvent } from "./calendar-types";

export type FollowUpRule =
  | { kind: "interval"; amount: number; unit: "minute" | "hour" | "day" | "week" | "month" | "year" }
  | { kind: "weekday"; day: number }
  | { kind: "month-day"; day: number | "last" }
  | { kind: "month-weekday"; week: number | "last"; day: number };
export type FollowUp = {
  id: string;
  event: CalendarEvent;
  input: string;
  rule: FollowUpRule;
  nextDue: string;
};
export const FOLLOW_UPS_STORAGE_KEY = "unplan:follow-ups:v1";
const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const ordinals = ["first", "second", "third", "fourth"];

/** Deliberately rejects unrecognized qualifiers rather than silently dropping them. */
export function parseFollowUpRule(input: string): FollowUpRule | null {
  // Preserve case for the only ambiguous unit: m = minutes, M = months.
  const expanded = input.replace(/\b(\d+)\s*([mMhHdDwWyY])\b/g, (_, amount: string, unit: string) => {
    const units: Record<string, string> = { m: "minute", M: "month", h: "hour", d: "day", w: "week", y: "year" };
    return `${amount} ${units[unit] ?? units[unit.toLowerCase()]}`;
  });
  const text = expanded.toLowerCase().trim().replace(/\s+/g, " ")
    .replace(/(\d)(?=mins?\b)/g, "$1 ").replace(/\bmins?\b/g, "minute")
    .replace(/\beach\b/g, "every").replace(/\bthe\s+/g, "")
    .replace(/\bone\b/g, "1").replace(/\btwo\b/g, "2").replace(/\bthree\b/g, "3")
    .replace(/\bfour\b/g, "4").replace(/\bfive\b/g, "5").replace(/\bseven\b/g, "7");
  const alias: Record<string, string> = { daily: "1 day", weekly: "1 week", monthly: "1 month", yearly: "1 year", annually: "1 year", fortnightly: "2 weeks" };
  const interval = (alias[text] ?? text).match(/^(?:every |in )?(?:(\d+) |(a|an|other) )?(minute|hour|day|week|month|year)s?$/);
  if (interval) {
    const amount = Number(interval[1] ?? (interval[2] === "other" ? 2 : 1));
    if (Number.isSafeInteger(amount) && amount > 0 && amount <= 1000) {
      return { kind: "interval", amount, unit: interval[3] as "minute" | "hour" | "day" | "week" | "month" | "year" };
    }
    return null;
  }
  if (/^last day of (?:every )?week$/.test(text)) return { kind: "weekday", day: 0 };
  const weekday = text.match(/^(?:every |on )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?$/);
  if (weekday) return { kind: "weekday", day: weekdays.indexOf(weekday[1]) };
  if (/^last day of (?:every )?month$/.test(text)) return { kind: "month-day", day: "last" };
  const monthDay = text.match(/^(first|\d+(?:st|nd|rd|th)?)(?: day)? of (?:every )?month$/);
  if (monthDay) {
    const day = monthDay[1] === "first" ? 1 : parseInt(monthDay[1]);
    return day >= 1 && day <= 31 ? { kind: "month-day", day } : null;
  }
  const week = text.match(/^(first|second|third|fourth) week of (?:every )?month$/);
  if (week) return { kind: "month-day", day: ordinals.indexOf(week[1]) * 7 + 1 };
  const monthWeekday = text.match(/^(first|second|third|fourth|last) (sunday|monday|tuesday|wednesday|thursday|friday|saturday) of (?:every )?month$/);
  if (monthWeekday) return {
    kind: "month-weekday", week: monthWeekday[1] === "last" ? "last" : ordinals.indexOf(monthWeekday[1]) + 1,
    day: weekdays.indexOf(monthWeekday[2]),
  };
  return null;
}

export function describeFollowUpRule(rule: FollowUpRule): string {
  if (rule.kind === "interval") return `Every ${rule.amount} ${rule.unit}${rule.amount === 1 ? "" : "s"}`;
  if (rule.kind === "weekday") return `Every ${weekdays[rule.day][0].toUpperCase()}${weekdays[rule.day].slice(1)}`;
  if (rule.kind === "month-day") return rule.day === "last" ? "Last day of every month" : `Day ${rule.day} of every month (or its last day)`;
  return `${rule.week === "last" ? "Last" : ordinals[rule.week - 1]} ${weekdays[rule.day]} of every month`;
}

/** Calendar rules fire at local midnight; intervals preserve local wall-clock time across DST. */
export function nextFollowUpDate(rule: FollowUpRule, after: Date): Date {
  const next = new Date(after);
  if (rule.kind === "interval") {
    if (rule.unit === "minute" || rule.unit === "hour") {
      next.setTime(next.getTime() + rule.amount * (rule.unit === "hour" ? 3_600_000 : 60_000));
      return next;
    }
    if (rule.unit === "day" || rule.unit === "week") next.setDate(next.getDate() + rule.amount * (rule.unit === "week" ? 7 : 1));
    else {
      const day = next.getDate();
      next.setDate(1);
      next.setMonth(next.getMonth() + rule.amount * (rule.unit === "year" ? 12 : 1));
      const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(day, last));
    }
    return next;
  }
  next.setHours(0, 0, 0, 0);
  if (rule.kind === "weekday") {
    next.setDate(next.getDate() + ((rule.day - next.getDay() + 7) % 7));
    if (next <= after) next.setDate(next.getDate() + 7);
    return next;
  }
  const inMonth = (offset: number) => {
    const date = new Date(after.getFullYear(), after.getMonth() + offset, 1);
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    if (rule.kind === "month-day") date.setDate(rule.day === "last" ? last : Math.min(rule.day, last));
    else if (rule.week === "last") {
      date.setDate(last);
      date.setDate(last - ((date.getDay() - rule.day + 7) % 7));
    } else date.setDate(1 + ((rule.day - date.getDay() + 7) % 7) + (rule.week - 1) * 7);
    return date;
  };
  const current = inMonth(0);
  return current > after ? current : inMonth(1);
}

export function parseFollowUps(value: string | null): FollowUp[] {
  try {
    const items: unknown = JSON.parse(value ?? "[]");
    if (!Array.isArray(items)) return [];
    return items.flatMap((item) => {
      if (!item || typeof item.id !== "string" || typeof item.input !== "string" || !Number.isFinite(Date.parse(item.nextDue))) return [];
      let rule = parseFollowUpRule(item.input);
      // Older saved uppercase-M schedules meant minutes. Keep their saved meaning.
      if (rule && /\b\d+\s*M\b/.test(item.input)
        && item.rule?.kind === "interval" && item.rule.unit === "minute"
        && item.rule.amount === (rule.kind === "interval" ? rule.amount : null)) {
        rule = { ...rule, kind: "interval", amount: item.rule.amount, unit: "minute" };
      }
      const event = item.event;
      if (!rule || !event || typeof event.id !== "string" || typeof event.calendarId !== "string" || typeof event.title !== "string"
        || !Number.isFinite(Date.parse(event.start)) || !Number.isFinite(Date.parse(event.end))
        || !["google", "demo"].includes(event.provider)) return [];
      return [{ id: item.id, input: item.input, nextDue: item.nextDue, event, rule }];
    });
  } catch { return []; }
}

export function followUpEventAtPresent(source: CalendarEvent, now: Date, id: string): CalendarEvent {
  const start = new Date(now);
  start.setMinutes(Math.floor(start.getMinutes() / 15) * 15, 0, 0);
  const duration = source.allDay ? 30 * 60_000 : Math.max(15 * 60_000, Date.parse(source.end) - Date.parse(source.start));
  // A follow-up is a personal time block, not another invitation or recurring series.
  return {
    id, calendarId: source.calendarId, title: source.title, description: source.description,
    location: source.location, calendarColor: source.calendarColor, color: source.color,
    colorId: source.colorId, customColor: source.customColor, textColor: source.textColor,
    provider: source.provider, start: start.toISOString(), end: new Date(start.getTime() + duration).toISOString(),
  };
}

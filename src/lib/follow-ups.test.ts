import assert from "node:assert/strict";
import test from "node:test";
import { describeFollowUpRule, followUpEventAtPresent, nextFollowUpDate, parseFollowUpRule, parseFollowUps } from "./follow-ups";
import type { CalendarEvent } from "./calendar-types";

const date = (year: number, month: number, day: number, hour = 12, minute = 0) => new Date(year, month - 1, day, hour, minute);
const next = (input: string, from: Date) => {
  const rule = parseFollowUpRule(input);
  assert.ok(rule, input);
  return nextFollowUpDate(rule, from);
};

test("default and natural-language examples resolve to explicit recurring rules", () => {
  assert.deepEqual(parseFollowUpRule("3 days"), { kind: "interval", amount: 3, unit: "day" });
  assert.equal(next("every 4 days", date(2026, 9, 16)).getDate(), 20);
  assert.deepEqual(next("first week of every month", date(2026, 9, 16)), date(2026, 10, 1, 0));
  assert.deepEqual(next("last day of the month", date(2026, 9, 16)), date(2026, 9, 30, 0));
  assert.deepEqual(next("last day of each week", date(2026, 9, 16)), date(2026, 9, 20, 0));
  assert.equal(describeFollowUpRule(parseFollowUpRule("last day of each week")!), "Every Sunday");
});

test("skip advances from resolution time and never leaves an overdue backlog", () => {
  assert.deepEqual(next("3 days", date(2026, 10, 20)), date(2026, 10, 23));
  assert.deepEqual(next("every Monday", date(2026, 9, 21, 0)), date(2026, 9, 28, 0));
  assert.deepEqual(next("last day of the month", date(2026, 9, 30, 0)), date(2026, 10, 31, 0));
});

test("month intervals clamp at month end and respect leap years", () => {
  assert.deepEqual(next("every month", date(2028, 1, 31)), date(2028, 2, 29));
  assert.deepEqual(next("every year", date(2028, 2, 29)), date(2029, 2, 28));
  assert.deepEqual(next("31st of every month", date(2026, 1, 31)), date(2026, 2, 28, 0));
});

test("ordinal weekdays and human interval aliases", () => {
  assert.deepEqual(next("last Friday of every month", date(2026, 9, 16)), date(2026, 9, 25, 0));
  assert.deepEqual(next("second Monday of each month", date(2026, 9, 16)), date(2026, 10, 12, 0));
  assert.deepEqual(next("every other week", date(2026, 9, 16)), date(2026, 9, 30));
  assert.deepEqual(next("every four days", date(2026, 9, 16)), date(2026, 9, 20));
});

test("rejects ambiguous, invalid and unsupported rules instead of misinterpreting them", () => {
  for (const input of ["", "0 days", "-2 days", "32nd of each month", "every Monday except holidays", "every 4 days at bananas", "sometimes", "99999999 years"]) assert.equal(parseFollowUpRule(input), null, input);
});

test("calendar days preserve local time across daylight saving transitions", () => {
  assert.deepEqual(next("3 days", date(2026, 3, 7, 9)), date(2026, 3, 10, 9));
  assert.deepEqual(next("3 days", date(2026, 10, 31, 9)), date(2026, 11, 3, 9));
});

const source: CalendarEvent = {
  id: "original", calendarId: "cal", title: "Follow up with Jane", start: date(2026, 9, 1, 9).toISOString(), end: date(2026, 9, 1, 10).toISOString(),
  provider: "demo", color: "red", calendarColor: "red", attendees: [{ email: "jane@example.com" }], recurrence: ["RRULE:FREQ=WEEKLY"], providerEventId: "old", recurringEventId: "series",
};

test("schedule copies at latest quarter hour without altering source or copying invitation/series", () => {
  const event = followUpEventAtPresent(source, date(2026, 9, 16, 10, 37), "new");
  assert.deepEqual(new Date(event.start), date(2026, 9, 16, 10, 30));
  assert.deepEqual(new Date(event.end), date(2026, 9, 16, 11, 30));
  assert.equal(event.providerEventId, undefined);
  assert.equal(event.attendees, undefined);
  assert.equal(event.recurrence, undefined);
  assert.equal(event.recurringEventId, undefined);
  assert.equal(source.id, "original");
  assert.deepEqual(new Date(source.start), date(2026, 9, 1, 9));
  const allDay = followUpEventAtPresent({ ...source, allDay: true }, date(2026, 9, 16, 10, 37), "new");
  assert.equal(Date.parse(allDay.end) - Date.parse(allDay.start), 30 * 60_000);
});

test("stored follow-ups survive round trip; malformed records cannot crash the queue", () => {
  const record = { id: "1", event: source, input: "3 days", rule: parseFollowUpRule("3 days"), nextDue: date(2026, 9, 19).toISOString() };
  assert.deepEqual(parseFollowUps(JSON.stringify([record])), [record]);
  assert.deepEqual(parseFollowUps("not json"), []);
  assert.deepEqual(parseFollowUps(JSON.stringify([null, {}, { ...record, input: "nonsense" }, { ...record, nextDue: "invalid" }, record])), [record]);
});


test("minute abbreviations parse, preview, and trigger like full minute schedules", () => {
  for (const input of ["1 min", "1 mins", "1min", "every 1 min", "every min", "1 MIN", "1m", "1 m", "every 1m"]) {
    const rule = parseFollowUpRule(input);
    assert.deepEqual(rule, { kind: "interval", amount: 1, unit: "minute" }, input);
    assert.equal(describeFollowUpRule(rule!), "Every 1 minute");
    assert.deepEqual(next(input, date(2026, 9, 16, 12, 0)), date(2026, 9, 16, 12, 1));
  }
  assert.deepEqual(next("every 5 mins", date(2026, 9, 16, 12, 0)), date(2026, 9, 16, 12, 5));
  assert.deepEqual(next("5m", date(2026, 9, 16, 12, 0)), date(2026, 9, 16, 12, 5));
  assert.equal(parseFollowUpRule("0m"), null);
  assert.equal(parseFollowUpRule("1month"), null);
  assert.deepEqual(parseFollowUpRule("1 month"), { kind: "interval", amount: 1, unit: "month" });
  assert.equal(parseFollowUpRule("0 min"), null);
  assert.equal(parseFollowUpRule("1 min except weekends"), null);
});


test("compact interval units distinguish minutes and months and accept other units in either case", () => {
  const from = date(2026, 9, 16, 12);
  for (const [input, expanded] of [
    ["1h", "1 hour"], ["2h", "2 hours"], ["1H", "1 hour"],
    ["1M", "1 month"], ["2 M", "2 months"], ["1m", "1 minute"],
    ["3D", "3 days"], ["3d", "3 days"], ["2w", "2 weeks"],
    ["2W", "2 weeks"], ["1y", "1 year"], ["1Y", "1 year"],
    ["every 2h", "every 2 hours"],
  ]) {
    assert.deepEqual(parseFollowUpRule(input), parseFollowUpRule(expanded), input);
    assert.deepEqual(next(input, from), next(expanded, from), input);
  }
  for (const input of ["0h", "-1h", "1.5h", "1h30m", "2D except Mondays"]) assert.equal(parseFollowUpRule(input), null, input);
});

test("existing uppercase-M minute schedules keep their saved meaning", () => {
  const record = { id: "legacy", event: source, input: "1M", rule: { kind: "interval", amount: 1, unit: "minute" }, nextDue: date(2026, 9, 19).toISOString() };
  assert.deepEqual(parseFollowUps(JSON.stringify([record])), [record]);
  const monthly = { ...record, rule: { kind: "interval", amount: 1, unit: "month" } };
  assert.deepEqual(parseFollowUps(JSON.stringify([monthly])), [monthly]);
});

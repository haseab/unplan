/** Month-end midnight in a stored IANA time zone, independent of the server's time zone. */
export function zonedMonthEnd(now: Date, timeZone: string): Date {
  const format = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" });
  const parts = (date: Date) => Object.fromEntries(format.formatToParts(date).filter(({ type }) => type !== "literal").map(({ type, value }) => [type, Number(value)]));
  const local = parts(now);
  const lastDay = new Date(Date.UTC(local.year, local.month, 0)).getUTCDate();
  const target = local.day >= lastDay ? new Date(Date.UTC(local.year, local.month - 1, lastDay)) : new Date(Date.UTC(local.year, local.month - 1, 0));
  const midnight = target.getTime();
  let result = midnight;
  for (let index = 0; index < 3; index++) {
    const p = parts(new Date(result));
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    result = midnight - (represented - result);
  }
  return new Date(result);
}

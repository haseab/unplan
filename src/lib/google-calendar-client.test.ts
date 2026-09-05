import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent, CalendarSource } from "./calendar-types";
import {
  mergeGoogleEventsAfterPartialSync,
  mergeGoogleEventsForRange,
  reconcileImportedGoogleCalendars,
  reconcileImportedGoogleVisibility,
  retainEventsForFailedGoogleAccounts,
} from "./google-calendar-client";
import { createGoogleCalendarSourceId } from "./google-source-id";

const calendar = (
  accountId: string,
  providerCalendarId: string,
  selected = true,
): CalendarSource => ({
  accountId,
  backgroundColor: "#4666e5",
  foregroundColor: "#ffffff",
  id: createGoogleCalendarSourceId(accountId, providerCalendarId),
  name: providerCalendarId,
  provider: "google",
  providerCalendarId,
  selected,
});

test("partial event syncs keep the last known events from failed accounts", () => {
  const failedCalendar = calendar("failed-account", "personal");
  const healthyCalendar = calendar("healthy-account", "work");
  const refreshedHealthyEvent = event("healthy-event", healthyCalendar);
  const retainedFailedEvent = event("failed-event", failedCalendar);

  assert.deepEqual(
    mergeGoogleEventsAfterPartialSync(
      [retainedFailedEvent, event("stale-healthy-event", healthyCalendar)],
      [refreshedHealthyEvent],
      new Set(["failed-account"]),
    ).map(({ id }) => id),
    ["healthy-event", "failed-event"],
  );
});

test("range loads replace only events overlapping the loaded slice", () => {
  const healthyCalendar = calendar("healthy-account", "work");
  const inside = {
    ...event("inside", healthyCalendar),
    end: "2026-09-11T10:00:00.000Z",
    start: "2026-09-11T09:00:00.000Z",
  };
  const outside = {
    ...event("outside", healthyCalendar),
    end: "2026-09-03T10:00:00.000Z",
    start: "2026-09-03T09:00:00.000Z",
  };
  const replacement = { ...inside, title: "Updated" };

  assert.deepEqual(
    mergeGoogleEventsForRange(
      [inside, outside],
      [replacement],
      new Set(),
      new Set([healthyCalendar.id]),
      new Date("2026-09-08T00:00:00.000Z").getTime(),
      new Date("2026-09-15T00:00:00.000Z").getTime(),
    ).map(({ id, title }) => ({ id, title })),
    [
      { id: "inside", title: "Updated" },
      { id: "outside", title: "outside" },
    ],
  );
});

test("range loads preserve stale slice events for a failed account", () => {
  const failedCalendar = calendar("failed-account", "personal");
  const stale = {
    ...event("stale", failedCalendar),
    end: "2026-09-11T10:00:00.000Z",
    start: "2026-09-11T09:00:00.000Z",
  };

  assert.deepEqual(
    mergeGoogleEventsForRange(
      [stale],
      [],
      new Set(["failed-account"]),
      new Set([failedCalendar.id]),
      new Date("2026-09-08T00:00:00.000Z").getTime(),
      new Date("2026-09-15T00:00:00.000Z").getTime(),
    ).map(({ id }) => id),
    ["stale"],
  );
});

const event = (id: string, source: CalendarSource): CalendarEvent => ({
  calendarColor: source.backgroundColor,
  calendarId: source.id,
  color: source.backgroundColor,
  end: "2026-08-22T18:00:00.000Z",
  id,
  provider: "google",
  start: "2026-08-22T17:00:00.000Z",
  title: id,
});

test("partial calendar imports preserve only resources from failed accounts", () => {
  const failedCalendar = calendar("failed-account", "personal");
  const staleHealthyCalendar = calendar("healthy-account", "old");
  const importedCalendar = calendar("healthy-account", "new", false);
  const failedAccountIds = new Set(["failed-account"]);

  assert.deepEqual(
    reconcileImportedGoogleCalendars(
      [failedCalendar, staleHealthyCalendar],
      [importedCalendar],
      failedAccountIds,
    ).map(({ id }) => id),
    [importedCalendar.id, failedCalendar.id],
  );
  assert.deepEqual(
    [...reconcileImportedGoogleVisibility(
      new Set([failedCalendar.id, staleHealthyCalendar.id]),
      [importedCalendar],
      failedAccountIds,
    )],
    [failedCalendar.id],
  );
  assert.deepEqual(
    retainEventsForFailedGoogleAccounts(
      [event("failed-event", failedCalendar), event("stale-event", staleHealthyCalendar)],
      failedAccountIds,
    ).map(({ id }) => id),
    ["failed-event"],
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent, CalendarSource } from "./calendar-types";
import {
  mergeGoogleEventsAfterPartialSync,
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

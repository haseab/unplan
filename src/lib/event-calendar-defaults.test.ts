import test from 'node:test';
import assert from 'node:assert/strict';
import { eventCalendarForStart, resolveEventCalendar } from './event-calendar-defaults';

import type { CalendarSource } from './calendar-types';

const calendar = (id: string, writable = true): CalendarSource => ({ id, name: id, provider: 'demo', writable, backgroundColor: '#123456', foregroundColor: '#ffffff' });
const past = calendar('past');
const future = calendar('future');
const now = new Date('2026-01-02T12:00:00Z');

test('new events use the start instant, including earlier today and the exact now boundary', () => {
  assert.equal(eventCalendarForStart(new Date('2026-01-02T11:59:59Z'), past, future, now), past);
  assert.equal(eventCalendarForStart(now, past, future, now), future);
  assert.equal(eventCalendarForStart(new Date('2026-01-03T00:00:00Z'), past, future, now), future);
  assert.equal(eventCalendarForStart(new Date('2026-01-02T07:00:00-05:00'), past, future, now), future);
});

test('defaults preserve valid choices and fall back when a calendar disappears or becomes read-only', () => {
  const readonly = calendar('readonly', false);
  const calendars = [readonly, past, future];
  assert.equal(resolveEventCalendar(calendars, 'future'), future);
  assert.equal(resolveEventCalendar(calendars, 'missing'), past);
  assert.equal(resolveEventCalendar(calendars, 'readonly'), past);
  assert.equal(resolveEventCalendar(calendars, null), past);
  assert.equal(resolveEventCalendar([readonly], 'readonly'), null);
  assert.equal(resolveEventCalendar([], null), null);
});

// Run against `npm run dev`. Provider API traffic is mocked.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
try {
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles' });
  context.setDefaultTimeout(15000);
  await context.addInitScript(() => {
    localStorage.setItem('unplan:google-accounts:v1', JSON.stringify([
      { id: 'selection-test', email: 'selection@example.test', accessToken: 'mock', expiresAt: Date.now() + 3600000 },
    ]));
  });
  const calendar = { id: 'google|selection-test|primary', accountId: 'selection-test', name: 'Selection Test', backgroundColor: '#4666e5', foregroundColor: '#fff', primary: true, selected: true, writable: true, provider: 'google', providerCalendarId: 'primary' };
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const allDay = { id: `${calendar.id}:all-day`, providerEventId: 'all-day', calendarId: calendar.id, title: 'All-day selection test', start: start.toISOString(), end: end.toISOString(), allDay: true, calendarColor: '#4666e5', color: '#4666e5', provider: 'google' };
  const timedStart = new Date(start);
  timedStart.setHours(12);
  const timed = { ...allDay, id: `${calendar.id}:timed`, providerEventId: 'timed', title: 'Timed selection test', start: timedStart.toISOString(), end: new Date(+timedStart + 3600000).toISOString(), allDay: false };
  await context.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/google/calendars') return route.fulfill({ json: { calendars: [calendar] } });
    if (path === '/api/google/events') return route.fulfill({ json: { events: [allDay, timed], errors: [] } });
    return route.fulfill({ json: {} });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.UNPLAN_TEST_URL || 'http://localhost:3004');

  const allDayButton = page.locator('.all-day-event').filter({ hasText: allDay.title }).first();
  await allDayButton.click();
  await page.locator('.event-details').waitFor();
  await page.locator('.calendar-event').filter({ hasText: timed.title }).first().click({ modifiers: ['Shift'] });
  const rows = page.locator('.multi-event-selection-row');
  await page.locator('.multi-event-overview').filter({ hasText: '2 events selected' }).waitFor();
  assert.equal(await rows.count(), 2);
  const dayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' }).format(start);
  assert.equal(await rows.filter({ hasText: allDay.title }).locator('small').textContent(), `${dayLabel} · All day`);
  assert.equal(await rows.filter({ hasText: timed.title }).locator('small').textContent(), `${dayLabel} · 12:00 PM`);
  await page.getByRole('button', { name: `Remove ${timed.title} from selection`, exact: true }).click();
  await page.locator('.event-details').waitFor();
  assert.deepEqual(errors, []);
  console.log('[TEST:ALL-DAY-SELECTION] PASS single selection, mixed selection date labels, deselection, and no runtime errors');
} finally {
  await browser.close();
}

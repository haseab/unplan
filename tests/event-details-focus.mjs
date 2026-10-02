// Run against `npm run dev`. All Google/Todoist API traffic is mocked.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const context = await browser.newContext({ timezoneId: 'America/Los_Angeles' });
context.setDefaultTimeout(15000);
const baseURL = process.env.UNPLAN_TEST_URL || 'http://localhost:3004';
await context.addInitScript(() => {
  localStorage.setItem('unplan_undo_toast_duration', '10000');
  if (!localStorage.getItem('unplan:google-accounts:v1')) localStorage.setItem('unplan:google-accounts:v1', JSON.stringify([{ id: 'notes-test', email: 'notes@example.test', accessToken: 'mock', expiresAt: Date.now() + 3600000 }]));
});
const calendar = { id: 'google|notes-test|primary', accountId: 'notes-test', name: 'Notes Test', backgroundColor: '#4666e5', foregroundColor: '#fff', primary: true, selected: true, writable: true, provider: 'google', providerCalendarId: 'primary' };
const otherCalendar = { ...calendar, id: 'google|notes-test|other', providerCalendarId: 'other', primary: false, name: 'Other Calendar' };
const now = new Date(); now.setHours(12, 0, 0, 0);
let remote = '<p>Original notes</p>';
const event = { id: `${calendar.id}:test-event`, providerEventId: 'test-event', calendarId: calendar.id, title: 'Notes sync test', start: now.toISOString(), end: new Date(+now + 3600000).toISOString(), calendarColor: '#4666e5', color: '#4666e5', provider: 'google' };
await context.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/debug-log') return route.fulfill({ json: {} });
  if (path === '/api/google/calendars') return route.fulfill({ json: { calendars: [calendar, otherCalendar] } });
  if (path === '/api/google/events/description') {
    remote = route.request().postDataJSON().local;
    return route.fulfill({ json: { description: remote } });
  }
  if (path === '/api/google/events') {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      assert.equal(Object.hasOwn(body, 'description'), false, 'ordinary updates must not write notes');
      if (body.sourceCalendarSourceId && body.sourceCalendarSourceId !== body.calendarSourceId) {
        event.calendarId = body.calendarSourceId; event.id = `${body.calendarSourceId}:test-event`;
        return route.fulfill({ headers: { 'x-unplan-event-moved': 'true' }, json: { id: 'test-event' } });
      }
      return route.fulfill({ json: { id: 'test-event' } });
    }
    return route.fulfill({ json: { events: [{ ...event, description: remote }, { ...event, id: 'neighbor', providerEventId: 'neighbor', title: 'Next event', start: new Date(+now + 7200000).toISOString(), end: new Date(+now + 10800000).toISOString() }], errors: [] } });
  }
  return route.fulfill({ json: {} });
});
const page = await context.newPage();
const poll = async (fn, message, timeout = 20000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(message);
};
const select = async (target = page) => {
  await target.locator('.calendar-event').filter({ hasText: 'Notes sync test' }).first().click();
  await target.getByRole('textbox', { name: 'Notes', exact: true }).waitFor();
};
try {
  await page.goto(baseURL);
  await select();
  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('Edited description');
  await page.keyboard.press('Meta+Enter');
  await poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.calendar-event'))), 'description submit did not return focus');
  await page.keyboard.press('ArrowDown');
  await poll(() => page.evaluate(() => document.activeElement?.textContent?.includes('Next event')), 'description arrow navigation did not resume');
  await select();
  console.log('[TEST:EVENT-EDIT-FOCUS] PASS description submit and arrow navigation');
  await page.locator('.event-details .calendar-picker-trigger').click();
  await page.locator('.calendar-picker-search-input').fill('Other Calendar');
  await page.keyboard.press('Meta+Enter');
  await poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.calendar-event'))), 'calendar submit did not return focus', 2500);
  await page.keyboard.press('ArrowDown');
  await poll(() => page.evaluate(() => document.activeElement?.textContent?.includes('Next event')), 'arrow navigation did not resume');
  await select();
  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('Notes after calendar change');
  await page.keyboard.press('Meta+Enter');
  await poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.calendar-event'))), 'notes after calendar change did not return focus');
  await page.keyboard.press('ArrowDown');
  await poll(() => page.evaluate(() => document.activeElement?.textContent?.includes('Next event')), 'navigation after calendar and notes edits did not resume');
  console.log('[TEST:EVENT-EDIT-FOCUS] PASS calendar choice, subsequent notes edit, and arrow navigation');
} finally { await browser.close(); }

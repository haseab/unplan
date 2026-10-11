import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles' });
  await context.addInitScript(() => {
    localStorage.setItem('unplan_undo_toast_duration', '0');
    localStorage.setItem('unplan:google-accounts:v1', JSON.stringify([{ id: 'date-test', email: 'date@example.test', accessToken: 'mock', expiresAt: Date.now() + 3600000 }]));
  });
  const calendar = { id: 'google|date-test|primary', accountId: 'date-test', name: 'Date Test', backgroundColor: '#4666e5', foregroundColor: '#fff', selected: true, writable: true, provider: 'google', providerCalendarId: 'primary' };
  const now = new Date(); now.setHours(12, 30, 0, 0);
  const event = { id: `${calendar.id}:test`, providerEventId: 'test', calendarId: calendar.id, title: 'Date editor test', start: now.toISOString(), end: new Date(+now + 75 * 60000).toISOString(), calendarColor: '#4666e5', color: '#4666e5', provider: 'google' };
  let update;
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/google/calendars') return route.fulfill({ json: { calendars: [calendar] } });
    if (url.pathname === '/api/google/events') {
      if (route.request().method() === 'PATCH') { update = route.request().postDataJSON(); return route.fulfill({ json: { id: 'test' } }); }
      return route.fulfill({ json: { events: [event], errors: [] } });
    }
    return route.fulfill({ json: {} });
  });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.UNPLAN_TEST_URL || 'http://localhost:3004');
  await page.locator('.calendar-event').filter({ hasText: event.title }).first().click();
  await page.getByRole('button', { name: 'Edit date and time', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Set event day', exact: true });
  await field.fill('tomorrow');
  await page.locator('.event-date-feedback').filter({ hasText: 'Move to' }).waitFor();
  await page.locator('.event-date-editor').screenshot({ path: '/tmp/unplan-event-date-editor.png' });
  await field.press('Enter');
  await page.locator('.calendar-workspace').focus();
  const deadline = Date.now() + 15000;
  while (!update && Date.now() < deadline) await page.waitForTimeout(100);
  assert.ok(update, 'date change saved');
  assert.equal(new Date(update.start).getHours(), new Date(event.start).getHours());
  assert.equal(+new Date(update.end) - +new Date(update.start), 75 * 60000);
  assert.equal(new Date(update.start).getDate(), new Date(+now + 86400000).getDate());
  assert.deepEqual(errors, []);
  console.log('PASS: natural-language event day, parsed preview, preserved time and duration, provider save');
} finally { await browser.close(); }

// Run against npm run dev. No real account data is read or changed.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
try {
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles' });
  context.setDefaultTimeout(15000);
  await context.addInitScript(() => {
    localStorage.setItem('unplan_undo_toast_duration', '0');
    localStorage.setItem('unplan:google-accounts:v1', JSON.stringify(['work', 'personal'].map(id => ({
      id, email: `${id}@example.test`, accessToken: `mock-${id}`, expiresAt: Date.now() + 3600000,
    }))));
  });
  const calendar = (accountId, name) => ({ id: `google|${accountId}|primary`, accountId, name,
    backgroundColor: '#714bb1', foregroundColor: '#fff', primary: true, selected: true,
    writable: true, provider: 'google', providerCalendarId: 'primary' });
  const source = calendar('work', 'Work Calendar');
  const destination = calendar('personal', 'Personal Calendar');
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const event = { id: `${source.id}:original`, providerEventId: 'original', calendarId: source.id,
    title: 'Cross account test', start: now.toISOString(), end: new Date(+now + 3600000).toISOString(),
    calendarColor: source.backgroundColor, color: source.backgroundColor, provider: 'google',
    description: 'Original notes', location: 'Office', reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] } };
  const calls = []; let copied, deleted = false;
  await context.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.pathname === '/api/google/calendars') return route.fulfill({ json: { calendars: [url.searchParams.get('accountId') === 'work' ? source : destination] } });
    if (url.pathname === '/api/google/events') {
      if (method === 'GET' && url.searchParams.has('eventId')) {
        assert.equal(request.headers().authorization, 'Bearer mock-work');
        calls.push('read-source');
        return route.fulfill({ json: { id: 'original', description: 'Latest remote notes', conferenceData: { conferenceId: 'existing-meet' }, extendedProperties: { private: { custom: 'preserved' } } } });
      }
      if (method === 'POST') {
        assert.equal(request.headers().authorization, 'Bearer mock-personal');
        copied = request.postDataJSON(); calls.push('create-destination');
        assert.equal(copied.calendarSourceId, destination.id);
        assert.notEqual(copied.eventId, 'original');
        assert.equal(copied.description, 'Latest remote notes');
        assert.equal(copied.location, 'Office');
        assert.deepEqual(copied.reminders, event.reminders);
        assert.equal(copied.transferFields.conferenceData.conferenceId, 'existing-meet');
        return route.fulfill({ json: { id: copied.eventId, htmlLink: 'https://calendar.google.com/new', hangoutLink: 'https://meet.google.com/existing-meet' } });
      }
      if (method === 'DELETE') {
        assert.equal(request.headers().authorization, 'Bearer mock-work');
        const body = request.postDataJSON(); assert.equal(body.eventId, 'original');
        assert.equal(body.calendarSourceId, source.id); assert.ok(copied);
        calls.push('delete-source'); deleted = true;
        return route.fulfill({ status: 204 });
      }
      if (method === 'PATCH') {
        assert.equal(request.headers().authorization, 'Bearer mock-personal');
        assert.equal(request.postDataJSON().eventId, copied.eventId);
        calls.push('edit-destination');
        return route.fulfill({ json: { id: copied.eventId } });
      }
      return route.fulfill({ json: { events: url.searchParams.getAll('sourceId').includes(source.id) && !deleted ? [event] : [], errors: [] } });
    }
    if (url.pathname === '/api/google/events/description') return route.fulfill({ json: { description: 'Original notes' } });
    return route.fulfill({ json: {} });
  });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const poll = async fn => {
    const end = Date.now() + 20000;
    while (Date.now() < end) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error('Calendar transfer did not finish');
  };
  await page.goto(process.env.UNPLAN_TEST_URL || 'http://localhost:3004');
  await page.locator('.calendar-event').filter({ hasText: event.title }).first().click();
  await page.locator('.event-editor-calendar-picker .calendar-picker-trigger').click();
  await page.getByRole('option', { name: 'Personal Calendar', exact: false }).click();
  await page.locator('.calendar-workspace').focus();
  await poll(() => deleted);
  assert.deepEqual(calls.slice(0, 3), ['read-source', 'create-destination', 'delete-source']);
  await page.locator('.calendar-event').filter({ hasText: event.title }).first().click();
  const title = page.getByRole('textbox', { name: 'Event title', exact: true });
  await title.fill('Moved event edited'); await title.press('Enter');
  await page.locator('.calendar-workspace').focus();
  await poll(() => calls.includes('edit-destination'));
  assert.deepEqual(errors, []);
  console.log('PASS: unified account picker, authenticated create/delete transfer, preserved metadata, and subsequent destination edits');
} finally { await browser.close(); }

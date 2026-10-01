// Run against npm run dev. Provider and linked-page traffic is mocked.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ timezoneId: 'America/Los_Angeles', viewport: { width: 1440, height: 1000 } });
context.setDefaultTimeout(15000);
await context.addInitScript(() => {
  localStorage.setItem('unplan_undo_toast_duration', '0');
  localStorage.setItem('unplan:google-accounts:v1', JSON.stringify([{ id: 'links-test', email: 'links@example.test', accessToken: 'mock', expiresAt: Date.now() + 3600000 }]));
});
const calendar = { id: 'google|links-test|primary', accountId: 'links-test', name: 'Links Test', backgroundColor: '#4666e5', foregroundColor: '#fff', primary: true, selected: true, writable: true, provider: 'google', providerCalendarId: 'primary' };
const now = new Date(); now.setHours(12, 0, 0, 0);
const event = { id: `${calendar.id}:test-event`, providerEventId: 'test-event', calendarId: calendar.id, title: 'Implement [the spec](https://example.test/spec) and https://example.test/reference', description: '<p>Notes: <a href="https://example.test/notes">Linked notes</a></p><p>https://example.test/plain</p>', start: now.toISOString(), end: new Date(+now + 3600000).toISOString(), calendarColor: '#4666e5', color: '#4666e5', provider: 'google' };
const updates = [], errors = [];
await context.route('https://example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Linked page</p>' }));
await context.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/google/calendars') return route.fulfill({ json: { calendars: [calendar] } });
  if (path === '/api/google/events') {
    if (route.request().method() === 'PATCH') { updates.push(route.request().postDataJSON()); return route.fulfill({ json: { id: 'test-event' } }); }
    return route.fulfill({ json: { events: [event], errors: [] } });
  }
  return route.fulfill({ json: {} });
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const openLink = async (link, url) => {
  const opened = page.waitForEvent('popup');
  await link.click();
  const popup = await opened;
  await popup.waitForURL(url);
  await popup.close();
};
try {
  await page.goto(process.env.UNPLAN_TEST_URL || 'http://localhost:3004');
  await page.locator('.calendar-event').filter({ hasText: 'Implement' }).first().click();
  const notes = page.getByRole('textbox', { name: 'Notes', exact: true });
  await notes.waitFor();
  // Notes open on an ordinary click while the editor remains editable.
  await openLink(notes.getByRole('link', { name: 'Linked notes' }), 'https://example.test/notes');
  const preview = page.locator('.event-title-link-preview');
  await preview.waitFor();
  await openLink(preview.getByRole('link', { name: 'the spec', exact: true }), 'https://example.test/spec');
  await openLink(preview.getByRole('link', { name: 'https://example.test/reference', exact: true }), 'https://example.test/reference');
  assert.equal(updates.length, 0, 'Opening links must not rename the event');
  await page.getByRole('button', { name: 'Edit event title', exact: true }).click();
  const title = page.getByRole('textbox', { name: 'Event title', exact: true });
  assert.equal(await title.inputValue(), event.title);
  await title.fill('Updated [the spec](https://example.test/spec)');
  await title.press('Enter');
  await preview.getByRole('link', { name: 'the spec', exact: true }).waitFor();
  assert.match(await preview.innerText(), /Updated the spec/);
  await page.screenshot({ path: '/tmp/unplan-event-links.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: notes links, Markdown title links, bare title URLs, link clicks without mutations, and title editing');
} finally { await browser.close(); }

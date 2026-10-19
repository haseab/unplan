// Run against `npm run dev`. Provider API traffic is mocked.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
try {
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles', viewport: { width: 1440, height: 1000 } });
  context.setDefaultTimeout(15000);
  await context.addInitScript(() => {
    localStorage.setItem('unplan:google-accounts:v1', JSON.stringify([
      { id: 'finder-test', email: 'finder@example.test', accessToken: 'mock', expiresAt: Date.now() + 3600000 },
    ]));
  });
  const calendar = { id: 'google|finder-test|primary', accountId: 'finder-test', name: 'Finder Test', backgroundColor: '#4666e5', foregroundColor: '#fff', primary: true, selected: true, writable: true, provider: 'google', providerCalendarId: 'primary' };
  const page = await context.newPage();
  const times = await page.evaluate(() => {
    const at = (hour, minute = 0) => {
      const date = new Date();
      date.setHours(hour, minute, 0, 0);
      return date.toISOString();
    };
    return { midnight: at(0), nextMidnight: at(24), starts: [12, 13, 14].map(hour => at(hour)), ends: [12, 13, 14].map(hour => at(hour, 30)) };
  });
  const makeEvent = (id, title, index, extra = {}) => ({
    id: `${calendar.id}:${id}`, providerEventId: id, calendarId: calendar.id, title,
    start: times.starts[index],
    end: times.ends[index],
    calendarColor: '#4666e5', color: '#4666e5', provider: 'google', ...extra,
  });
  const events = [
    makeEvent('all-day', 'Search birthday', 0, { allDay: true, start: times.midnight, end: times.nextMidnight }),
    makeEvent('first', 'Search planning', 0),
    makeEvent('second', 'Search review', 1),
    makeEvent('unmatched', 'Lunch break', 2),
  ];
  await context.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/google/calendars') return route.fulfill({ json: { calendars: [calendar] } });
    if (path === '/api/google/events') return route.fulfill({ json: { events, errors: [] } });
    return route.fulfill({ json: {} });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.UNPLAN_TEST_URL || 'http://localhost:3004');
  const block = title => page.locator('.calendar-event, .all-day-event').filter({ hasText: title }).first();
  await block('Search planning').click();
  const finder = page.getByRole('searchbox', { name: 'Find visible calendar events', exact: true });
  const expectResult = async (title, count) => {
    await page.locator('.visible-event-finder-count').filter({ hasText: count }).waitFor();
    await page.getByRole('textbox', { name: 'Event title', exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Event title', exact: true }).inputValue(), title);
    assert.equal(await finder.inputValue(), count === '1 of 1' ? 'planning' : 'search');
  };
  const openFind = async query => {
    await page.keyboard.press('Meta+f');
    await finder.fill(query);
  };

  await openFind('search');
  await expectResult('Search birthday', '1 of 3');
  await finder.press('Enter');
  await expectResult('Search planning', '2 of 3');
  await finder.press('Enter');
  await expectResult('Search review', '3 of 3');
  await finder.press('Enter');
  await expectResult('Search birthday', '1 of 3');
  await finder.press('Shift+Enter');
  await expectResult('Search review', '3 of 3');

  await block('Search planning').click();
  await expectResult('Search planning', '2 of 3');
  assert.equal(await finder.evaluate(element => document.activeElement === element), true);
  await page.keyboard.press('Enter');
  await expectResult('Search review', '3 of 3');
  await block('Search birthday').click();
  await expectResult('Search birthday', '1 of 3');
  await page.keyboard.press('Enter');
  await expectResult('Search planning', '2 of 3');
  assert.equal(await page.locator('.event-visible-find-match').count(), 3);

  await finder.fill('planning');
  await expectResult('Search planning', '1 of 1');
  await finder.press('Enter');
  await finder.press('Enter');
  await expectResult('Search planning', '1 of 1');

  await block('Lunch break').click();
  await finder.waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('textbox', { name: 'Event title', exact: true }).inputValue(), 'Lunch break');
  assert.equal(await page.locator('.event-visible-find-match').count(), 0);
  await openFind('planning');
  await expectResult('Search planning', '1 of 1');
  await block('Search birthday').click();
  await finder.waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('textbox', { name: 'Event title', exact: true }).inputValue(), 'Search birthday');
  assert.equal(await page.locator('.event-visible-find-match').count(), 0);
  assert.deepEqual(errors, []);
  console.log('[TEST:VISIBLE-EVENT-FINDER] PASS previews, Enter wraparound, reverse cycling, clicked-match cursor, single-result persistence, and unmatched timed/all-day dismissal');
} finally {
  await browser.close();
}

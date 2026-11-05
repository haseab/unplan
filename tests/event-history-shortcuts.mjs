// Run against npm run dev. Navigation and providers are mocked in isolated Chrome storage.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
let page;
const errors = [];
try {
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles' });
  await context.addInitScript(() => {
    localStorage.setItem('unplan:google-accounts:v1', JSON.stringify([{
      id: 'history-test', email: 'history@example.test', accessToken: 'mock',
      expiresAt: Date.now() + 86400000,
    }]));
    window.historyNavigations = [];
    window.open = (url, target, features) => {
      window.historyNavigations.push({ url, target, features });
      return null;
    };
  });
  const calendar = {
    id: 'google|history-test|primary', accountId: 'history-test', name: 'History Test',
    backgroundColor: '#4666e5', foregroundColor: '#fff', selected: true, writable: true,
    provider: 'google', providerCalendarId: 'primary',
  };
  const testNow = new Date();
  testNow.setHours(12, 0, 0, 0);
  const at = (hour, second = 0, millisecond = 0) => {
    const date = new Date(testNow);
    date.setHours(hour, 0, second, millisecond);
    return date.toISOString();
  };
  const events = [
    ['past', at(9, 15, 123), at(10, 30, 456)],
    ['ongoing', at(11), at(13)],
    ['future', at(14), at(15)],
  ].map(([id, start, end]) => ({
    id: `${calendar.id}:${id}`, providerEventId: id, calendarId: calendar.id,
    title: `History ${id}`, start, end, calendarColor: '#4666e5', color: '#4666e5', provider: 'google',
  }));
  await context.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/google/calendars') return route.fulfill({ json: { calendars: [calendar] } });
    if (path === '/api/google/events') return route.fulfill({ json: { events, errors: [] } });
    return route.fulfill({ json: {} });
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.UNPLAN_TEST_URL || 'http://localhost:3004');
  const eventBlock = id => page.locator(`[data-calendar-event-id="${calendar.id}:${id}"]`).first();
  const select = async id => { await eventBlock(id).click(); await page.locator('.calendar-workspace').focus(); };
  const navigations = () => page.evaluate(() => window.historyNavigations);
  // Synthetic events check native cancellation without invoking Chrome's print dialog.
  const press = options => page.evaluate(options => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'p', code: 'KeyP', ...options });
    document.activeElement.dispatchEvent(event);
    return event.defaultPrevented;
  }, options);

  await eventBlock('past').waitFor();
  // Let SSR hydrate against real time before fixing the clock for past/ongoing checks.
  await page.clock.setFixedTime(testNow);
  await page.locator('.calendar-workspace').focus();
  assert.equal(await press({ metaKey: true }), false, 'no selection leaves native keys alone');
  await select('past');
  await page.keyboard.press('Meta+p');
  await page.keyboard.press('Meta+Shift+p');
  assert.equal(await press({ key: 'π', altKey: true }), true, 'macOS Option+P is handled');
  const opened = await navigations();
  assert.equal(opened.length, 3);
  const history = new URL(opened[0].url);
  assert.equal(history.origin, 'https://deeplog.app');
  assert.equal(history.pathname, '/pendant');
  assert.equal(history.searchParams.get('q'), `${events[0].start} to ${events[0].end}`);
  assert.equal(opened[0].target, '_blank');
  assert.equal(opened[0].features, 'noopener,noreferrer');
  assert.equal(opened[1].url, `retracedev://timeline?t=${Date.parse(events[0].start)}`);
  assert.equal(opened[1].target, '_self');
  const deeplog = new URL(opened[2].url);
  assert.equal(deeplog.pathname, '/');
  assert.equal(deeplog.searchParams.get('from'), events[0].start);
  assert.equal(deeplog.searchParams.get('to'), events[0].end);
  assert.equal(opened[2].target, '_blank');
  assert.equal(await page.getByRole('heading', { name: /selected tasks/ }).count(), 0, 'Retrace does not open the folder picker');
  assert.equal(await press({ metaKey: true, repeat: true }), true, 'held shortcut stays consumed');
  assert.equal((await navigations()).length, 3, 'held shortcut does not open more tabs');

  for (const id of ['ongoing', 'future']) {
    await select(id);
    for (const options of [{ metaKey: true }, { metaKey: true, shiftKey: true }, { key: 'π', altKey: true }]) {
      assert.equal(await press(options), false, `${id} event has no history shortcut`);
    }
  }
  await select('past');
  await eventBlock('future').click({ modifiers: ['Meta'] });
  await page.locator('.calendar-workspace').focus();
  assert.equal(await press({ metaKey: true }), false, 'multiple events have no history shortcut');

  await select('past');
  await page.getByRole('textbox', { name: 'Go to a date', exact: true }).focus();
  assert.equal(await press({ metaKey: true }), false, 'text inputs keep native shortcuts');
  await page.getByRole('tab', { name: /Event Tasks/ }).click();
  assert.equal(await press({ altKey: true, key: 'π' }), false, 'task sidebar cannot use a stale event selection');
  await select('past');
  await page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }).click();
  await press({ metaKey: true });
  assert.equal((await navigations()).length, 3, 'dialogs block history navigation');
  await page.keyboard.press('Escape');
  await page.locator('.calendar-workspace').focus();
  await page.keyboard.press('Meta+Alt+Shift+p');
  await page.getByRole('heading', { name: '1 selected task', exact: true }).waitFor();
  assert.equal((await navigations()).length, 3, 'folder shortcut remains distinct');
  assert.deepEqual(errors, []);
  console.log('PASS: all three history shortcuts, exact timestamps, past-only guards, repeats, selection, editors, dialogs, sidebar focus and reassigned folder shortcut');
} catch (error) {
  console.error('[TEST:EVENT-HISTORY]', { errors, body: await page?.locator('body').innerText() });
  throw error;
} finally {
  await browser.close();
}

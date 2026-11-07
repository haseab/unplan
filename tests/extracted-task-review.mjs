// Provider requests are mocked; review actions never touch real tasks.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles', viewport: { width: 1280, height: 900 } });
  context.setDefaultTimeout(15000);
  await context.addInitScript(() => {
    localStorage.setItem('todoist_api_key', 'extraction-review-test');
    localStorage.setItem('todoist_project_id', 'inbox');
    localStorage.setItem('unplan_undo_toast_duration', '15000');
    localStorage.setItem('unplan:google-accounts:v2', JSON.stringify([
      { id: 'review-test', email: 'review@example.test', status: 'active' },
    ]));
  });
  const title = 'Host the “How to Set Good Goals” lecture for guest-house participants and portfolio members on October 28, 2026, about 15 minutes after 20:54 UTC.';
  const extracted = [
    { id: 'recorded', content: title, description: 'Recording source-id at 2026-10-28T17:46:21Z [DeepLog:tracking-id]', project_id: 'extraction',
      added_at: '2026-11-01T12:00:00Z', due: { date: '2026-10-28', datetime: '2026-10-28T21:09:00Z', is_recurring: false } },
    { id: 'created', content: 'A task with only a creation date', project_id: 'extraction', added_at: '2026-11-01T12:00:00Z',
      due: { date: '2026-11-02', is_recurring: false } },
    { id: 'undated', content: 'A task with no dates', project_id: 'extraction' },
  ];
  const mutations = [];
  await context.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/google/accounts') return route.fulfill({ json: { accounts: [{ id: 'review-test', email: 'review@example.test', status: 'active' }] } });
    if (url.pathname === '/api/google/calendars') return route.fulfill({ json: { calendars: [{ id: 'google|review-test|primary', accountId: 'review-test', name: 'Review Test', backgroundColor: '#4666e5', foregroundColor: '#fff', selected: true, writable: true, provider: 'google', providerCalendarId: 'primary' }] } });
    if (url.pathname === '/api/google/events') return route.fulfill({ json: { events: [], errors: [] } });
    if (url.pathname === '/api/todoist/destinations') return route.fulfill({ json: { projects: [{ id: 'inbox', name: 'Inbox', inbox_project: true }, { id: 'extraction', name: 'task-extraction' }], sections: [] } });
    if (url.pathname === '/api/todoist/tasks') {
      if (request.method() !== 'GET') {
        mutations.push(request.postDataJSON());
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ json: { tasks: url.searchParams.get('projectId') === 'extraction' ? extracted : [{ id: 'normal', content: 'An existing task to file', project_id: 'inbox' }] } });
    }
    return route.fulfill({ json: {} });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.UNPLAN_TEST_URL || 'http://localhost:3004/demo');
  await page.getByRole('button', { name: 'Extracted triage, 3 remaining', exact: true }).waitFor().catch(async error => {
    console.error('[TEST:EXTRACTED-REVIEW]', { text: await page.locator('body').innerText(), errors });
    throw error;
  });
  const openReview = () => page.getByRole('button', { name: 'Extracted triage, 3 remaining', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Extracted triage', exact: true });
  const currentTitle = () => dialog.getByRole('heading', { level: 3 }).innerText();
  const settleReview = () => page.waitForFunction(() => document.querySelector('.task-triage-modal')
    ?.getAnimations({ subtree: true }).every(animation => animation.playState === 'finished'));
  await openReview();
  await dialog.waitFor();
  assert.equal(await currentTitle(), title);
  assert.match(await dialog.locator('dl').innerText(), /Recorded\s+Oct 28, 2026, 10:46 AM PDT/);
  assert.match(await dialog.locator('dl').innerText(), /Due\s+Oct 28, 2026, 2:09 PM PDT/);
  assert.equal(await dialog.getByRole('link', { name: 'View transcript', exact: true }).count(), 1);
  await settleReview();
  await page.screenshot({ path: '/private/tmp/unplan-extracted-task-review.png' });

  for (const key of ['Shift+ArrowLeft', 'Alt+ArrowLeft']) {
    await page.keyboard.press(key);
    assert.equal(await currentTitle(), title, 'modified arrows must not skip');
  }
  await page.keyboard.down('ArrowLeft');
  await dialog.getByRole('heading', { name: 'A task with only a creation date', exact: true }).waitFor();
  await page.keyboard.down('ArrowLeft');
  assert.equal(await currentTitle(), 'A task with only a creation date', 'held arrows must not skip more tasks');
  await page.keyboard.up('ArrowLeft');
  assert.match(await dialog.locator('dl').innerText(), /Created\s+Nov 1, 2026, 4:00 AM PST/);
  assert.match(await dialog.locator('dl').innerText(), /Due\s+Nov 2, 2026/);
  await Promise.all([
    page.waitForResponse(response => response.url().includes('/api/todoist/tasks') && response.request().method() === 'GET'),
    page.evaluate(() => window.dispatchEvent(new Event('focus'))),
  ]);
  assert.equal(await currentTitle(), 'A task with only a creation date', 'refresh must preserve session skips');
  await dialog.getByRole('button', { name: 'Skip', exact: false }).click();
  await dialog.getByRole('heading', { name: 'A task with no dates', exact: true }).waitFor();
  assert.equal(await dialog.locator('dl').count(), 0, 'undated tasks should not show stale date context');
  await page.keyboard.press('ArrowLeft');
  const normal = page.getByRole('dialog', { name: 'Task triage', exact: true });
  await normal.waitFor();
  await normal.getByRole('button', { name: 'Close triage', exact: true }).click();
  await openReview();
  assert.equal(await currentTitle(), title, 'skipped tasks return in a new review session');
  await dialog.getByText('3 remaining', { exact: true }).waitFor();
  assert.deepEqual(mutations, [], 'skipping must never update, move, or delete provider tasks');

  await page.keyboard.press('ArrowRight');
  await dialog.getByRole('heading', { name: 'A task with only a creation date', exact: true }).waitFor();
  await page.keyboard.press('Meta+z');
  await dialog.getByRole('heading', { name: title, exact: true }).waitFor();
  await page.keyboard.press('ArrowUp');
  await dialog.getByRole('heading', { name: 'A task with only a creation date', exact: true }).waitFor();
  await page.keyboard.press('Meta+z');
  await dialog.getByRole('heading', { name: title, exact: true }).waitFor();
  assert.deepEqual(mutations, [], 'keep/delete undo must still cancel staged provider mutations');

  await page.setViewportSize({ width: 375, height: 812 });
  await settleReview();
  await page.screenshot({ path: '/private/tmp/unplan-extracted-task-review-mobile.png' });
  const bounds = await dialog.locator('section').boundingBox();
  for (const button of await dialog.locator('.task-triage-extracted-actions button').all()) {
    const box = await button.boundingBox();
    assert.ok(box.x >= bounds.x && box.x + box.width <= bounds.x + bounds.width, 'all review actions must fit on mobile');
  }
  assert.deepEqual(errors, []);
  await context.close();
  console.log('PASS: local dates, source links, arrow/button skipping, held-key guards, refresh, session reset, phase transition, keep/delete undo, and mobile layout');
} finally {
  await browser.close();
}

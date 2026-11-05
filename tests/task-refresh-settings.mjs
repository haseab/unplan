// Provider calls are mocked in an isolated context; no real task data is changed.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const active = process.env.UNPLAN_TEST_CRON_ACTIVE !== 'false';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ timezoneId: 'America/Los_Angeles' });
await context.addInitScript(() => {
  localStorage.setItem('todoist_api_key', 'mock');
  localStorage.setItem('todoist_project_id', 'project');
  localStorage.setItem('unplan:task-folder-activity:v1', JSON.stringify({ Work: { active: true, changedAt: '2026-01-01T00:00:00Z' } }));
  localStorage.setItem('unplan:todoist-group-parents:v1', JSON.stringify({ Research: 'Work' }));
});
let saved = null, reads = 0, writes = 0;
const errors = [];
await context.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/task-refresh/settings') {
    if (route.request().method() === 'PUT') { saved = route.request().postDataJSON(); writes++; }
    return route.fulfill({ json: { serverManaged: active, serverConfigured: true, settings: saved } });
  }
  if (path === '/api/todoist/destinations') return route.fulfill({ json: { projects: [{ id: 'project', name: 'Unplan', inbox_project: true }], sections: [] } });
  if (path === '/api/todoist/tasks') {
    reads++;
    return route.fulfill({ json: { tasks: [] } });
  }
  return route.fulfill({ json: {} });
});
const page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(process.env.UNPLAN_TEST_URL || 'http://localhost:3004');
  await page.waitForFunction(() => localStorage.getItem('unplan:task-refresh-settings:updated-at:v1'));
  await page.waitForTimeout(1500);
  assert.equal(writes, 1);
  assert.equal(saved.activity.Work.active, true);
  assert.equal(saved.parents.Research, 'Work');
  assert.equal(saved.timeZone, 'America/Los_Angeles');
  assert.ok(reads < 8, `Unexpected task-fetch loop: ${reads} requests`);
  const before = reads;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(500);
  if (active) assert.ok(reads > before, 'Focus should load background refresh results even with an empty task list');
  assert.deepEqual(errors, []);
  console.log(`PASS: monthly settings synced once (cron active=${active}); ${reads} bounded task reads; focus reload works`);
} finally { await browser.close(); }

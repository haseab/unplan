// Run against npm run dev. Provider traffic is mocked in an isolated browser context.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ timezoneId: 'America/Los_Angeles', viewport: { width: 1440, height: 1000 } });
context.setDefaultTimeout(15000);
await context.addInitScript(() => {
  if (localStorage.getItem('folder-test-initialized')) return;
  localStorage.setItem('folder-test-initialized', 'true');
  localStorage.setItem('unplan_undo_toast_duration', '5000');
  localStorage.setItem('todoist_api_key', 'mock');
  localStorage.setItem('todoist_project_id', 'project');
  localStorage.setItem('unplan:todoist-custom-groups:v1', JSON.stringify(['Work', 'Research']));
  localStorage.setItem('unplan:todoist-group-parents:v1', JSON.stringify({ Research: 'Work' }));
  localStorage.setItem('unplan:google-accounts:v1', JSON.stringify([{ id: 'folder-test', email: 'folders@example.test', accessToken: 'mock', expiresAt: Date.now() + 3600000 }]));
});
const calendar = { id: 'google|folder-test|primary', accountId: 'folder-test', name: 'Folder Test', backgroundColor: '#4666e5', foregroundColor: '#fff', primary: true, selected: true, writable: true, provider: 'google', providerCalendarId: 'primary' };
const start = new Date(); start.setHours(9, 0, 0, 0);
const events = Array.from({ length: 23 }, (_, index) => ({ id: `${calendar.id}:event-${index}`, providerEventId: `event-${index}`, calendarId: calendar.id, title: `Folder event ${index + 1}`, start: new Date(+start + index * 1800000).toISOString(), end: new Date(+start + (index + 1) * 1800000).toISOString(), calendarColor: '#4666e5', color: '#4666e5', provider: 'google' }));
const created = [], deleted = [], errors = [];
await context.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/google/calendars') return route.fulfill({ json: { calendars: [calendar] } });
  if (path === '/api/google/events') {
    if (route.request().method() === 'DELETE') { deleted.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true } }); }
    return route.fulfill({ json: { events, errors: [] } });
  }
  if (path === '/api/todoist/destinations') return route.fulfill({ json: { projects: [{ id: 'project', name: 'Unplan', inbox_project: true }], sections: [] } });
  if (path === '/api/todoist/tasks') {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON(); created.push(input);
      return route.fulfill({ json: { task: { id: `created-${created.length}`, content: input.content, description: input.description ?? '', project_id: 'project', labels: [] } } });
    }
    return route.fulfill({ json: { tasks: [] } });
  }
  return route.fulfill({ json: {} });
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const poll = async (fn) => { for (let i = 0; i < 300; i++) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error('Condition not met'); };
try {
  await page.goto(process.env.UNPLAN_TEST_URL || 'http://localhost:3004');
  await page.locator('.calendar-event').first().waitFor();
  for (const event of events) {
    await page.locator(`[data-calendar-event-id="${event.id}"]`).first().click({ modifiers: ['Shift'] });
  }
  await page.getByRole('button', { name: 'Add to task folder' }).click();
  await page.getByRole('heading', { name: '23 selected tasks' }).waitFor();
  await page.getByRole('button', { name: 'Close folder picker' }).click();
  await page.locator('.calendar-workspace').focus();
  await page.keyboard.press('Meta+Shift+p');
  await page.getByRole('heading', { name: '23 selected tasks' }).waitFor();
  await page.getByRole('textbox', { name: 'Search folders' }).fill('Research');
  await page.getByRole('button', { name: 'Create folder inside Work / Research', exact: true }).click();
  await page.getByRole('textbox', { name: 'Folder name' }).fill('Planning');
  await page.locator('.task-folder-create-form').getByRole('button', { name: 'Create folder', exact: true }).click();
  await page.getByRole('button', { name: 'Move to Work / Research / Planning', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('unplan:todoist-group-parents:v1')).Planning), 'Research');
  await page.screenshot({ path: '/tmp/unplan-task-folder-picker.png' });
  await page.getByRole('textbox', { name: 'Search folders' }).press('Enter');
  await page.getByText('Moved 23 events to Planning', { exact: true }).last().waitFor();
  await page.keyboard.press('Meta+z');
  await poll(async () => await page.locator('.calendar-event').count() === 23);
  assert.equal(created.length, 0, 'Undo must prevent provider writes');
  await page.locator('.calendar-workspace').focus();
  await page.keyboard.press('Meta+Shift+p');
  await page.getByRole('heading', { name: '23 selected tasks' }).waitFor();
  await page.getByRole('textbox', { name: 'Search folders' }).fill('Planning');
  await page.getByRole('textbox', { name: 'Search folders' }).press('Enter');
  await page.getByText('Moved 23 events to Planning', { exact: true }).last().waitFor();
  await page.locator('.calendar-workspace').focus();
  await page.keyboard.press('Meta+Enter');
  try { await poll(() => created.length === 23 && deleted.length === 23); }
  catch (error) { console.log({ created: created.length, deleted: deleted.length, text: await page.locator('[data-sonner-toaster]').innerText(), errors }); throw error; }
  assert.ok(created.every(task => task.content.includes('group=Planning')));
  await page.evaluate(() => localStorage.setItem('unplan:local-tasks:v1', JSON.stringify([{ id: 'local-triage-test', content: 'Triage test task' }])));
  await page.reload();
  await page.locator('.calendar-event').first().waitFor();
  await page.locator('.calendar-workspace').focus();
  await page.keyboard.press('Meta+e');
  await page.getByRole('heading', { name: 'Choose a folder', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Move to Work / Research / Planning', exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Search folders' }).fill('Personal');
  await page.getByRole('button', { name: 'Create folder “Personal”', exact: true }).click();
  await page.getByRole('textbox', { name: 'Folder name' }).press('Meta+Backspace');
  assert.equal(await page.getByRole('heading', { name: 'Choose a folder', exact: true }).count(), 1, 'Editing a folder name must not delete the current task');
  await page.getByRole('textbox', { name: 'Folder name' }).fill('Personal');
  await page.locator('.task-folder-create-form').getByRole('button', { name: 'Create folder', exact: true }).click();
  await page.getByRole('button', { name: 'Move to Personal', exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('unplan:todoist-group-parents:v1')).Personal), null);
  assert.deepEqual(errors, []);
  console.log('PASS: 23-event selection, sidebar, Cmd+Shift+P, nested creation, search, keyboard assignment, undo, mocked provider move, hierarchy reload, and triage folder creation');
} finally { await browser.close(); }

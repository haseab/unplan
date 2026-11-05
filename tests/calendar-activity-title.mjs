import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  // Isolated browser storage and mocked providers keep the user's accounts untouched.
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles' });
  await context.addInitScript(() => {
    localStorage.setItem('unplan_undo_toast_duration', '0');
    localStorage.setItem('todoist_api_key', 'activity-title-test');
    localStorage.setItem('todoist_project_id', 'inbox');
    localStorage.setItem('unplan:google-accounts:v1', JSON.stringify([{
      id: 'activity-title-test', email: 'activity@example.test',
      accessToken: 'mock', expiresAt: Date.now() + 3600000,
    }]));
  });
  const calendar = {
    id: 'google|activity-title-test|primary', accountId: 'activity-title-test',
    name: 'Activity Test', backgroundColor: '#4666e5', foregroundColor: '#fff',
    selected: true, writable: true, provider: 'google', providerCalendarId: 'primary',
  };
  let tasks = [
    { id: 'extracted', content: 'Extracted activity', project_id: 'extraction' },
    { id: 'normal', content: 'Normal activity', project_id: 'inbox' },
    {
      id: 'priority', project_id: 'inbox',
      content: `Priority activity [[unplan:v1;group=Priority%20Today;groupChangedAt=${encodeURIComponent(new Date().toISOString())}]]`,
    },
  ];
  await context.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/google/calendars') {
      return route.fulfill({ json: { calendars: [calendar] } });
    }
    if (url.pathname === '/api/google/events') {
      return route.fulfill({ json: { events: [], errors: [] } });
    }
    if (url.pathname === '/api/todoist/destinations') {
      return route.fulfill({ json: {
        projects: [
          { id: 'inbox', name: 'Inbox', inbox_project: true },
          { id: 'extraction', name: 'task-extraction' },
        ],
        sections: [{ id: 'follow-ups', name: 'unplan-follow-ups', project_id: 'inbox' }],
      } });
    }
    if (url.pathname === '/api/todoist/tasks') {
      if (request.method() === 'GET') {
        return route.fulfill({ json: {
          tasks: tasks.filter(task => task.project_id === url.searchParams.get('projectId')),
        } });
      }
      const body = request.postDataJSON();
      if (body.action === 'delete') tasks = tasks.filter(task => task.id !== body.taskId);
      if (body.action === 'update') {
        tasks = tasks.map(task => task.id === body.taskId ? { ...task, content: body.content } : task);
      }
      return route.fulfill({ json: { ok: true, task: tasks.find(task => task.id === body.taskId) } });
    }
    return route.fulfill({ json: {} });
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const expectTitle = async activity => {
    const expected = `unplan — ${activity}`;
    await page.waitForFunction(title => document.title === title, expected);
    assert.equal(await page.title(), expected);
    assert.equal(await page.locator('title').count(), 1, 'one authoritative title');
  };
  await page.goto(process.env.UNPLAN_TEST_URL || 'http://localhost:3004');
  await page.getByRole('button', { name: 'Extracted triage, 1 remaining', exact: true }).waitFor();
  await expectTitle('Calendar');

  // Pointer activity and keyboard focus both distinguish the calendar and sidebars.
  await page.getByRole('tab', { name: /Event Tasks/ }).click();
  await expectTitle('Sidebar');
  await page.getByRole('button', { name: 'Today', exact: true }).focus();
  await expectTitle('Calendar');
  await page.getByRole('textbox', { name: 'Go to a date', exact: true }).focus();
  await expectTitle('Sidebar');
  await page.locator('.topbar h1').click();
  await expectTitle('Calendar');
  await page.getByRole('tab', { name: 'Event', exact: true }).click();
  await expectTitle('Sidebar');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expectTitle('Settings');
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await expectTitle('Sidebar');
  await page.getByRole('tab', { name: /Event Tasks/ }).click();

  // One triage session progresses through all three phases without closing.
  await page.getByRole('button', { name: 'Extracted triage, 1 remaining', exact: true }).click();
  await page.getByRole('dialog', { name: 'Extracted triage', exact: true }).waitFor();
  await expectTitle('Extraction triage');
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog', { name: 'Task triage', exact: true }).waitFor();
  await expectTitle('Task triage');
  await page.getByRole('dialog').getByRole('button', { name: 'Delete task', exact: true }).click();
  await page.locator('.priority-review-modal').waitFor();
  await expectTitle('Follow-up triage');
  await page.keyboard.press('Escape');
  await expectTitle('Sidebar');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expectTitle('Calendar');

  // Disconnect updates the title immediately; settings still describes its open view.
  await page.locator('.account-switcher-trigger').click();
  await page.getByRole('button', { name: 'Disconnect activity@example.test', exact: true }).click();
  await expectTitle('Logged out');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expectTitle('Settings');
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await expectTitle('Logged out');
  assert.deepEqual(errors, []);
  console.log('PASS: calendar, both sidebars, keyboard focus, settings, automatic extraction/task/follow-up triage transitions, and logout titles');
} finally {
  await browser.close();
}

// Run against the local development server. Accounts and provider traffic are isolated and mocked.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const launch of ['follow-up', 'normal', 'extracted']) {
    const context = await browser.newContext({ timezoneId: 'America/Los_Angeles' });
    context.setDefaultTimeout(15000);
    await context.addInitScript(() => {
      localStorage.setItem('unplan_undo_toast_duration', '15000');
      localStorage.setItem('todoist_api_key', 'triage-sequence-test');
      localStorage.setItem('todoist_project_id', 'inbox');
      localStorage.setItem('unplan:google-accounts:v1', JSON.stringify([
        { id: 'triage-sequence', email: 'triage@example.test', accessToken: 'mock', expiresAt: Date.now() + 3600000 },
      ]));
      localStorage.setItem('unplan:google-accounts:v2', JSON.stringify([
        { id: 'triage-sequence', email: 'triage@example.test', status: 'active' },
      ]));
    });
    const account = { id: 'triage-sequence', email: 'triage@example.test', status: 'active' };
    const calendar = {
      id: 'google|triage-sequence|primary', accountId: account.id, name: 'Triage Test',
      backgroundColor: '#4666e5', foregroundColor: '#fff', selected: true, writable: true,
      provider: 'google', providerCalendarId: 'primary',
    };
    let tasks = [
      { id: 'normal', content: 'Existing task to file', project_id: 'inbox' },
      ...['Today', 'Tomorrow', 'Later'].map((category, index) => ({
        id: `priority-${index}`,
        content: `Follow-up ${category} [[unplan:v1;group=Priority%20${category};groupChangedAt=${encodeURIComponent(new Date().toISOString())}]]`,
        project_id: 'inbox',
      })),
      ...(launch === 'extracted'
        ? [{ id: 'extracted', content: 'Extracted task to review', project_id: 'extraction' }]
        : []),
    ];
    await context.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/api/google/accounts') return route.fulfill({ json: { accounts: [account] } });
      if (url.pathname === '/api/google/calendars') return route.fulfill({ json: { calendars: [calendar] } });
      if (url.pathname === '/api/google/events') return route.fulfill({ json: { events: [], errors: [] } });
      if (url.pathname === '/api/todoist/destinations') return route.fulfill({ json: {
        projects: [{ id: 'inbox', name: 'Inbox', inbox_project: true }, { id: 'extraction', name: 'task-extraction' }],
        sections: [],
      } });
      if (url.pathname === '/api/todoist/tasks') {
        if (request.method() === 'GET') return route.fulfill({ json: {
          tasks: tasks.filter(task => task.project_id === url.searchParams.get('projectId')),
        } });
        const body = request.postDataJSON();
        if (body.action === 'delete') tasks = tasks.filter(task => task.id !== body.taskId);
        if (body.action === 'update') tasks = tasks.map(task => task.id === body.taskId ? { ...task, content: body.content } : task);
        return route.fulfill({ json: { ok: true, task: tasks.find(task => task.id === body.taskId) } });
      }
      return route.fulfill({ json: {} });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.UNPLAN_TEST_URL || 'http://localhost:3004');
    await page.getByRole('button', { name: 'Task triage, 1 remaining', exact: true }).waitFor();
    if (launch === 'follow-up') {
      await page.getByRole('button', { name: 'Follow-up triage, 3 remaining', exact: true }).click();
    } else {
      await page.getByRole('button', {
        name: launch === 'extracted' ? 'Extracted triage, 1 remaining' : 'Task triage, 1 remaining', exact: true,
      }).click();
      if (launch === 'extracted') {
        await page.getByRole('dialog', { name: 'Extracted triage', exact: true }).getByRole('button', { name: 'Delete', exact: true }).click();
      }
      await page.getByRole('dialog', { name: 'Task triage', exact: true }).getByRole('button', { name: 'Delete task', exact: true }).click();
    }
    const followUp = page.getByRole('dialog', { name: 'Follow-up triage', exact: true });
    const taskTriage = page.getByRole('dialog', { name: 'Task triage', exact: true });
    const setDate = async (input, remaining) => {
      await followUp.getByRole('textbox', { name: 'When should this return?' }).fill(input);
      await followUp.getByRole('button', { name: 'Set follow-up', exact: true }).click();
      await followUp.getByText(`${remaining} left · assign a follow-up date`, { exact: true }).waitFor();
      await page.waitForFunction(() => !document.querySelector('.priority-review-block[data-departure], .priority-review-block[data-returning]'));
      assert.equal(await taskTriage.count(), 0, 'Now must not interrupt follow-up triage');
      assert.equal(await page.title(), 'unplan — Follow-up triage');
    };

    await setDate('Now', 2);
    if (launch === 'follow-up') {
      await page.keyboard.press('Meta+z');
      await followUp.getByText('3 left · assign a follow-up date', { exact: true }).waitFor();
      await setDate('Now', 2);
    }
    await setDate('7d', 1);
    await followUp.getByRole('textbox', { name: 'When should this return?' }).fill('now');
    await followUp.getByRole('button', { name: 'Set follow-up', exact: true }).click();
    await followUp.getByRole('heading', { name: 'All clear', exact: true }).waitFor();
    assert.equal(await taskTriage.count(), 0, 'the last Now decision finishes its animation before task triage');
    await taskTriage.waitFor();
    await page.waitForFunction(() => document.title === 'unplan — Task triage');
    assert.equal(await followUp.count(), 0);
    assert.equal(await taskTriage.getByText('Follow-up Tomorrow', { exact: true }).count(), 0, 'future follow-ups stay deferred');
    if (launch === 'follow-up') {
      await taskTriage.getByRole('button', { name: 'Edit task title: Existing task to file', exact: true }).waitFor();
      await taskTriage.getByRole('button', { name: 'Delete task', exact: true }).click();
    }
    await taskTriage.getByRole('button', { name: 'Edit task title: Follow-up Later', exact: true }).waitFor();
    await taskTriage.getByRole('button', { name: 'Delete task', exact: true }).click();
    await taskTriage.getByRole('button', { name: 'Edit task title: Follow-up Today', exact: true }).waitFor();
    await taskTriage.getByRole('button', { name: 'Close triage', exact: true }).click();
    await taskTriage.waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS: ${launch} launch keeps Now decisions in follow-up triage until completion, then opens queued task triage`);
  }
} finally {
  await browser.close();
}

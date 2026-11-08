// Actual app interactions; isolated local session and mocked provider traffic.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createLocalGoogleSession } from './helpers/local-google-session.mjs';

const baseURL = process.env.UNPLAN_TEST_URL || 'http://localhost:3004';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const mode of ['pointer-undo', 'pointer-create-failure', 'pointer-cleanup-failure', 'keyboard-mixed']) {
    const context = await browser.newContext({ timezoneId: 'America/Los_Angeles', viewport: { width: 1440, height: 1000 } });
    context.setDefaultTimeout(15000);
    const cleanup = await createLocalGoogleSession(context, baseURL);
    try {
      await context.addInitScript(() => {
        localStorage.setItem('todoist_api_key', 'transfer-test');
        localStorage.setItem('todoist_project_id', 'inbox');
        localStorage.setItem('unplan_undo_toast_duration', '10000');
        localStorage.setItem('unplan:todoist-custom-groups:v1', JSON.stringify(['Work']));
        localStorage.setItem('unplan:google-accounts:v2', JSON.stringify([{ id: 'transfer-test', email: 'transfer@example.test', status: 'active' }]));
      });
      const calendar = { id: 'google|transfer-test|primary', accountId: 'transfer-test', name: 'Transfer Test', backgroundColor: '#4666e5', foregroundColor: '#fff', selected: true, writable: true, provider: 'google', providerCalendarId: 'primary' };
      const start = new Date(); start.setHours(9, 0, 0, 0);
      const events = ['A', 'B', 'C'].map((title, index) => ({
        id: `${calendar.id}:event-${title}`, providerEventId: `event-${title}`, calendarId: calendar.id, title: `Transfer ${title}`,
        start: new Date(+start + index * 3600000).toISOString(), end: new Date(+start + index * 3600000 + 1800000).toISOString(),
        calendarColor: '#4666e5', color: '#4666e5', provider: 'google',
      }));
      let remoteEvents = [...events];
      const tasks = [], creates = [], deletes = [], errors = [];
      await context.route('**/api/**', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.pathname === '/api/google/accounts') return route.fulfill({ json: { accounts: [{ id: 'transfer-test', email: 'transfer@example.test', status: 'active' }] } });
        if (url.pathname === '/api/google/calendars') return route.fulfill({ json: { calendars: [calendar] } });
        if (url.pathname === '/api/google/events') {
          if (request.method() === 'DELETE') {
            const body = request.postDataJSON(); deletes.push(body.eventId);
            if (mode === 'pointer-cleanup-failure' || (mode === 'keyboard-mixed' && body.eventId === 'event-C')) {
              return route.fulfill({ status: 403, json: { error: 'Source deletion denied' } });
            }
            remoteEvents = remoteEvents.filter(event => event.providerEventId !== body.eventId);
            return route.fulfill({ json: { ok: true } });
          }
          return route.fulfill({ json: { events: remoteEvents, errors: [] } });
        }
        if (url.pathname === '/api/todoist/destinations') return route.fulfill({ json: { projects: [{ id: 'inbox', name: 'Inbox', inbox_project: true }], sections: [] } });
        if (url.pathname === '/api/todoist/tasks') {
          if (request.method() === 'POST') {
            const body = request.postDataJSON(); creates.push(body);
            if (mode === 'pointer-create-failure' || (mode === 'keyboard-mixed' && body.content.startsWith('Transfer A'))) {
              return route.fulfill({ status: 403, json: { error: 'Task creation denied' } });
            }
            const task = { id: `saved-${creates.length}`, content: body.content, description: body.description ?? '', project_id: 'inbox' };
            tasks.push(task); return route.fulfill({ json: { task } });
          }
          return route.fulfill({ json: { tasks } });
        }
        return route.fulfill({ json: {} });
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(baseURL);
      const source = title => page.locator(`[data-calendar-event-id="${calendar.id}:event-${title}"]`).first();
      await source('A').waitFor();
      if (mode.startsWith('pointer')) {
        const box = await source('A').boundingBox();
        const destination = await page.locator('[data-group-heading="Work"]').boundingBox();
        assert.ok(box && destination);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, { steps: 4 });
        await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height / 2, { steps: 12 });
        await page.mouse.up();
        await page.getByText('Moved Transfer A to Event Storage', { exact: true }).last().waitFor();
      } else {
        for (const title of ['A', 'B', 'C']) await source(title).click({ modifiers: ['Shift'] });
        await page.keyboard.press('Meta+Alt+Shift+p');
        await page.getByRole('button', { name: 'Move to Work', exact: true }).click();
        await page.getByText('Moved 3 events to Work', { exact: true }).last().waitFor();
      }
      if (mode === 'pointer-undo') {
        await page.keyboard.press('Meta+z');
        await source('A').waitFor();
        assert.deepEqual(creates, []); assert.deepEqual(deletes, []);
      } else {
        await page.locator('.calendar-workspace').focus();
        await page.keyboard.press('Meta+Enter');
        await source('A').waitFor();
        if (mode === 'pointer-create-failure') {
          await page.getByText('1 event could not be saved to Todoist', { exact: true }).waitFor();
          assert.equal(creates.length, 1); assert.deepEqual(deletes, []); assert.equal(tasks.length, 0);
        } else {
          const summary = mode === 'keyboard-mixed'
            ? '1 event was saved to Todoist but could not be removed from the calendar; 1 event could not be saved to Todoist'
            : '1 event was saved to Todoist but could not be removed from the calendar';
          await page.getByText(summary, { exact: true }).waitFor();
          assert.equal(tasks.length, mode === 'keyboard-mixed' ? 2 : 1);
          if (mode === 'keyboard-mixed') {
            await source('B').waitFor({ state: 'detached' }); await source('C').waitFor();
            assert.equal(creates.length, 3); assert.deepEqual(deletes, ['event-B', 'event-C']);
          } else assert.deepEqual(deletes, ['event-A']);
        }
      }
      assert.deepEqual(errors, []);
      console.log(`PASS: ${mode} preserves sources, confirmed destinations and provider write order`);
    } finally { await context.close(); await cleanup(); }
  }
} finally { await browser.close(); }

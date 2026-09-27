// Run against `npm run dev`. All Google/Todoist API traffic is mocked.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const context = await browser.newContext({ timezoneId: 'America/Los_Angeles' });
context.setDefaultTimeout(15000);
const baseURL = process.env.UNPLAN_TEST_URL || 'http://localhost:3004';
await context.addInitScript(() => {
  localStorage.setItem('unplan_undo_toast_duration', '0');
  if (!localStorage.getItem('unplan:google-accounts:v1')) localStorage.setItem('unplan:google-accounts:v1', JSON.stringify([{ id: 'notes-test', email: 'notes@example.test', accessToken: 'mock', expiresAt: Date.now() + 3600000 }]));
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (window.failNotesStorage && this.transaction.db.name === 'unplan-note-drafts') throw new DOMException('Simulated quota exceeded', 'QuotaExceededError');
    return put.apply(this, args);
  };
});
const calendar = { id: 'google|notes-test|primary', accountId: 'notes-test', name: 'Notes Test', backgroundColor: '#4666e5', foregroundColor: '#fff', primary: true, selected: true, writable: true, provider: 'google', providerCalendarId: 'primary' };
const otherCalendar = { ...calendar, id: 'google|notes-test|other', providerCalendarId: 'other', primary: false, name: 'Other Calendar' };
const now = new Date(); now.setHours(12, 0, 0, 0);
let remote = '<p>Original notes</p>';
let offline = false, deleted = false, loseResponse = false, started = false, pauseNotes = false;
let delay = 0, writes = 0;
const event = { id: `${calendar.id}:test-event`, providerEventId: 'test-event', calendarId: calendar.id, title: 'Notes sync test', start: now.toISOString(), end: new Date(+now + 3600000).toISOString(), calendarColor: '#4666e5', color: '#4666e5', provider: 'google' };
const genericUpdates = [];
await context.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/debug-log') return route.fulfill({ json: {} });
  if (offline) return route.abort('internetdisconnected');
  if (path === '/api/google/calendars') return route.fulfill({ json: { calendars: [calendar, otherCalendar] } });
  if (path === '/api/google/events/description') {
    if (pauseNotes) return route.abort('internetdisconnected');
    const body = route.request().postDataJSON();
    assert.equal(body.accountId, 'notes-test');
    assert.equal(route.request().headers().authorization, 'Bearer mock');
    if (deleted) return route.fulfill({ status: 409, json: { deleted: true } });
    if (body.reviewOnly || body.local === remote) return route.fulfill({ json: { description: remote } });
    if (body.base !== remote) return route.fulfill({ status: 409, json: { description: remote } });
    started = true;
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    remote = body.local; writes++;
    if (loseResponse) { loseResponse = false; return route.abort('failed'); }
    return route.fulfill({ json: { description: remote } });
  }
  if (path === '/api/google/events') {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON(); genericUpdates.push(body);
      assert.equal(Object.hasOwn(body, 'description'), false, 'ordinary updates must not write notes');
      if (body.sourceCalendarSourceId && body.sourceCalendarSourceId !== body.calendarSourceId) {
        event.calendarId = body.calendarSourceId; event.id = `${body.calendarSourceId}:test-event`;
        return route.fulfill({ headers: { 'x-unplan-event-moved': 'true' }, json: { id: 'test-event' } });
      }
      return route.fulfill({ json: { id: 'test-event' } });
    }
    return route.fulfill({ json: { events: [{ ...event, description: remote }], errors: [] } });
  }
  return route.fulfill({ json: {} });
});
const errors = [];
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const poll = async (fn, message, timeout = 20000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(message);
};
const records = (target = page, store = 'drafts') => target.evaluate(name => new Promise((resolve, reject) => {
  const request = indexedDB.open('unplan-note-drafts', 1);
  request.onsuccess = () => { const db = request.result; const query = db.transaction(name).objectStore(name).getAll(); query.onsuccess = () => { resolve(query.result); db.close(); }; query.onerror = () => reject(query.error); };
  request.onerror = () => reject(request.error);
}), store);
const select = async (target = page) => {
  await target.locator('.calendar-event').filter({ hasText: 'Notes sync test' }).first().click();
  await target.getByRole('textbox', { name: 'Notes', exact: true }).waitFor();
};
const edit = async (text, target = page) => {
  const editor = target.getByRole('textbox', { name: 'Notes', exact: true });
  if (!await editor.count()) await select(target);
  await editor.fill(text);
};
const open = async () => {
  await page.locator('.note-drafts-launcher button').filter({ hasText: 'Notes drafts' }).click();
  await page.locator('dialog[open]').waitFor();
};
const close = () => page.getByRole('button', { name: 'Close notes recovery' }).click();
try {
  await page.goto(baseURL);
  await select();
  offline = true;
  await edit('Offline local notes');
  await poll(async () => (await records())[0]?.local === '<p>Offline local notes</p>', 'typing was not persisted');
  assert.equal(writes, 0);
  remote = '<p>Phone edit</p>'; offline = false;
  await page.reload();
  await poll(async () => (await records())[0]?.status === 'conflict', 'reload did not detect conflict');
  await select();
  assert.equal(await page.getByRole('textbox', { name: 'Notes', exact: true }).innerText(), 'Offline local notes');
  await open();
  assert.equal(await page.getByRole('textbox', { name: 'Your local notes', exact: true }).innerText(), 'Offline local notes');
  assert.equal(await page.getByRole('textbox', { name: 'Current Google notes', exact: true }).innerText(), 'Phone edit');
  remote = '<p>Phone changed again</p>';
  await page.getByRole('button', { name: 'Keep mine', exact: true }).click();
  await poll(async () => (await records())[0]?.remote === remote, 'resolution did not recheck Google');
  assert.equal(writes, 0);
  await page.getByRole('button', { name: 'Merge/edit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Merged notes', exact: true }).fill('Merged local and phone notes');
  await page.screenshot({ path: process.env.UNPLAN_NOTES_SCREENSHOT || '/tmp/unplan-notes-conflict.png', fullPage: true });
  await page.getByRole('button', { name: 'Save merged notes', exact: true }).click();
  await poll(async () => (await records())[0]?.status === 'synced', 'merged notes did not sync');
  assert.equal(remote, '<p>Merged local and phone notes</p>');
  assert.equal((await records(page, 'history')).length, 1);
  await close();
  console.log('PASS: typing persistence, reload recovery, conflict recheck, rich-text merge and recovery history');

  delay = 2500; started = false;
  await edit('First upload');
  await poll(() => started, 'upload did not start');
  await edit('Newer typing');
  await poll(() => remote === '<p>Newer typing</p>', 'older upload erased newer typing');
  await poll(async () => (await records())[0]?.status === 'synced', 'newer typing did not sync');
  delay = 0;
  console.log('PASS: typing during an upload');

  loseResponse = true;
  await edit('Response was lost');
  await poll(async () => (await records())[0]?.status === 'error', 'failed response did not preserve draft');
  await open();
  await page.getByRole('button', { name: 'Retry sync', exact: true }).click();
  await poll(async () => (await records())[0]?.status === 'synced', 'lost response did not reconcile');
  assert.equal(remote, '<p>Response was lost</p>');
  await close();
  console.log('PASS: lost-response reconciliation');

  const title = page.getByRole('textbox', { name: 'Event title', exact: true });
  if (await title.count()) {
    await title.fill('Notes sync test renamed'); await title.blur();
    await poll(() => genericUpdates.length > 0, 'title update did not submit', 30000);
    assert.equal(remote, '<p>Response was lost</p>');
  } else throw new Error('Event title field not found');
  console.log('PASS: unrelated updates omit description');

  await page.evaluate(() => { window.failNotesStorage = true; });
  await edit('Retain after quota failure');
  await poll(async () => (await page.locator('body').innerText()).includes('Not saved locally'), 'storage failure was not surfaced');
  assert.equal((await records())[0].local, '<p>Response was lost</p>');
  await page.evaluate(() => { window.failNotesStorage = false; });
  await open(); await page.getByRole('button', { name: 'Retry sync', exact: true }).click();
  await poll(() => remote === '<p>Retain after quota failure</p>', 'storage failure recovery lost text');
  await close();
  console.log('PASS: storage failure is visible and retry retains text');

  const second = await context.newPage();
  second.on('pageerror', error => errors.push(error.message));
  await second.goto(baseURL); await select(second);
  offline = true;
  await edit('First tab draft');
  await poll(async () => (await records())[0]?.local === '<p>First tab draft</p>', 'first tab draft not stored');
  await edit('Second tab draft', second);
  await poll(async () => (await records())[0]?.status === 'conflict', 'cross-tab conflict not retained');
  assert.ok((await records(page, 'history')).some(item => item.local === '<p>First tab draft</p>'));
  await second.close(); offline = false;
  await open();
  await page.getByRole('button', { name: 'Refresh Google version', exact: true }).click();
  await poll(async () => (await records())[0]?.remote === remote, 'cross-tab remote version missing');
  await page.getByRole('button', { name: 'Keep Google', exact: true }).click();
  await poll(async () => (await records())[0]?.status === 'synced', 'keep Google did not resolve');
  await close();
  console.log('PASS: cross-tab draft recovery');

  event.attendees = [{ email: 'guest@example.test' }]; event.organizerSelf = true;
  await page.reload(); await select();
  const beforeGuest = writes;
  await edit('Guest notes');
  await poll(async () => (await records())[0]?.local === '<p>Guest notes</p>', 'guest draft not saved');
  await new Promise(resolve => setTimeout(resolve, 1800));
  assert.equal(writes, beforeGuest, 'guest edit uploaded before notification choice');
  await page.getByRole('textbox', { name: 'Notes', exact: true }).blur();
  await page.locator('dialog[open]').waitFor();
  await page.getByRole('button', { name: 'Update quietly', exact: true }).click();
  await poll(() => remote === '<p>Guest notes</p>', 'approved guest notes did not sync');
  await close(); delete event.attendees; delete event.organizerSelf;
  console.log('PASS: guest drafts wait for explicit notification choice');

  await page.reload(); await select();
  const accounts = await page.evaluate(() => localStorage.getItem('unplan:google-accounts:v1'));
  await page.evaluate(() => localStorage.setItem('unplan:google-accounts:v1', '[]'));
  const beforeDisconnected = writes;
  await edit('Disconnected account draft');
  await poll(async () => (await records())[0]?.local === '<p>Disconnected account draft</p>', 'disconnected draft missing');
  await new Promise(resolve => setTimeout(resolve, 1800));
  assert.equal(writes, beforeDisconnected);
  await page.evaluate(value => { localStorage.setItem('unplan:google-accounts:v1', value); window.dispatchEvent(new Event('online')); }, accounts);
  await poll(() => remote === '<p>Disconnected account draft</p>', 'reconnected account did not resume');
  console.log('PASS: disconnected accounts retain drafts without writing');

  // A pending creation can be recovered after reload, but is never recreated by the worker.
  const prior = (await records())[0];
  await page.evaluate(draft => new Promise((resolve, reject) => {
    const request = indexedDB.open('unplan-note-drafts', 1);
    request.onsuccess = () => { const db = request.result; const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put({ ...draft, local: '<p>Pending creation notes</p>', base: draft.local, status: 'local', awaitingCreation: true, sendUpdates: 'none', sent: undefined, revision: draft.revision + 1 });
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
  }), prior);
  deleted = true; const beforeCreation = writes;
  await page.reload();
  await new Promise(resolve => setTimeout(resolve, 1800));
  assert.equal(writes, beforeCreation);
  assert.equal((await records())[0].awaitingCreation, true);
  deleted = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await poll(() => remote === '<p>Pending creation notes</p>', 'pending creation did not resume after provider confirmation');
  console.log('PASS: pending creation waits for provider existence');

  await select(); pauseNotes = true;
  await edit('Move this local draft');
  await poll(async () => (await records())[0]?.local === '<p>Move this local draft</p>', 'move draft missing');
  await page.locator('.event-editor-calendar-picker .calendar-picker-trigger').click();
  await page.getByRole('option', { name: 'Other Calendar', exact: false }).click();
  // Unplan deliberately pauses ordinary mutations while the details editor has focus.
  await page.locator('.calendar-workspace').focus();
  await poll(() => event.calendarId === otherCalendar.id, 'calendar move did not submit', 30000);
  await poll(async () => (await records()).some(draft => draft.calendarId === otherCalendar.id && draft.local === '<p>Move this local draft</p>'), 'draft did not follow confirmed calendar move');
  await open();
  pauseNotes = false;
  await page.getByRole('button', { name: 'Retry sync', exact: true }).click();
  await poll(() => remote === '<p>Move this local draft</p>', 'moved draft did not sync');
  await close();
  console.log('PASS: draft identity follows confirmed calendar moves');

  otherCalendar.writable = false;
  await page.reload(); await select();
  assert.equal(await page.getByRole('textbox', { name: 'Notes', exact: true }).getAttribute('contenteditable'), 'false');
  otherCalendar.writable = true;
  await page.reload(); await select();
  console.log('PASS: read-only calendars cannot edit notes');

  offline = true;
  await edit('Recover deleted event');
  await poll(async () => (await records())[0]?.local === '<p>Recover deleted event</p>', 'deleted-event draft missing');
  offline = false; deleted = true;
  await page.reload();
  await poll(async () => (await records())[0]?.deleted === true, 'deletion not detected');
  await open();
  assert.equal(await page.getByRole('button', { name: 'Keep mine', exact: true }).count(), 0);
  assert.equal(await page.getByRole('textbox', { name: 'Your local notes', exact: true }).innerText(), 'Recover deleted event');
  console.log('PASS: deleted-event recovery without recreation');
  assert.deepEqual(errors, []);
  console.log('PASS: no browser runtime errors');
} catch (error) {
  await page.screenshot({ path: '/tmp/unplan-notes-failure.png', fullPage: true });
  console.error('Browser test diagnostics:', { updates: genericUpdates, body: (await page.locator('body').innerText()).slice(-5000), errors });
  throw error;
} finally { await browser.close(); }

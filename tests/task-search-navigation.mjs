// Run against npm run dev. Tasks and provider responses stay in isolated browser storage.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({
  timezoneId: 'America/Los_Angeles',
  viewport: { width: 1440, height: 1000 },
});
context.setDefaultTimeout(10000);
await context.addInitScript(() => {
  if (localStorage.getItem('task-search-test-initialized')) return;
  localStorage.setItem('task-search-test-initialized', 'true');
  const changedAt = encodeURIComponent(new Date().toISOString());
  const tasks = ['Work', 'Research', '__unplan_root__'].flatMap((group) =>
    Array.from({ length: 35 }, (_, index) => ({
      id: `local-search-${group}-${index}`,
      content: `${group} search task ${index + 1} [[unplan:v1;duration=30;group=${encodeURIComponent(group)};groupChangedAt=${changedAt}]]`,
    })),
  );
  localStorage.setItem('unplan:local-tasks:v1', JSON.stringify(tasks));
  localStorage.setItem('unplan:todoist-custom-groups:v1', JSON.stringify(['Work', 'Research']));
  localStorage.setItem('unplan:todoist-group-parents:v1', JSON.stringify({ Research: 'Work' }));
});
await context.route('**/api/**', route => route.fulfill({ json: {} }));
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

const taskId = (group, number) => `local-search-${group}-${number - 1}`;
const taskButton = (group, number) => page.locator(`[data-marquee-task-id="${taskId(group, number)}"]`);
const folderToggle = group => page.getByRole('button', { name: group, exact: true });
const resetScroll = () => page.evaluate(() => {
  document.querySelectorAll('.todo-event-groups, .todo-event-group-blocks').forEach(element => {
    element.scrollTop = 0;
  });
});
const chooseTask = async (group, number, method = 'keyboard') => {
  await page.locator('.calendar-workspace').focus();
  await page.keyboard.press('Meta+k');
  const input = page.getByRole('combobox', { name: 'Search events and tasks' });
  const title = `${group} search task ${number}`;
  await input.fill(title);
  const result = page.getByRole('option').filter({ has: page.getByText(title, { exact: true }) });
  await result.waitFor();
  if (method === 'mouse') await result.click();
  else await input.press('Enter');
  await page.getByRole('dialog', { name: 'Search events and tasks' }).waitFor({ state: 'detached' });
};
const expectRevealed = async (group, number) => {
  const id = taskId(group, number);
  await page.waitForFunction(id => {
    const element = document.querySelector(`[data-marquee-task-id="${id}"]`);
    return element && document.activeElement === element
      && element.getAttribute('aria-pressed') === 'true';
  }, id);
  // Verify after expansion and selection animations finish as well as after focus lands.
  await page.waitForFunction(() => !document.querySelector('.todo-event-groups')
    .getAnimations({ subtree: true }).some(animation => animation.playState === 'running'));
  const state = await taskButton(group, number).evaluate(element => {
    const rect = element.getBoundingClientRect();
    const clips = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) continue;
      const clip = parent.getBoundingClientRect();
      clips.push(rect.top >= clip.top - 1 && rect.bottom <= clip.bottom + 1);
    }
    const style = getComputedStyle(element);
    return {
      focused: document.activeElement === element,
      selected: element.getAttribute('aria-pressed'),
      surface: element.closest('.calendar-shell').dataset.activeSelectionSurface,
      outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
      visible: rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight && clips.every(Boolean),
    };
  });
  assert.deepEqual(state, {
    focused: true, selected: 'true', surface: 'sidebar',
    outline: '2px solid rgb(255, 255, 255)', visible: true,
  }, `${group} task ${number} must be focused, visible and outlined`);
  assert.equal(await page.locator('.todo-event-block[aria-pressed="true"]').count(), 1);
};

try {
  await page.goto(process.env.UNPLAN_TEST_URL || 'http://localhost:3004');
  await taskButton('Work', 35).waitFor({ state: 'attached' });
  await chooseTask('Work', 35);
  await expectRevealed('Work', 35);
  assert.ok(await taskButton('Work', 35).evaluate(element => element.closest('.todo-event-group-blocks').scrollTop) > 0);
  console.log('PASS: Enter scrolls an off-screen task into its folder and shows the white outline');

  await resetScroll();
  await chooseTask('Work', 35);
  await expectRevealed('Work', 35);
  console.log('PASS: searching for the same task again reveals it again');

  await resetScroll();
  await chooseTask('Work', 2, 'mouse');
  await expectRevealed('Work', 2);
  console.log('PASS: clicking a visible search result focuses and outlines the task');

  await folderToggle('Work').click();
  assert.equal(await folderToggle('Work').getAttribute('aria-expanded'), 'false');
  await chooseTask('Work', 35, 'mouse');
  await expectRevealed('Work', 35);
  assert.equal(await folderToggle('Work').getAttribute('aria-expanded'), 'true');
  console.log('PASS: search opens a collapsed folder and reveals its off-screen task');

  await folderToggle('Research').click();
  await folderToggle('Work').click();
  await chooseTask('Research', 35);
  await expectRevealed('Research', 35);
  assert.equal(await folderToggle('Work').getAttribute('aria-expanded'), 'true');
  assert.equal(await folderToggle('Research').getAttribute('aria-expanded'), 'true');
  console.log('PASS: search opens collapsed parent and child folders before revealing a task');

  await page.keyboard.press('ArrowUp');
  await expectRevealed('Research', 34);
  console.log('PASS: arrow navigation continues from the search result');

  await resetScroll();
  await chooseTask('__unplan_root__', 35);
  await expectRevealed('__unplan_root__', 35);
  assert.ok(await page.locator('.todo-event-groups').evaluate(element => element.scrollTop) > 0);
  console.log('PASS: root tasks scroll into view in the outer sidebar');

  await page.getByRole('tab', { name: 'Event', exact: true }).click();
  await chooseTask('Work', 35);
  await expectRevealed('Work', 35);
  console.log('PASS: searching from the Event tab mounts and focuses the task sidebar');
  assert.deepEqual(errors, []);
} catch (error) {
  console.error('[TEST:TASK-SEARCH]', JSON.stringify({
    errors,
    focus: await page.evaluate(() => ({
      tag: document.activeElement.tagName,
      taskId: document.activeElement.getAttribute('data-marquee-task-id'),
      surface: document.querySelector('.calendar-shell')?.dataset.activeSelectionSurface,
      selectedTasks: [...document.querySelectorAll('.todo-event-block[aria-pressed="true"]')]
        .map(element => ({ id: element.dataset.marqueeTaskId, inert: !!element.closest('[inert]'), rect: element.getBoundingClientRect().toJSON() })),
      folders: [...document.querySelectorAll('.todo-event-group-toggle')]
        .map(element => ({ title: element.textContent, expanded: element.getAttribute('aria-expanded') })),
      collapsed: localStorage.getItem('unplan:todoist-collapsed-groups:v1'),
    })),
  }));
  throw error;
} finally {
  await browser.close();
}

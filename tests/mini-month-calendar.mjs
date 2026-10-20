import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles' });
  await context.route('**/api/**', route => route.fulfill({ json: {} }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.UNPLAN_TEST_URL || 'http://localhost:3004');
  const dateCommand = page.getByRole('textbox', { name: 'Go to a date', exact: true });
  // Hydrate against the server's real clock before fixing the test date.
  await dateCommand.fill('October 19, 2026');
  await page.clock.install({ time: new Date('2026-10-20T12:00:00-07:00') });
  await dateCommand.press('Enter');
  const mini = page.getByRole('region', { name: 'Mini calendar', exact: true });
  const heading = mini.locator('.mini-month-heading strong');
  const next = mini.getByRole('button', { name: 'Next month', exact: true });
  const previous = mini.getByRole('button', { name: 'Previous month', exact: true });
  const currentDays = mini.locator('.mini-days:not([inert])');
  const waitForMonth = async label => {
    await heading.filter({ hasText: label }).waitFor();
    await mini.locator('.mini-days[inert]').waitFor({ state: 'detached' });
  };

  await waitForMonth('October 2026');
  const originalView = await page.locator('.topbar h1').textContent();
  await next.click();
  assert.equal(await heading.textContent(), 'November 2026');
  assert.equal(await mini.locator('.mini-month-viewport').getAttribute('data-direction'), 'next');
  assert.equal(await currentDays.locator('button').count(), 42);
  assert.ok(await currentDays.evaluate(element => element.getAnimations().some(animation =>
    animation.animationName === 'mini-month-enter'
    && animation.effect.getKeyframes()[0].transform === 'translateX(100%)')));
  await waitForMonth('November 2026');
  assert.equal(await page.locator('.topbar h1').textContent(), originalView, 'browsing does not move the main calendar');
  await mini.getByRole('button', { name: 'Monday, November 30, 2026', exact: true }).click();
  await page.waitForFunction(original => document.querySelector('.topbar h1').textContent !== original, originalView);
  assert.ok(await mini.getByRole('button', { name: 'Monday, November 30, 2026', exact: true }).evaluate(button => button.classList.contains('mini-viewed')));
  await previous.click();
  assert.equal(await mini.locator('.mini-month-viewport').getAttribute('data-direction'), 'previous');
  assert.ok(await currentDays.evaluate(element => element.getAnimations().some(animation =>
    animation.animationName === 'mini-month-enter'
    && animation.effect.getKeyframes()[0].transform === 'translateX(-100%)')));
  await waitForMonth('October 2026');

  // Rapid repeated clicks and a direction reversal must all count.
  await next.click({ clickCount: 3, delay: 20 });
  await waitForMonth('January 2027');
  await previous.click();
  await waitForMonth('December 2026');
  await next.click();
  await previous.click();
  await waitForMonth('December 2026');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await waitForMonth('October 2026');
  assert.equal(await page.locator('.topbar h1').textContent(), originalView);
  await mini.screenshot({ path: '/tmp/unplan-mini-month-calendar.png' });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await next.focus();
  await page.keyboard.press('Enter');
  await waitForMonth('November 2026');
  assert.equal(await next.evaluate(button => button === document.activeElement), true);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await waitForMonth('October 2026');
  assert.deepEqual(errors, []);
  console.log('PASS: month buttons, both slide directions, complete six-week grid, date selection, rapid clicks, year rollover, Today sync, reduced motion, keyboard activation');
} finally {
  await browser.close();
}

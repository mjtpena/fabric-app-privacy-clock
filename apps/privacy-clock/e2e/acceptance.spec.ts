/**
 * The five acceptance criteria of SPEC-2 App 12, one test each.
 */
import { expect, test } from '@playwright/test';

import { openApp, watchConsole } from '@x10/shared/e2e';

import { ALEX, NOOR, SAM, openFromList } from './helpers';

test('AC1: a request received on 31 January shows the last day of February, live, before saving', async ({ page }) => {
  await openApp(page, '/intake', ALEX);
  const preview = page.getByTestId('due-preview');
  await page.getByTestId('received-date').fill('2026-01-31');
  await expect(preview).toHaveAttribute('data-due', '2026-02-28');
  await expect(page.getByTestId('due-date')).toContainText('28');
  await expect(page.getByTestId('due-clamped')).toBeVisible();
  // Leap year, and an ordinary month, update live too.
  await page.getByTestId('received-date').fill('2028-01-31');
  await expect(preview).toHaveAttribute('data-due', '2028-02-29');
  await page.getByTestId('received-date').fill('2026-03-14');
  await expect(preview).toHaveAttribute('data-due', '2026-04-14');
  await expect(page.getByTestId('due-clamped')).toHaveCount(0);
  // Nothing was saved.
  await openApp(page, '/', ALEX);
  await expect(page.getByTestId('request-dial')).toHaveCount(10);
});

test('AC2: extending after the original due date is blocked; before it the new date is shown and an event written', async ({ page }) => {
  await openApp(page, '/', ALEX);
  await openFromList(page, 'DSR-0133');
  await expect(page.getByTestId('extend-blocked')).toContainText('has passed');
  await expect(page.getByTestId('extend-submit')).toHaveCount(0);

  await openApp(page, '/', ALEX);
  await openFromList(page, 'DSR-0138');
  const due = (await page.getByTestId('request-due').textContent())!.trim();
  await expect(page.getByTestId('extend-preview')).not.toHaveText(due);
  const preview = (await page.getByTestId('extend-preview').textContent())!.trim();
  await page.getByTestId('extend-reason').fill('Covers six systems and ten years of archived records.');
  await page.getByTestId('extend-submit').click();
  await expect(page.getByTestId('request-due')).toHaveText(preview);
  await expect(page.locator('[data-testid="trail-entry"][data-kind="extended"]')).toContainText('Extended by 2 months');
  await expect(page.getByTestId('extend-panel')).toHaveCount(0);
});

test('AC3: the open breach shows the 72-hour bar with the exact time left; closing is blocked without a decision', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/escapement', ALEX);
  await page.getByRole('link', { name: 'BR-0004' }).first().click();
  const countdown = page.getByTestId('breach-countdown');
  await expect(countdown).toHaveText(/^(40|41):\d{2}:\d{2}$/);
  await expect(page.getByTestId('breach-left-words')).toContainText(/^1 day 1[67] hours? left to notify the authority$/);
  const left = Number(await page.getByTestId('breach-bar').first().getAttribute('data-left-ms'));
  expect(left).toBeGreaterThan(40 * 3600_000);
  expect(left).toBeLessThanOrEqual(41 * 3600_000);
  // It ticks.
  const before = await countdown.textContent();
  await page.waitForTimeout(1300);
  expect(await countdown.textContent()).not.toBe(before);

  await expect(page.getByTestId('breach-close-blocked')).toContainText('Record a decision before closing');
  await expect(page.getByTestId('breach-close-submit')).toBeDisabled();

  // Deciding "document only" needs 40 characters of rationale.
  await page.getByText('Unlikely to result in a risk').click();
  await page.getByText('Document only').click();
  await page.getByTestId('rationale').fill('Too short to justify it.');
  await page.getByTestId('decide').click();
  await expect(page.getByText(/at least 40 characters, Art\. 33\(5\)/)).toBeVisible();
  consoleWatch.assertClean();
});

test('AC4: a system owner sees their tasks, completes one, and the request dial updates', async ({ page }) => {
  await openApp(page, '/', SAM);
  const before = Number(await page.locator('[data-ref="DSR-0140"]').getAttribute('data-done'));
  await openApp(page, '/gears', SAM);
  await expect(page.getByRole('radio', { name: 'My tasks' })).toHaveAttribute('aria-checked', 'true');
  const crm = page.locator('[data-testid="gear-column"][data-system="CRM"]');
  const row = crm.getByTestId('task-row').filter({ hasText: 'DSR-0140' });
  await row.getByTestId('task-done').click();
  await page.getByRole('button', { name: 'See the dial' }).click();
  const d = page.locator('[data-ref="DSR-0140"]');
  await expect(d).toHaveAttribute('data-focused', 'true');
  await expect(d).toHaveAttribute('data-done', String(before + 1));
  // The step is in the request's logbook, by the owner.
  await openApp(page, '/', SAM);
  await openFromList(page, 'DSR-0140');
  await expect(page.locator('[data-testid="trail-entry"][data-kind="task_done"]').last()).toContainText('Sam Taylor');
});

test('AC5: the logbook shows every event in order and cannot be edited', async ({ page }) => {
  await openApp(page, '/', ALEX);
  await openFromList(page, 'DSR-0131');
  await page.locator('a[href*="logbook?item=request"]').first().click();
  const book = page.getByTestId('logbook');
  await expect(book).toBeVisible();
  const entries = book.getByTestId('trail-entry');
  const n = await entries.count();
  expect(n).toBeGreaterThanOrEqual(5);
  const times = await book.locator('time').evaluateAll((els) => els.map((e) => Date.parse(e.getAttribute('datetime')!)));
  expect(times).toEqual([...times].sort((a, b) => a - b));
  await expect(entries.first()).toHaveAttribute('data-kind', 'created');
  await expect(book.locator('[data-testid="trail-entry"][data-kind="extended"]')).toHaveCount(1);
  // No edit or delete controls on any entry, and the page says so.
  await expect(book.getByTestId('trail').getByRole('button')).toHaveCount(0);
  await expect(book.getByTestId('trail').getByRole('textbox')).toHaveCount(0);
  await expect(book.getByText('Entries cannot be changed or removed.')).toBeVisible();
  // Appending a note adds one entry at the end and leaves the rest as they were.
  const firstTexts = await entries.allTextContents();
  await page.getByPlaceholder('Add a note to the logbook').fill('Archive restore booked for Monday.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(entries).toHaveCount(n + 1);
  expect((await entries.allTextContents()).slice(0, n)).toEqual(firstTexts);
  await expect(entries.last()).toContainText('Archive restore booked for Monday.');
});

test('anyone can report a breach; it is handed to the privacy officer with its 72-hour clock', async ({ page }) => {
  await openApp(page, '/intake', NOOR);
  await expect(page.getByRole('radio', { name: 'Privacy request' })).toBeDisabled();
  await page.getByLabel('What happened').fill('Laptop left on a train');
  await page.getByRole('button', { name: 'contact details' }).click();
  await page.getByRole('button', { name: /^Report BR-0005/ }).click();
  await expect(page.getByTestId('breach-reported')).toContainText('Alex Rivera handles it from here');
  await page.getByRole('link', { name: 'Follow it in Escapement' }).click();
  await expect(page.getByTestId('breach-countdown')).toHaveText(/^(71|72):\d{2}:\d{2}$/);
  // Staff see the case but not the officer's controls.
  await expect(page.getByTestId('decision-form')).toHaveCount(0);
});

test('an erasure with an open erase task cannot close', async ({ page }) => {
  await openApp(page, '/', ALEX);
  await openFromList(page, 'DSR-0137');
  await expect(page.getByTestId('close-blocked')).toContainText('cannot close while');
  await page.getByTestId('close-outcome').fill('All personal data erased and confirmed.');
  await page.getByTestId('close-submit').click();
  await expect(page.getByText(/cannot close while 2 erase tasks are still open/).last()).toBeVisible();
});

import { expect, test } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

import { ALEX } from './helpers';

test('loads, logs a request, sees it on the tower and in the list, no console errors', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/', ALEX);
  await expect(page.getByRole('heading', { level: 1, name: 'The clock tower' })).toBeVisible();
  await assertNoHorizontalScroll(page);

  await openApp(page, '/intake', ALEX);
  await expect(page.getByRole('heading', { level: 1, name: 'Intake' })).toBeVisible();
  await page.getByLabel('Subject label').fill('Customer C-77001');
  await page.getByText('Erasure', { exact: true }).click();
  await page.getByText('CRM', { exact: true }).click();
  await assertNoHorizontalScroll(page);
  await page.getByRole('button', { name: /^Log DSR-0143/ }).click();

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Customer C-77001');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await expect(page.getByTestId('trail-entry').first()).toHaveAttribute('data-kind', 'created');
  await assertNoHorizontalScroll(page);

  await page.getByRole('link', { name: 'Tower' }).first().click();
  await expect(page.locator('[data-testid="request-dial"][data-ref="DSR-0143"]')).toHaveCount(1);
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.locator('[data-testid="tower-list-row"][data-ref="DSR-0143"]')).toContainText('Erasure');
  await assertNoHorizontalScroll(page);
  consoleWatch.assertClean();
});

test('every screen renders at this width without horizontal scroll or console errors', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  for (const path of ['/gears', '/escapement', '/logbook', '/almanac', '/about', '/intake?mode=breach']) {
    await openApp(page, path, ALEX);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.waitForTimeout(300);
    await assertNoHorizontalScroll(page);
  }
  consoleWatch.assertClean();
});

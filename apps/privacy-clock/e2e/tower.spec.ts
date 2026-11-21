import { expect, test } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

import { ALEX, SAM, openToday } from './helpers';

test('the tower renders a dial for every open request and breach, and lenses re-group it', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/', ALEX);
  await expect(page.getByTestId('breach-dial')).toHaveCount(2);
  await expect(page.getByTestId('request-dial')).toHaveCount(10);
  await expect(page.getByTestId('master-clock')).toBeVisible();
  const svg = page.getByTestId('tower').locator('svg').first();
  await expect(svg).toHaveAttribute('data-lens', 'state');
  await expect(page.locator('[data-testid="tower-bay"][data-group="overdue"]')).toHaveCount(1);
  // Overdue dials are cracked and marked.
  await expect(page.locator('[data-testid="request-dial"][data-state="overdue"]')).toHaveCount(2);

  await page.getByRole('radio', { name: /Type/ }).click();
  await expect(svg).toHaveAttribute('data-lens', 'type');
  await expect(page.locator('[data-testid="tower-bay"][data-group="erasure"]')).toHaveCount(1);
  await page.keyboard.press('4');
  await expect(svg).toHaveAttribute('data-lens', 'systems');
  await page.keyboard.press('5');
  await expect(svg).toHaveAttribute('data-lens', 'stage');
  await assertNoHorizontalScroll(page);
  consoleWatch.assertClean();
});

test('a Today item focuses its dial and switches to its lens', async ({ page }) => {
  await openApp(page, '/', ALEX);
  await page.keyboard.press('2');
  const today = await openToday(page);
  await today.getByRole('button', { name: /Breach BR-0004: notify within 72 hours/ }).click();
  await expect(page.locator('[data-testid="breach-dial"][data-ref="BR-0004"]')).toHaveAttribute('data-focused', 'true');
  await expect(page.getByRole('heading', { level: 1, name: 'BR-0004 · Breach' })).toBeVisible();
  await expect(page.getByTestId('tower').locator('svg').first()).toHaveAttribute('data-lens', 'state');
  await page.getByTestId('focus-open').click();
  await expect(page.getByTestId('breach-countdown')).toBeVisible();
});

test('the extension-day Today item focuses the request due today', async ({ page }) => {
  await openApp(page, '/', ALEX);
  const today = await openToday(page);
  await today.getByRole('button', { name: /Last day to notify an extension for DSR-0135/ }).click();
  await expect(page.locator('[data-ref="DSR-0135"]')).toHaveAttribute('data-focused', 'true');
  await expect(page.getByTestId('tower').locator('svg').first()).toHaveAttribute('data-lens', 'stage');
});

test('view as system owner dims clocks without a task for them', async ({ page }) => {
  await openApp(page, '/', SAM);
  await expect(page.getByRole('radiogroup', { name: 'View as' }).getByRole('radio', { name: /Owner/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-ref="DSR-0140"]')).toHaveAttribute('data-dimmed', 'false');
  await expect(page.locator('[data-ref="DSR-0138"]')).toHaveAttribute('data-dimmed', 'true');
  const today = await openToday(page);
  await expect(today.getByRole('button', { name: /DSR-0140/ }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('radiogroup', { name: 'View as' }).getByRole('radio', { name: /Officer/ }).click();
  await expect(page.locator('[data-ref="DSR-0138"]')).toHaveAttribute('data-dimmed', 'false');
});

test('the list view shows the same clocks, sortable', async ({ page }) => {
  await openApp(page, '/', ALEX);
  await page.getByRole('radio', { name: 'List' }).click();
  const rows = page.getByTestId('tower-list-row');
  await expect(rows).toHaveCount(12);
  await expect(page.locator('[data-testid="tower-list-row"][data-ref="BR-0004"]')).toContainText('Breach');
  await expect(rows.first()).toHaveAttribute('data-ref', 'DSR-0133');
  await page.getByRole('button', { name: 'Clock' }).click();
  await expect(rows.first()).toHaveAttribute('data-ref', 'BR-0003');
  await assertNoHorizontalScroll(page);
});

test('without WebGL the tower still renders (it is SVG)', async ({ page }) => {
  await page.goto(`/?nowebgl&as=${ALEX}#/`);
  await expect(page.getByTestId('demo-banner')).toBeVisible();
  await expect(page.getByTestId('request-dial')).toHaveCount(10);
});

test('hovering a dial says the time left in plain words', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Hover is a pointer feature.');
  await openApp(page, '/', ALEX);
  await page.locator('[data-ref="BR-0004"]').hover();
  await expect(page.getByTestId('dial-tooltip')).toContainText(/\d+ (day|days) \d+ hours? left/);
});

/**
 * Redesign screenshots (not a test). Run: SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 * Writes docs/redesign/<screen>-<theme>-<desktop|phone>.png.
 */
import { test, type Page } from '@playwright/test';

import { openApp } from '@x10/shared/e2e';

import { ALEX, NOOR, SAM, openToday } from './helpers';

type Shot = { name: string; path: string; persona: string; full?: boolean; act?: (page: Page, phone: boolean) => Promise<void> };

const viaList = (ref: string) => async (page: Page) => {
  await page.getByRole('radio', { name: 'List' }).click();
  await page.getByRole('link', { name: ref, exact: true }).click();
};

const SHOTS: Shot[] = [
  { name: 'tower-clock', path: '/', persona: ALEX },
  { name: 'tower-type', path: '/', persona: ALEX, act: async (page) => page.getByRole('radio', { name: /Type/ }).click() },
  { name: 'tower-systems', path: '/', persona: ALEX, act: async (page) => page.getByRole('radio', { name: /Systems/ }).click() },
  {
    name: 'tower-today-focus',
    path: '/',
    persona: ALEX,
    act: async (page) => {
      const today = await openToday(page);
      await today.getByRole('button', { name: /Breach BR-0004/ }).click();
    },
  },
  {
    name: 'tower-overdue-hover',
    path: '/',
    persona: ALEX,
    act: async (page, phone) => {
      if (!phone) await page.locator('[data-ref="DSR-0133"]').hover();
    },
  },
  { name: 'tower-view-as-owner', path: '/', persona: SAM },
  { name: 'tower-list', path: '/', persona: ALEX, full: true, act: async (page) => page.getByRole('radio', { name: 'List' }).click() },
  { name: 'intake-request', path: '/intake', persona: ALEX, act: async (page) => page.getByTestId('received-date').fill('2026-01-31') },
  {
    name: 'intake-breach',
    path: '/intake',
    persona: NOOR,
    act: async (page) => {
      await page.getByLabel('What happened').fill('Laptop with an unencrypted export left on a train');
      await page.getByRole('button', { name: 'contact details' }).click();
      await page.getByRole('button', { name: 'financial' }).click();
    },
  },
  { name: 'gears', path: '/gears', persona: ALEX, full: true },
  { name: 'gears-owner', path: '/gears', persona: SAM },
  { name: 'escapement', path: '/escapement', persona: ALEX },
  { name: 'escapement-breach', path: '/escapement', persona: ALEX, full: true, act: async (page) => page.getByRole('link', { name: 'BR-0004' }).first().click() },
  { name: 'request-erasure-blocked', path: '/', persona: ALEX, full: true, act: viaList('DSR-0137') },
  { name: 'request-overdue', path: '/', persona: ALEX, full: true, act: viaList('DSR-0133') },
  { name: 'request-extended', path: '/', persona: ALEX, full: true, act: viaList('DSR-0131') },
  {
    name: 'logbook',
    path: '/logbook',
    persona: ALEX,
    full: true,
    act: async (page, phone) => {
      if (!phone) return page.getByRole('button', { name: /^DSR-0131/ }).click();
      const sel = page.getByLabel('Request or breach');
      await sel.selectOption((await sel.locator('option', { hasText: 'DSR-0131' }).getAttribute('value'))!);
    },
  },
  { name: 'almanac', path: '/almanac', persona: ALEX, full: true },
  { name: 'about', path: '/about', persona: ALEX, full: true },
];

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });
    for (const s of SHOTS) {
      test(`${s.name} ${scheme}`, async ({ page }, info) => {
        test.skip(!process.env.SCREENSHOTS, 'Set SCREENSHOTS=1 to write the redesign screenshots.');
        const phone = info.project.name === 'phone';
        await openApp(page, s.path, s.persona);
        await page.getByTestId('demo-banner').getByRole('button').first().click().catch(() => undefined);
        if (s.act) await s.act(page, phone);
        await page.waitForTimeout(1900);
        await page.screenshot({ path: `docs/redesign/${s.name}-${scheme}-${phone ? 'phone' : 'desktop'}.png`, fullPage: !!s.full && !phone });
      });
    }
  });
}

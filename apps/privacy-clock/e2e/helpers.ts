import { expect, type Page } from '@playwright/test';

export const ALEX = 'demo-officer-alex';
export const SAM = 'demo-owner-sam';
export const NOOR = 'demo-staff-noor';

/** Today lives in the side panel on desktop and behind a "Today" button (bottom sheet) on phones. */
export async function openToday(page: Page) {
  const panel = page.getByRole('complementary', { name: 'Today' });
  if (await panel.isVisible()) return panel;
  await page.getByRole('button', { name: /^Today/ }).click();
  return page.getByRole('dialog');
}

/** Open a request or breach by its reference through the tower's list view. */
export async function openFromList(page: Page, ref: string) {
  await page.getByRole('radio', { name: 'List' }).click();
  await page.getByRole('link', { name: ref, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

export const dial = (page: Page, ref: string) => page.locator(`[data-ref="${ref}"]`).first();

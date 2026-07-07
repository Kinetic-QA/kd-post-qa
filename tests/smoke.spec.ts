/**
 * Smoke test — verifies qa.slingo.com is reachable and renders a page.
 * Run with: npx playwright test tests/smoke.spec.ts
 */

import { test, expect } from '@playwright/test';

test('QA site loads', async ({ page }) => {
  const res = await page.goto('');
  expect(res?.status()).toBeLessThan(500);
  await expect(page).not.toHaveTitle('');
});

test('QA site has no broken console errors on load', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));

  await page.goto('');
  await page.waitForLoadState('load');

  expect(errors).toEqual([]);
});

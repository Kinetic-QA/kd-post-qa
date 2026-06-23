import { test, expect } from '@playwright/test';

test.describe('Sample - YouTube Navigation', () => {

  test.setTimeout(60_000);

  test('YT-01: Navigate to YouTube and verify homepage loads', async ({ page }) => {
    test.setTimeout(60_000);

    const results: { label: string; status: string }[] = [];

    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }

    function printSummary() {
      console.log('\n' + '═'.repeat(50));
      console.log('  YT-01 YOUTUBE NAVIGATION - RESULTS');
      console.log('═'.repeat(50));
      for (const r of results) {
        console.log(`  ${r.status === 'Pass' ? '✅' : '❌'}  ${r.label.padEnd(40)} ${r.status}`);
      }
      const passed = results.filter(r => r.status === 'Pass').length;
      const failed = results.filter(r => r.status === 'Fail').length;
      console.log('─'.repeat(50));
      console.log(`  Total: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}`);
      console.log('═'.repeat(50) + '\n');
    }

    async function runStep(label: string, fn: () => Promise<void>) {
      await test.step(label, async () => {
        try {
          await fn();
          record(label, true);
        } catch (e) {
          record(label, false);
          throw e;
        }
      });
    }

    try {

      // ── Step 1: Navigate to YouTube ─────────────────────────────────────
      await runStep('Step 1: Go to youtube.com → page loads', async () => {
        await page.goto('https://www.youtube.com');
        await page.waitForLoadState('domcontentloaded');
        await expect(page).toHaveURL(/youtube\.com/, { timeout: 15_000 });
      });

      // ── Step 2: Verify page title contains YouTube ──────────────────────
      await runStep('Step 2: Page title contains "YouTube"', async () => {
        await expect(page).toHaveTitle(/YouTube/, { timeout: 10_000 });
      });

      // ── Step 3: Verify YouTube logo is visible ───────────────────────────
      await runStep('Step 3: YouTube logo is visible', async () => {
        const logo = page.locator('#logo, ytd-logo, a[href="/"][aria-label*="YouTube"]').first();
        await expect(logo).toBeVisible({ timeout: 10_000 });
      });

      // ── Step 4: Verify search bar is present ─────────────────────────────
      await runStep('Step 4: Search bar is visible', async () => {
        const searchBar = page.locator('input#search, input[name="search_query"]').first();
        await expect(searchBar).toBeVisible({ timeout: 10_000 });
      });

      // ── Step 5: Type a search query ──────────────────────────────────────
      await runStep('Step 5: Type "Playwright testing" in search bar', async () => {
        const searchBar = page.locator('input#search, input[name="search_query"]').first();
        await searchBar.click();
        await searchBar.fill('Playwright testing');
        await page.waitForTimeout(1_000);
      });

      // ── Step 6: Submit search ────────────────────────────────────────────
      await runStep('Step 6: Submit search → results page loads', async () => {
        await page.keyboard.press('Enter');
        await page.waitForLoadState('domcontentloaded');
        await expect(page).toHaveURL(/search_query=Playwright\+testing|search_query=Playwright%20testing/, { timeout: 15_000 });
      });

      // ── Step 7: Verify search results appear ─────────────────────────────
      await runStep('Step 7: Search results are visible', async () => {
        const results = page.locator('ytd-video-renderer, ytd-search-pyv-renderer').first();
        await expect(results).toBeVisible({ timeout: 15_000 });
      });

    } finally {
      printSummary();
    }
  });

});

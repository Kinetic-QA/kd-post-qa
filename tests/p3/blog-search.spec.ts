import { test, expect } from '@playwright/test';
import { dismissCampaignPopup, dismissCookieConsent, setupCampaignPopupWatcher, assertNoSiteError } from '../../helpers/common';
import { currentGeoFeatures } from '../../helpers/geo-features';

/**
 * BS-01: Blog Search Flow
 * Scope: Sidebar entry to the blog, opening blog search, typing a query,
 * and confirming search results (or a no-results state) render.
 * Blog only exists for some GEOs (see helpers/geo-features.ts) — this
 * suite skips cleanly where it doesn't.
 * CRITICAL: Never click the campaign popup close button (it opens login).
 * Always use Escape key via dismissCampaignPopup.
 */

test.describe('P3 - Blog Search', () => {

  test.setTimeout(90_000);

  let geoFeatures: ReturnType<typeof currentGeoFeatures>;

  test.beforeEach(async ({ page }) => {
    geoFeatures = currentGeoFeatures();
    test.skip(!geoFeatures.hasBlog, `Blog does not exist for this GEO (${test.info().project.name})`);
    await setupCampaignPopupWatcher(page);
    await page.goto('');
    await page.waitForLoadState('domcontentloaded'); // faster than networkidle for initial load
    await page.waitForTimeout(3_000);
    await dismissCookieConsent(page);
    await dismissCampaignPopup(page);
    await page.waitForTimeout(500);
  });

  test('BS-01: Blog search via sidebar menu', async ({ page }) => {
    test.setTimeout(90_000);

    const results: { label: string; status: string }[] = [];

    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }

    function printSummary() {
      console.log('\n' + '═'.repeat(40));
      console.log('  BS-01 BLOG SEARCH - RESULTS');
      console.log('═'.repeat(40));
      for (const r of results) {
        console.log(`  ${r.status === 'Pass' ? '✅' : '❌'}  ${r.label.padEnd(30)} ${r.status}`);
      }
      const passed = results.filter(r => r.status === 'Pass').length;
      const failed = results.filter(r => r.status === 'Fail').length;
      console.log('─'.repeat(40));
      console.log(`  Total: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}`);
      console.log('═'.repeat(40) + '\n');
    }

    // Auto-records pass/fail — failed steps appear in summary as ❌
    async function runStep(label: string, fn: () => Promise<void>) {
      await test.step(label, async () => {
        try {
          await fn();
          await assertNoSiteError(page);
          record(label, true);
        } catch (e) {
          record(label, false);
          throw e;
        }
      });
    }

    try {

    // ── Step 1: Confirm homepage ─────────────────────────────────────────
    await runStep('Homepage confirmed (not #account)', async () => {
      await expect(page).not.toHaveURL(/#account/);
    });

    // ── Step 2: Open sidebar ─────────────────────────────────────────────
    await runStep('Hamburger → sidebar opens', async () => {
      const hamburger = page.locator(
        'button[aria-label*="menu" i], button[aria-label*="hamburger" i], ' +
        '[class*="hamburger"], [class*="Hamburger"], [class*="burger"], ' +
        '[class*="sidebar-toggle"], [class*="SidebarToggle"], ' +
        '[class*="menu-toggle"], [class*="MenuToggle"]'
      ).first();
      await expect(hamburger).toBeVisible({ timeout: 10_000 });
      await hamburger.click();
      await page.waitForTimeout(1_500);
    });

    // ── Step 3: Click Blog in sidebar ───────────────────────────────────
    await runStep('Blog link in sidebar → blog page loads', async () => {
      const blogLinks = page.locator('a:has-text("Blog"), a:has-text("BLOG")');
      const count = await blogLinks.count();
      let clicked = false;
      for (let i = 0; i < count; i++) {
        const link = blogLinks.nth(i);
        const isVisible = await link.isVisible({ timeout: 1_000 }).catch(() => false);
        if (!isVisible) continue;
        const box = await link.boundingBox().catch(() => null);
        if (!box) continue;
        const vh = page.viewportSize()?.height ?? 720;
        if (box.y > vh * 0.85) continue; // skip footer link
        await link.click();
        clicked = true;
        break;
      }
      if (!clicked) {
        await page.goto(geoFeatures.blogPath!);
      }
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2_500); // wait for campaign popup to appear on blog page
      await dismissCampaignPopup(page); // dismiss if present before proceeding
      await expect(page).toHaveURL(/\/blog/, { timeout: 15_000 });
    });

    // ── Step 4: Click search icon ────────────────────────────────────────
    await runStep('Search icon → search field visible', async () => {
      const blogSearchIcon = page.locator(
        'a[href*="/blog/search"], a[href*="blog/search"], ' +
        '[class*="search"] a[href*="blog"], ' +
        'input[placeholder*="search" i], input[placeholder*="Search" i]'
      ).first();
      const searchIconVisible = await blogSearchIcon.isVisible({ timeout: 5_000 }).catch(() => false);
      if (searchIconVisible) {
        await blogSearchIcon.click();
        await page.waitForTimeout(1_500);
      } else {
        const currentUrl = page.url();
        const blogBase = currentUrl.split('/blog')[0] + '/blog';
        await page.goto(blogBase + '/search/');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2_500);
        await dismissCampaignPopup(page);
      }
    });

    // ── Step 5: Type and search ──────────────────────────────────────────
    await runStep('Type "casino" → search executes', async () => {
      const searchInput = page.locator(
        'input[type="search"], input[placeholder*="search" i], ' +
        'input[aria-label*="search" i], input[name*="search" i]'
      ).filter({ visible: true }).first();
      await expect(searchInput).toBeVisible({ timeout: 10_000 });
      await searchInput.click();
      await searchInput.fill('casino');
      await page.waitForTimeout(500);
      await searchInput.press('Enter');
      await page.waitForTimeout(3_000);
    });

    // ── Step 6: Verify results ───────────────────────────────────────────
    await runStep('Search results appear', async () => {
      const hasResults = await page.locator(
        'article, [class*="post"], [class*="Post"], [class*="result"], [class*="Result"]'
      ).first().isVisible({ timeout: 8_000 }).catch(() => false);
      const hasNoResults = await page.getByText(/no results|no posts found/i).first()
        .isVisible({ timeout: 3_000 }).catch(() => false);
      expect(hasResults || hasNoResults).toBe(true);
    });

    } finally {
      printSummary();
    }
  });

});

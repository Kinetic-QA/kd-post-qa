import { test, expect } from '@playwright/test';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher } from '../../helpers/common';
import { currentGeoFeatures } from '../../helpers/geo-features';
import { currentLocaleStrings } from '../../helpers/locale-strings';

/**
 * BI: Blog Sidebar
 * Scope: Blog sidebar menu — navigation links route correctly, the menu
 * closes via the hamburger/X toggle, and CTAs open the login/registration
 * widget.
 * Blog only exists for some GEOs (see helpers/geo-features.ts) — this
 * suite skips cleanly where it doesn't.
 * Reuses the same open/click/verify pattern as p2/sidebar-navigation.spec.ts
 * but scoped to blog-specific paths. NOT YET VERIFIED against live DOM —
 * blog sidebar may reuse the same SIDEBAR/HAMBURGER classes as the main
 * site or have its own; confirm live before trusting this in CI.
 */

const SIDEBAR = '[class*="MainMenu_main-menu"]';
const HAMBURGER = '[class*="hamburger"]';

test.describe('P3 - Blog Sidebar', () => {

  test.setTimeout(90_000);

  let geoFeatures: ReturnType<typeof currentGeoFeatures>;

  test.beforeEach(async ({ page }) => {
    geoFeatures = currentGeoFeatures();
    test.skip(!geoFeatures.hasBlog, `Blog does not exist for this GEO (${test.info().project.name})`);
    await setupCampaignPopupWatcher(page);
    await page.goto(geoFeatures.blogPath!);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000);
    await dismissCookieConsent(page);
    await dismissCampaignPopup(page);
    await page.waitForTimeout(500);
  });

  test('BI-01: Blog sidebar full flow', async ({ page }) => {
    test.setTimeout(90_000);

    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(45));
      console.log('  BI-01 BLOG SIDEBAR - RESULTS');
      console.log('═'.repeat(45));
      for (const r of results) {
        console.log(`  ${r.status === 'Pass' ? '✅' : '❌'}  ${r.label.padEnd(35)} ${r.status}`);
      }
      const passed = results.filter(r => r.status === 'Pass').length;
      const failed = results.filter(r => r.status === 'Fail').length;
      console.log('─'.repeat(45));
      console.log(`  Total: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}`);
      console.log('═'.repeat(45) + '\n');
    }
    async function runStep(label: string, fn: () => Promise<void>) {
      await test.step(label, async () => {
        try { await fn(); record(label, true); }
        catch (e) { record(label, false); throw e; }
      });
    }

    async function openSidebar() {
      await dismissCampaignPopup(page);
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        (el as HTMLElement | null)?.click();
      }, HAMBURGER);
      await page.waitForTimeout(800);
    }

    const strings = currentLocaleStrings();

    try {

    await runStep('Step 1: Links in the blog sidebar lead to expected destination pages', async () => {
      await openSidebar();
      // Category names aren't stable across GEOs — see blog-page.spec.ts's
      // Step 1 comment (ES has no "Bingo" category at all).
      const categoryHrefs = await page.locator(`${SIDEBAR} a[href*="/${geoFeatures.blogPath}"]`)
        .evaluateAll(els => els.map(a => a.getAttribute('href')).filter(Boolean) as string[]);
      const categoryHref = [...new Set(categoryHrefs)].find(h => {
        const path = h.split(geoFeatures.blogPath!)[1] ?? '';
        return path && !path.startsWith('search') && /^[a-z0-9-]+\/?$/.test(path);
      });
      if (!categoryHref) throw new Error('BI-01: no blog category link found in the sidebar');
      const categoryLink = page.locator(`${SIDEBAR} a[href="${categoryHref}"]`).first();
      await expect(categoryLink).toBeVisible({ timeout: 10_000 });
      await categoryLink.click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(new RegExp(categoryHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 10_000 });
    });

    await runStep('Step 2: "X" icon closes the sidebar menu', async () => {
      await page.goto(geoFeatures.blogPath!);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1_000);
      await dismissCampaignPopup(page);
      await openSidebar();
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        (el as HTMLElement | null)?.click();
      }, HAMBURGER);
      await page.waitForTimeout(500);
      const display = await page.locator('[class*="Overlay_overlay"]')
        .evaluate(el => window.getComputedStyle(el).display).catch(() => 'none');
      record('Sidebar closes on second hamburger/X click', display === 'none');
    });

    await runStep('Step 3: CTAs in blog sidebar open the login/registration widget', async () => {
      await openSidebar();
      const loginBtn = page.locator(SIDEBAR + ' button, ' + SIDEBAR + ' a').filter({ hasText: strings.loginButton }).first();
      await expect(loginBtn).toBeVisible({ timeout: 10_000 });
      await loginBtn.click();
      await page.waitForTimeout(1_500);
      await expect(page).toHaveURL(/#account/, { timeout: 10_000 });
    });

    } finally {
      printSummary();
    }
  });

});

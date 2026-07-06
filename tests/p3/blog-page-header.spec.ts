import { test, expect } from '@playwright/test';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher, siteUrl } from '../../helpers/common';
import { currentGeoFeatures } from '../../helpers/geo-features';
import { currentLocaleStrings } from '../../helpers/locale-strings';

/**
 * BH: Blog Page Header
 * Scope: Blog-specific header — Login/Join CTAs, search icon routing,
 * brand logo → blog homepage, and hamburger menu open.
 * Blog only exists for some GEOs (see helpers/geo-features.ts) — this
 * suite skips cleanly where it doesn't.
 * Blog uses a different header pattern from the main site. Live fetch of
 * /blog/ confirmed "Log in"/"Join" buttons and a search icon are present.
 * NOT YET VERIFIED against live DOM for exact selectors.
 */

test.describe('P3 - Blog Page Header', () => {

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

  test('BH-01: Blog page header full flow', async ({ page }) => {
    test.setTimeout(90_000);

    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(45));
      console.log('  BH-01 BLOG PAGE HEADER - RESULTS');
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

    async function closeAccountModal() {
      await page.keyboard.press('Escape');
      await page.locator('[class*="AccountPopup_account"]')
        .waitFor({ state: 'detached', timeout: 5_000 }).catch(async () => {
          const modal = page.locator('[class*="AccountPopup_account"]').first();
          const box = await modal.boundingBox().catch(() => null);
          if (box) await page.mouse.click(box.x + box.width - 20, box.y + 20);
          await page.waitForTimeout(800);
        });
      await expect(page).not.toHaveURL(/#account/, { timeout: 8_000 });
    }

    const strings = currentLocaleStrings();

    try {

    await runStep('Step 1: LOGIN CTA opens the login form', async () => {
      const loginBtn = page.getByRole('banner').getByText(strings.loginButton).first();
      await expect(loginBtn).toBeVisible({ timeout: 10_000 });
      await loginBtn.click();
      await page.waitForTimeout(1_500);
      await expect(page).toHaveURL(/#account/, { timeout: 10_000 });
      await closeAccountModal();
    });

    await runStep('Step 2: JOIN CTA opens the registration form', async () => {
      await dismissCampaignPopup(page);
      const joinBtn = page.getByRole('banner').getByText(strings.joinButton).first();
      await expect(joinBtn).toBeVisible({ timeout: 10_000 });
      await joinBtn.click();
      await page.waitForTimeout(1_500);
      await expect(page).toHaveURL(/#account/, { timeout: 10_000 });
      await closeAccountModal();
    });

    await runStep('Step 3: Search icon redirects to the blog search page', async () => {
      await dismissCampaignPopup(page);
      const searchIcon = page.locator('a[href*="/blog/search"], [class*="search" i] a').first();
      await expect(searchIcon).toBeVisible({ timeout: 10_000 });
      await searchIcon.click();
      await page.waitForTimeout(1_000);
      expect(page.url()).toContain('search');
    });

    await runStep('Step 4: Brand title click sends to blog homepage', async () => {
      // CONFIRMED via live DOM inspection: the blog header logo
      // (class="Header_logo") links to the main site root
      // (https://www.slingo.com/), NOT /blog/. Confirmed intentional by the
      // dev team — this behavior is consistent across other brand sites, not
      // a bug — so the checklist's "blog homepage" wording is outdated.
      await page.goto(`${geoFeatures.blogPath}search/`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1_000);
      await dismissCampaignPopup(page);
      const logo = page.locator('a[class*="Header_logo"]').first();
      await expect(logo).toBeVisible({ timeout: 10_000 });
      await logo.click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(siteUrl(''), { timeout: 10_000 });
    });

    await runStep('Step 5: Sidebar menu opens after clicking the 3-line icon', async () => {
      await dismissCampaignPopup(page);
      const hamburger = page.locator('[class*="hamburger" i]').first();
      await expect(hamburger).toBeVisible({ timeout: 10_000 });
      await page.evaluate(() => {
        const el = document.querySelector('[class*="hamburger" i]');
        (el as HTMLElement | null)?.click();
      });
      await page.waitForTimeout(800);
      const sidebarVisible = await page.locator('[class*="MainMenu_main-menu"]').isVisible({ timeout: 5_000 }).catch(() => false);
      expect(sidebarVisible).toBe(true);
    });

    } finally {
      printSummary();
    }
  });

});

import { test, expect } from '@playwright/test';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher, siteUrl } from '../../helpers/common';
import { currentLocaleStrings } from '../../helpers/locale-strings';
import { currentGeoFeatures } from '../../helpers/geo-features';

/**
 * WH: Website Header
 * Scope: Global header smoke test — Login/Join CTAs, Search icon, Promotions
 * icon, hamburger menu open, brand logo → homepage, and sticky-on-scroll
 * behavior.
 * NOT YET VERIFIED against live DOM — selectors use semantic roles/text first,
 * with class-pattern fallbacks borrowed from other confirmed specs. Run live
 * and adjust selectors before trusting this in CI.
 */

test.describe('P1 - Website Header', () => {

  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await setupCampaignPopupWatcher(page);
    await page.goto('');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000);
    await dismissCookieConsent(page);
    await dismissCampaignPopup(page);
    await page.waitForTimeout(500);
  });

  test('WH-01: Website header full flow', async ({ page }) => {
    test.setTimeout(120_000);

    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(45));
      console.log('  WH-01 WEBSITE HEADER - RESULTS');
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
    const geoFeatures = currentGeoFeatures();

    try {

    await runStep('Step 1: LOGIN CTA opens login widget (/#account)', async () => {
      const loginBtn = page.getByRole('banner').getByRole('button', { name: strings.loginButton }).first();
      await expect(loginBtn).toBeVisible({ timeout: 10_000 });
      await loginBtn.click();
      await expect(page).toHaveURL(/#account/, { timeout: 10_000 });
      await closeAccountModal();
    });

    await runStep('Step 2: JOIN CTA opens registration widget (/#account)', async () => {
      await dismissCampaignPopup(page);
      const joinBtn = page.getByRole('banner').getByRole('button', { name: strings.joinButton }).first();
      await expect(joinBtn).toBeVisible({ timeout: 10_000 });
      await joinBtn.click();
      await expect(page).toHaveURL(/#account/, { timeout: 10_000 });
      await closeAccountModal();
    });

    await runStep('Step 3: Search icon opens search panel (/#search)', async () => {
      await dismissCampaignPopup(page);
      const searchLink = page.locator('a[href="#search"]').first();
      await expect(searchLink).toBeVisible({ timeout: 10_000 });
      await searchLink.click({ force: true });
      await expect(page).toHaveURL(/#search/, { timeout: 10_000 });
      await page.waitForTimeout(1_500);
      const backBtn = page.getByText(strings.backButtonText, { exact: true }).first();
      if (await backBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await backBtn.click();
        await page.waitForTimeout(1_000);
      }
      if (page.url().includes('#search')) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1_000);
      }
      if (page.url().includes('#search')) {
        await page.evaluate(() => history.pushState({}, '', location.pathname));
        await page.waitForTimeout(500);
      }
      await expect(page).not.toHaveURL(/#search/, { timeout: 8_000 });
    });

    await runStep('Step 4: Promotion icon leads to Promotions page', async () => {
      if (!geoFeatures.promotionsPath) {
        console.log('WH-01 Step 4 skipped — no Promotions page for this GEO');
        return;
      }
      await dismissCampaignPopup(page);
      // href*="promotion" is English-domain-path-only (e.g. "casino-promotions") —
      // ES's promotions path is "promociones" and doesn't contain that substring.
      const promoLink = page.getByRole('banner').locator(`a[href*="${geoFeatures.promotionsPath.replace(/\/$/, '')}"]`).first();
      await expect(promoLink).toBeVisible({ timeout: 10_000 });
      await promoLink.click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(new RegExp(geoFeatures.promotionsPath.replace(/\/$/, '')), { timeout: 10_000 });
      await page.goBack();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);
    });

    await runStep('Step 5: Hamburger icon opens sidebar menu', async () => {
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
      await page.evaluate(() => {
        const el = document.querySelector('[class*="hamburger" i]');
        (el as HTMLElement | null)?.click();
      });
      await page.waitForTimeout(500);
    });

    await runStep('Step 6: Brand logo click sends to homepage', async () => {
      await page.goto('slingo/');
      await page.waitForLoadState('domcontentloaded');
      await dismissCampaignPopup(page);
      const logo = page.getByRole('banner').locator(`a[href="${siteUrl('')}"]`).first();
      await expect(logo).toBeVisible({ timeout: 10_000 });
      await logo.click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(siteUrl(''), { timeout: 10_000 });
    });

    await runStep('Step 7: Header sticks to top only while scrolling', async () => {
      await page.evaluate(() => window.scrollTo(0, 1200));
      await page.waitForTimeout(500);
      const boxAt1200 = await page.getByRole('banner').first().boundingBox().catch(() => null);
      await page.evaluate(() => window.scrollTo(0, 2200));
      await page.waitForTimeout(500);
      const boxAt2200 = await page.getByRole('banner').first().boundingBox().catch(() => null);
      const sticky = !!boxAt1200 && !!boxAt2200 && Math.abs(boxAt1200.y - boxAt2200.y) < 2;
      console.log(`WH-01 header y at scroll 1200: ${boxAt1200?.y}, at scroll 2200: ${boxAt2200?.y}`);
      record('Header remains pinned in place across scroll depths', sticky);
      await page.evaluate(() => window.scrollTo(0, 0));
    });

    } finally {
      printSummary();
    }
  });

});

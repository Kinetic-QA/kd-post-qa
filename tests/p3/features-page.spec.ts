import { test, expect } from '@playwright/test';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher, siteUrl, assertNoSiteError } from '../../helpers/common';
import { currentGeoFeatures } from '../../helpers/geo-features';

/**
 * FP: Features Page
 * Scope: "LEARN MORE" CTAs and inlinks route to the expected inner feature
 * pages. Entry point is via the sidebar menu (not a direct URL), matching
 * how a real user reaches this page.
 * Live fetch confirmed on /casino-features/: "LEARN MORE" CTAs to
 * daily-picks/, tournaments/, my-levels/, hot-cold/ inner pages.
 */

const HAMBURGER = '[class*="hamburger"]';
const SIDEBAR = '[class*="MainMenu_main-menu"]';

test.describe('P3 - Features Page', () => {

  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    const featuresPathCheck = currentGeoFeatures().featuresPath;
    test.skip(!featuresPathCheck, `Features page does not exist for this GEO (${test.info().project.name})`);
    await setupCampaignPopupWatcher(page);
    await page.goto('', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000);
    await dismissCookieConsent(page);
    await dismissCampaignPopup(page);
    await page.waitForTimeout(500);

    // Entry point: hamburger -> sidebar -> Features link (not a direct goto)
    const featuresPath = currentGeoFeatures().featuresPath ?? 'casino-features/';
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      (el as HTMLElement | null)?.click();
    }, HAMBURGER);
    await page.waitForTimeout(800);
    const featuresLink = page.locator(SIDEBAR + ` a[href*="/${featuresPath}"]`).first();
    await featuresLink.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1_000);
    await dismissCampaignPopup(page);
  });

  test('FP-01: Features page full flow', async ({ page }) => {
    test.setTimeout(90_000);

    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(45));
      console.log('  FP-01 FEATURES PAGE - RESULTS');
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
        try { await fn(); await assertNoSiteError(page); record(label, true); }
        catch (e) { record(label, false); throw e; }
      });
    }

    const featuresPath = currentGeoFeatures().featuresPath ?? 'casino-features/';

    try {

    // Features hub links have a slug after the features path (e.g. /daily-picks/);
    // exclude the umbrella page's own self-link so goBack()/re-navigation stays sane.
    const featureLink = () => page.locator(
      `a[href*="/${featuresPath}"]:not([href$="/${featuresPath}"]):not([href="${siteUrl(featuresPath)}"])`
    ).filter({ visible: true }).first();

    await runStep('Step 1: "LEARN MORE" CTA leads to expected features inner page', async () => {
      const learnMoreLink = featureLink();
      await expect(learnMoreLink).toBeVisible({ timeout: 10_000 });
      const href = await learnMoreLink.getAttribute('href') ?? '';
      await learnMoreLink.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2_000);
      expect(page.url()).toContain(href.replace(/^https?:\/\/[^/]+/, ''));
      await page.goto(featuresPath, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1_000);
      await dismissCampaignPopup(page);
    });

    await runStep('Step 2: Inlinks redirect to the expected destination page', async () => {
      const inlink = featureLink();
      await expect(inlink).toBeVisible({ timeout: 10_000 });
      const href = await inlink.getAttribute('href') ?? '';
      await inlink.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2_000);
      expect(page.url()).toContain(href.replace(/^https?:\/\/[^/]+/, ''));
    });

    } finally {
      printSummary();
    }
  });

});

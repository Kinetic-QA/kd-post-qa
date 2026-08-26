import { test, expect } from '../../helpers/stealth-fixtures';
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

const HAMBURGER = '[class*="hamburger"], #menu-X';
// Wrapped in :is() so `${SIDEBAR} a[...]` scopes to descendants of EITHER
// alternative — a bare comma-joined selector only binds the trailing
// combinator to the last branch, so on brands with no #top-nav (e.g.
// Slingo), `SIDEBAR + ' a[...]'` matched the whole <nav> container itself
// instead of any link inside it. Same root cause fixed in
// sidebar-navigation.spec.ts 2026-08-04 — see that file's comment.
const SIDEBAR = ':is([class*="MainMenu_main-menu"], #top-nav)';

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
      const expectedPath = href.replace(/^https?:\/\/[^/]+/, '');
      await learnMoreLink.click();
      // waitForURL, not waitForLoadState + a fixed timeout — confirmed live
      // 2026-08-26 on PC COM: this is a client-side navigation, so
      // waitForLoadState('domcontentloaded') can resolve against the
      // already-loaded hub page instead of the new one, leaving only a flat
      // 2s guess as the real wait. Flaky under normal latency variance
      // (failed first attempt still on /features/, passed on retry) —
      // waitForURL actually waits for the destination instead of guessing.
      await page.waitForURL(url => url.pathname.includes(expectedPath), { timeout: 10_000 });
      expect(page.url()).toContain(expectedPath);
      await page.goto(featuresPath, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1_000);
      // Confirmed live 2026-08-26 on PC COM: this full reload re-mounts
      // <son-cookie-consent>, same as beforeEach's initial navigation — only
      // re-dismissing the campaign popup here left it able to intercept
      // Step 2's click, causing Playwright's actionability retry to
      // eventually time out (a real, reproducible flake, not one-off
      // latency).
      await dismissCookieConsent(page);
      await dismissCampaignPopup(page);
    });

    await runStep('Step 2: Inlinks redirect to the expected destination page', async () => {
      const inlink = featureLink();
      await expect(inlink).toBeVisible({ timeout: 10_000 });
      const href = await inlink.getAttribute('href') ?? '';
      const expectedPath = href.replace(/^https?:\/\/[^/]+/, '');
      await inlink.click();
      await page.waitForURL(url => url.pathname.includes(expectedPath), { timeout: 10_000 });
      expect(page.url()).toContain(expectedPath);
    });

    } finally {
      printSummary();
    }
  });

});

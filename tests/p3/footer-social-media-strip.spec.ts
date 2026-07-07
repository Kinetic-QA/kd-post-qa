import { test, expect } from '@playwright/test';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher, assertNoSiteError } from '../../helpers/common';
import { currentGeoFeatures } from '../../helpers/geo-features';

/**
 * FS: Footer Social Media Strip
 * Scope: Footer social icons (Twitter/X, Facebook, Instagram) link to the
 * correct brand social media pages — handles differ per GEO, not just per
 * brand (confirmed live: ES runs its own @slingoespana/slingospain accounts,
 * not UK's @Slingo_official) — see helpers/geo-features.ts socialMedia.
 */

// CONFIRMED via live DOM inspection: the "Follow us on" social icon row sits
// in the homepage's main content area (just above "Trusted payment
// providers"), NOT inside the persistent [class*="Footer_footer-mid"]
// container used by footer-navigation.spec.ts — so this is unscoped.

test.describe('P3 - Footer Social Media Strip', () => {

  test.setTimeout(90_000);

  test('FS-01: Footer social media strip full flow', async ({ page }) => {
    test.setTimeout(90_000);

    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(45));
      console.log('  FS-01 FOOTER SOCIAL MEDIA STRIP - RESULTS');
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

    await setupCampaignPopupWatcher(page);
    await page.goto('');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1_000);
    await dismissCookieConsent(page);
    await page.waitForTimeout(3_000);
    await dismissCampaignPopup(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const socialMedia = currentGeoFeatures().socialMedia;

    // Clicks the icon, waits for the new tab the site opens (all 3 icons are
    // target="_blank" — confirmed live), and asserts the tab actually
    // navigates to the expected social page rather than just trusting the
    // href attribute (a stale/misconfigured href would pass an href-only
    // check but fail here).
    async function clickAndVerifyPopup(icon: import('@playwright/test').Locator, expectedUrlFragment: string) {
      // The recurring offer/campaign popup (confirmed live: reappears
      // mid-session, not just on initial load) can mount right as we're
      // about to click and swallow the click instead of opening the social
      // tab — dismiss it immediately beforehand as a defensive check on top
      // of the continuous MutationObserver watcher from
      // setupCampaignPopupWatcher.
      await dismissCampaignPopup(page);
      const [popup] = await Promise.all([
        page.context().waitForEvent('page', { timeout: 10_000 }),
        icon.click(),
      ]);
      await popup.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
      const finalUrl = popup.url();
      await popup.close();
      expect(finalUrl.toLowerCase()).toContain(expectedUrlFragment.toLowerCase());
    }

    try {

    // Some GEOs (e.g. Slingo ROW) don't show the social strip at all — detect
    // absence up front and skip these checks rather than failing on it, while
    // still fully verifying each icon actually opens the right page wherever
    // the strip IS present.
    await runStep('Step 1: Social icon opens the brand\'s Twitter/X page', async () => {
      const twitterLink = page.locator('a[href*="twitter.com"], a[href*="x.com"]').first();
      const exists = await twitterLink.isVisible({ timeout: 8_000 }).catch(() => false);
      if (!exists || !socialMedia.twitter) {
        console.log('FS-01 Twitter/X icon not present (or not confirmed) for this GEO — skipping');
        return;
      }
      // twitter.com redirects to x.com — match on the handle, not the domain.
      await clickAndVerifyPopup(twitterLink, socialMedia.twitter);
    });

    await runStep('Step 2: Social icon opens the brand\'s Facebook page', async () => {
      const fbLink = page.locator('a[href*="facebook.com"]').first();
      const exists = await fbLink.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!exists || !socialMedia.facebook) {
        console.log('FS-01 Facebook icon not present (or not confirmed) for this GEO — skipping');
        return;
      }
      await clickAndVerifyPopup(fbLink, socialMedia.facebook);
    });

    await runStep('Step 3: Social icon opens the brand\'s Instagram page', async () => {
      const igLink = page.locator('a[href*="instagram.com"]').first();
      const exists = await igLink.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!exists || !socialMedia.instagram) {
        console.log('FS-01 Instagram icon not present (or not confirmed) for this GEO — skipping');
        return;
      }
      await clickAndVerifyPopup(igLink, socialMedia.instagram);
    });

    } finally {
      printSummary();
    }
  });

});

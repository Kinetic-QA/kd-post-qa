import { test, expect } from '@playwright/test';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher } from '../../helpers/common';

/**
 * FS: Footer Social Media Strip
 * Scope: Footer social icons (Twitter/X, Facebook, Instagram) link to the
 * correct brand social media pages.
 * Live fetch of the homepage footer confirmed: Twitter -> twitter.com/Slingo_official,
 * Facebook -> facebook.com/SlingoCom/, Instagram -> instagram.com/slingoofficial/.
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
        try { await fn(); record(label, true); }
        catch (e) { record(label, false); throw e; }
      });
    }

    await setupCampaignPopupWatcher(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1_000);
    await dismissCookieConsent(page);
    await page.waitForTimeout(3_000);
    await dismissCampaignPopup(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    try {

    await runStep('Step 1: Social icon links direct to the brand\'s Twitter/X page', async () => {
      const twitterLink = page.locator('a[href*="twitter.com"]').first();
      await expect(twitterLink).toBeVisible({ timeout: 10_000 });
      const href = await twitterLink.getAttribute('href') ?? '';
      expect(href).toContain('twitter.com/Slingo_official');
    });

    await runStep('Step 2: Social icon links direct to the brand\'s Facebook page', async () => {
      const fbLink = page.locator('a[href*="facebook.com"]').first();
      await expect(fbLink).toBeVisible({ timeout: 10_000 });
      const href = await fbLink.getAttribute('href') ?? '';
      expect(href).toContain('facebook.com/SlingoCom');
    });

    await runStep('Step 3: Social icon links direct to the brand\'s Instagram page', async () => {
      const igLink = page.locator('a[href*="instagram.com"]').first();
      await expect(igLink).toBeVisible({ timeout: 10_000 });
      const href = await igLink.getAttribute('href') ?? '';
      expect(href).toContain('instagram.com/slingoofficial');
    });

    } finally {
      printSummary();
    }
  });

});

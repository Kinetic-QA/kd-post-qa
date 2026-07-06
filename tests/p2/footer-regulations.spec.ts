import { test, expect } from '@playwright/test';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher } from '../../helpers/common';

/**
 * FR: Footer Regulations
 * Scope: Footer regulation/compliance icons are present, and the
 * Responsible Gaming icon/link routes to its expected page.
 * Live fetch confirmed /responsible-gaming/, /bonus-policy/, /terms/,
 * /privacy/, /information-security-statement/ as footer policy links, but
 * did NOT surface distinct regulation-body icons (18+, GamCare, MGA badge,
 * Gamstop) in the static fetch — those are likely image-only links that
 * need live DOM inspection to pin down exact selectors.
 */

const FOOTER = '[class*="Footer_footer-mid"]';

test.describe('P2 - Footer Regulations', () => {

  test.setTimeout(90_000);

  test('FR-01: Regulation icons redirect to expected regulation pages', async ({ page }) => {

    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(45));
      console.log('  FR-01 FOOTER REGULATIONS - RESULTS');
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

    await setupCampaignPopupWatcher(page);
    await page.goto('');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1_000);
    await dismissCookieConsent(page);
    await page.waitForTimeout(3_000);
    await dismissCampaignPopup(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    try {

    await test.step('Step 1: Regulation icon row is visible in footer', async () => {
      const regIcons = page.locator(FOOTER + ' img, [class*="regulation" i], [class*="license" i]');
      const count = await regIcons.count();
      record('Regulation icons present in footer', count > 0);
      console.log('FR-01 candidate regulation icon elements: ' + count);
      expect(count).toBeGreaterThan(0);
    });

    await test.step('Step 2: Responsible Gaming link/icon opens the regulation page', async () => {
      const link = page.locator(FOOTER + ' a[href*="/responsible-gaming/"]').first();
      await expect(link).toBeVisible({ timeout: 10_000 });
      await link.click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(/\/responsible-gaming\//, { timeout: 10_000 });
      record('Responsible Gaming link routes to expected page', true);
    });

    } finally {
      printSummary();
    }
  });

});

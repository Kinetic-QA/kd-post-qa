import { test, expect } from '@playwright/test';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher } from '../../helpers/common';

/**
 * PM: Payment Method Strip
 * Scope: Payment provider logos are visible on the Payment Methods page,
 * and the PayPal / Visa-Mastercard logos redirect to their expected
 * provider pages.
 * Live fetch confirmed on /payment-methods/: Visa/Mastercard -> /payment-methods/visa-mastercard/,
 * Paysafecard -> /payment-methods/paysafecard/, PayPal -> /payment-methods/paypal/,
 * Trustly Direct -> /payment-methods/trustly-direct/. Apple Pay is image-only, no link.
 */

test.describe('P3 - Payment Method Strip', () => {

  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await setupCampaignPopupWatcher(page);
    await page.goto('/payment-methods/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000);
    await dismissCookieConsent(page);
    await dismissCampaignPopup(page);
    await page.waitForTimeout(500);
  });

  test('PM-01: Payment method strip full flow', async ({ page }) => {
    test.setTimeout(90_000);

    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(45));
      console.log('  PM-01 PAYMENT METHOD STRIP - RESULTS');
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

    try {

    await runStep('Step 1: Payment provider logos are displayed', async () => {
      const logos = page.locator('a[href*="/payment-methods/"] img, img[alt*="pay" i]');
      const count = await logos.count();
      expect(count).toBeGreaterThan(0);
      console.log('PM-01 payment logos found: ' + count);
    });

    await runStep('Step 2: PayPal logo redirects to the PayPal payment methods page', async () => {
      const paypalLink = page.locator('a[href*="/payment-methods/paypal/"]').first();
      await expect(paypalLink).toBeVisible({ timeout: 10_000 });
      await paypalLink.click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(/\/payment-methods\/paypal\//, { timeout: 10_000 });
      await page.goBack();
      await page.waitForLoadState('domcontentloaded');
    });

    await runStep('Step 3: Visa/Mastercard logo redirects to the expected page', async () => {
      await dismissCampaignPopup(page);
      const vmLink = page.locator('a[href*="/payment-methods/visa-mastercard/"]').first();
      await expect(vmLink).toBeVisible({ timeout: 10_000 });
      await vmLink.click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(/\/payment-methods\/visa-mastercard\//, { timeout: 10_000 });
    });

    } finally {
      printSummary();
    }
  });

});

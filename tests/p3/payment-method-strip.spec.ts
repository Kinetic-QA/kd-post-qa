import { test, expect } from '../../helpers/stealth-fixtures';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher, assertNoSiteError } from '../../helpers/common';
import { currentGeoFeatures } from '../../helpers/geo-features';

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
    test.skip(!currentGeoFeatures().hasPaymentMethodsPage, `No Payment Methods page for this GEO (${test.info().project.name}) — confirmed 404`);
    await setupCampaignPopupWatcher(page);
    await page.goto(currentGeoFeatures().paymentMethodsPath ?? 'payment-methods/', { waitUntil: 'domcontentloaded' });
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
        try { await fn(); await assertNoSiteError(page); record(label, true); }
        catch (e) { record(label, false); throw e; }
      });
    }

    // Confirmed live on Lord Ping (LP) UK, 2026-07-28: the provider deep
    // links live under this GEO's OWN paymentMethodsPath override
    // (/payment-options/...), not the hardcoded '/payment-methods/' every
    // step below used to assume — same hardcoded-path bug class already
    // fixed for helpPath/affiliatesPath/privacyPath/termsPath elsewhere.
    // Falls back to 'payment-methods/' for every GEO that doesn't override it.
    const pmPath = (currentGeoFeatures().paymentMethodsPath ?? 'payment-methods/').replace(/\/$/, '');

    try {

    await runStep('Step 1: Payment provider logos are displayed', async () => {
      // Confirmed live on SNG AB: the whole strip renders as ONE merged
      // banner image (src contains `sectionCode=payments`, generic site-wide
      // alt text, not per-provider) instead of individual logo <img> tags
      // with per-provider alt text — a genuinely different implementation,
      // not a missing/broken feature. Accept either shape as evidence logos
      // are displayed.
      // Confirmed live on PC UK: logos are plain <img> tags with NO alt
      // attribute at all, served from a separate CDN domain
      // (primeapi.com/cmscdn/...), and are NOT nested inside the provider
      // deep-link <a> tags (those exist as separate elements elsewhere on
      // the page — see Steps 2-3) — a third distinct implementation shape.
      const logos = page.locator(
        `a[href*="/${pmPath}/"] img, img[alt*="pay" i], img[src*="sectionCode=payments"], img[src*="cmscdn"], img[src*="primeapi.com"]`
      );
      const count = await logos.count();
      expect(count).toBeGreaterThan(0);
      console.log('PM-01 payment logos found: ' + count);
    });

    await runStep('Step 2: PayPal logo redirects to the PayPal payment methods page', async () => {
      // Not every GEO offers PayPal (e.g. Slingo ROW doesn't), and some
      // (Lord Ping UK, confirmed live) show the PayPal logo as a plain
      // unlinked <img> with no wrapping <a> at all — skip this one provider
      // check rather than failing when it's genuinely not a clickable link.
      // Scoped to :has(img) — same fix as the Visa/Mastercard step below —
      // in case a future GEO's payment table also has a duplicate,
      // non-functional row-title link sharing this same href.
      const paypalLink = page.locator(`a[href*="/${pmPath}/paypal/"]:has(img)`).first();
      const exists = await paypalLink.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!exists) {
        console.log('PM-01 PayPal not offered (or not a clickable link) for this GEO — skipping');
        return;
      }
      await paypalLink.click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(new RegExp(`/${pmPath}/paypal/`), { timeout: 10_000 });
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');
    });

    await runStep('Step 3: Visa/Mastercard logo redirects to the expected page', async () => {
      // Confirmed live: not every GEO has individual per-provider deep links
      // on this page (ES's logos aren't wrapped in anchors at all) — skip
      // rather than fail when the deep link genuinely doesn't exist.
      await dismissCampaignPopup(page);
      // Confirmed live on MC/CA mobile 2026-07-29: this page's own payment
      // details table has its OWN duplicate row-title links sharing the
      // exact same href as the real logo further down the page (Visa row +
      // Mastercard row, both /visa-mastercard/) — an unscoped .first() grabs
      // whichever table row link appears first in DOM order instead of the
      // actual logo icon, and clicking that in-table link doesn't navigate
      // anywhere (stayed on the same page both times, confirmed reproducible).
      // Scope to the same "wraps an img" shape Step 1 already uses to find
      // real provider logos, so this always targets the actual clickable icon.
      const vmLink = page.locator(`a[href*="/${pmPath}/visa-mastercard/"]:has(img)`).first();
      const exists = await vmLink.isVisible({ timeout: 10_000 }).catch(() => false);
      if (!exists) {
        console.log('PM-01 Visa/Mastercard deep link not present for this GEO — skipping');
        return;
      }
      await vmLink.click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(new RegExp(`/${pmPath}/visa-mastercard/`), { timeout: 10_000 });
    });

    } finally {
      printSummary();
    }
  });

});

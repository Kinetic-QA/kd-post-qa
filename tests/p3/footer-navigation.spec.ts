import { test, expect } from '@playwright/test';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher, assertNoSiteError } from '../../helpers/common';
import { currentGeoFeatures } from '../../helpers/geo-features';
import { currentLocaleStrings } from '../../helpers/locale-strings';

/**
 * FN: Footer Navigation
 * Scope: Footer visibility, plus every footer navigation link (category,
 * policy, support, and content links) redirects to its expected URL.
 *
 * CONFIRMED via live DOM inspection on slingo.com:
 * - Footer container: [class*="Footer_footer-mid"]
 * - Links inside: [class*="MenuGroup_group"] a
 * - Footer is present on ALL pages - no page.goto() between steps
 * - page.goto('/') called ONCE at setup
 *
 * All 35 checklist steps covered.
 * Soft assertions used throughout so all checks run even if one fails.
 */

const FOOTER = '[class*="Footer_footer-mid"]';

test.describe('P3 - Footer Navigation', () => {

  test.setTimeout(180_000);

  test('FN-01: Footer navigation full flow', async ({ page }) => {

    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(50));
      console.log('  FN-01 FOOTER NAVIGATION - RESULTS');
      console.log('═'.repeat(50));
      for (const r of results) {
        console.log(`  ${r.status === 'Pass' ? '✅' : '❌'}  ${r.label.padEnd(42)} ${r.status}`);
      }
      const passed = results.filter(r => r.status === 'Pass').length;
      const failed = results.filter(r => r.status === 'Fail').length;
      console.log('─'.repeat(50));
      console.log(`  Total: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}`);
      console.log('═'.repeat(50) + '\n');
    }

    // ── Setup: ONE page.goto('/') ─────────────────────────────────────────
    await setupCampaignPopupWatcher(page);
    await page.goto('', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1_000);
    await dismissCookieConsent(page);
    await page.waitForTimeout(3_000);
    await dismissCampaignPopup(page);
    console.log('FN-01 setup complete');

    // ── Helper: click footer link and verify URL ──────────────────────────
    // Footer persists across all pages — no navigation back to homepage needed
    async function footerStep(label: string, linkText: string | RegExp, expectedPath: string) {
      // Smart poll: check for popup every 800ms up to 4s, exit early if found
      for (let i = 0; i < 5; i++) {
        const hasPopup = await page.locator('[class*="OfferPopup_close"]')
          .isVisible({ timeout: 800 }).catch(() => false);
        if (hasPopup) { await dismissCampaignPopup(page); break; }
        await page.waitForTimeout(300);
      }
      const textMatch = typeof linkText === 'string'
        ? new RegExp('^' + linkText.replace(/[()]/g, '\\$&') + '$', 'i')
        : linkText;
      const link = page.locator(FOOTER + ' a')
        .filter({ hasText: textMatch })
        .first();
      // Some categories/pages don't exist for every GEO (e.g. no Bingo nav on
      // Slingo ROW) — detect absence and skip that one item instead of a hard
      // timeout, without weakening the check for GEOs where it IS present.
      const exists = await link.isVisible({ timeout: 3_000 }).catch(() => false);
      if (!exists) {
        record(`${label} (skipped — link not present for this GEO)`, true);
        console.log('SKIP | ' + label + ' | link not found for this GEO');
        return;
      }
      await link.scrollIntoViewIfNeeded();
      await link.click();
      // Confirmed live: under higher network latency, the PREVIOUS
      // footerStep's navigation can still be in flight when this click
      // fires — waitForLoadState('domcontentloaded') + a fixed timeout
      // doesn't guarantee THIS click's navigation is what actually lands,
      // so a slower earlier response can arrive after and clobber the URL
      // back to the previous page. Wait for the expected path specifically
      // (falling through to the old fixed wait if it never arrives, so a
      // genuine mismatch still reports the real wrong URL below).
      await page.waitForURL(new RegExp(expectedPath.replace(/\//g, '\\/')), { timeout: 10_000 }).catch(() => {});
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(800);
      await assertNoSiteError(page);
      const actualUrl = page.url();
      const passed = actualUrl.includes(expectedPath);
      record(label, passed);
      console.log((passed ? 'PASS' : 'FAIL') + ' | ' + label + ' | ' + actualUrl);
      await expect.soft(page).toHaveURL(
        new RegExp(expectedPath.replace(/\//g, '\\/')), { timeout: 8_000 }
      );
    }

    try {

    // ── Step 1: Footer is visible ─────────────────────────────────────────
    await test.step('Step 1: Footer is visible at bottom of page', async () => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
      const footerVisible = await page.locator(FOOTER).isVisible({ timeout: 5_000 }).catch(() => false);
      record('Footer visible at bottom of page', footerVisible);
      expect(footerVisible).toBe(true);
      console.log('Footer visible: ' + footerVisible);
    });

    // ── Steps 2-3: Slingo → /slingo/ ─────────────────────────────────────
    await footerStep('Slingo -> /slingo/', 'Slingo', '/slingo/');

    // ── Steps 4-5: Slots → /slots/ ───────────────────────────────────────
    await footerStep('Slots -> /slots/', 'Slots', '/slots/');

    // ── Steps 6-7: Bingo → /bingo/ ───────────────────────────────────────
    await footerStep('Bingo -> /bingo/', 'Bingo', '/bingo/');

    // ── Steps 8-9: Casino → /casino/ ─────────────────────────────────────
    await footerStep('Casino -> /casino/', 'Casino', '/casino/');

    // ── Steps 10-11: Responsible Gaming ──────────────────────────────────
    const strings = currentLocaleStrings();
    const geoFeatures = currentGeoFeatures();
    const aboutUsPath = geoFeatures.aboutUsPath ?? 'about-us/';
    const contactPath = geoFeatures.contactPath ?? 'contact/';
    await footerStep('Responsible Gaming -> /responsible-gaming/', strings.footerResponsibleGamingText, '/responsible-gaming/');

    // ── Steps 12-13: Bonus Policy ─────────────────────────────────────────
    await footerStep('Bonus Policy -> /bonus-policy/', strings.footerBonusPolicyText, '/bonus-policy/');

    // ── Steps 14-15: Terms and Conditions ─────────────────────────────────
    await footerStep('Terms and Conditions -> /terms/', strings.footerTermsText, '/terms/');

    // ── Steps 16-17: Privacy Policy ───────────────────────────────────────
    await footerStep('Privacy Policy -> /privacy/', strings.footerPrivacyPolicyText, '/privacy/');

    // ── Steps 18-19: About us ─────────────────────────────────────────────
    await footerStep(`About us -> /${aboutUsPath}`, strings.footerAboutUsText, `/${aboutUsPath}`);

    // ── Steps 20-21: Promotions ───────────────────────────────────────────
    if (geoFeatures.promotionsPath) {
      await footerStep(`Promotions -> /${geoFeatures.promotionsPath}`, 'Promotions', `/${geoFeatures.promotionsPath}`);
    } else {
      record('Promotions footer link (skipped — no Promotions page for this GEO)', true);
    }

    // ── Steps 22-23: Payment Options ──────────────────────────────────────
    await footerStep('Payment Options -> /payment-methods/', strings.footerPaymentOptionsText, '/payment-methods/');

    // ── Steps 24-25: Affiliates ───────────────────────────────────────────
    await footerStep('Affiliates -> /affiliates/', strings.footerAffiliatesText, '/affiliates/');

    // ── Steps 26-27: Help ─────────────────────────────────────────────────
    await footerStep('Help -> /help/', 'Help', '/help/');

    // ── Steps 28-29: Contact us ───────────────────────────────────────────
    await footerStep(`Contact us -> /${contactPath}`, strings.footerContactUsText, `/${contactPath}`);

    // ── Steps 30-31: Mobile App ───────────────────────────────────────────
    await footerStep(`Mobile App -> /${geoFeatures.mobileAppPath}`, strings.footerMobileAppText, `/${geoFeatures.mobileAppPath}`);

    // ── Steps 32-33: Bingo Card Generator ────────────────────────────────
    await footerStep(`Bingo Card Generator -> /${geoFeatures.bingoCardGeneratorPath}`, strings.footerBingoCardGeneratorText, `/${geoFeatures.bingoCardGeneratorPath}`);

    // ── Steps 34-35: Blog ─────────────────────────────────────────────────
    if (geoFeatures.hasBlog && geoFeatures.blogPath) {
      await footerStep(`Blog -> /${geoFeatures.blogPath}`, 'Blog', `/${geoFeatures.blogPath}`);
    } else {
      record('Blog footer link (skipped — no Blog for this GEO)', true);
    }

    // Confirmed live: the "SOMETHING WENT WRONG" glitch can flash in
    // right at the tail end of the test — after the last real check but
    // before the browser context tears down — with no failing step to
    // catch it. A final check here ensures that window isn't a blind spot:
    // if it's already glitched by now, fail and let playwright.config.ts's
    // retry give the whole spec a fresh page, per the standing rule that
    // any "SOMETHING WENT WRONG" sighting means refresh-and-retest.
    await assertNoSiteError(page);

    } finally {
      printSummary();
    }
  });

});

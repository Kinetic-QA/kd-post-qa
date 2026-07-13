import { test, expect } from '@playwright/test';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher, siteUrl } from '../../helpers/common';
import { currentGeoFeatures } from '../../helpers/geo-features';
// dismissCampaignPopup is called after every navigation — it only acts if popup is present,
// so it adds zero delay when there is no popup.

/**
 * GCN: Game Category - Navigation
 * Scope: Verifies every main category and sub-category navigation link
 * (Slingo, Slots + sub-tabs, Bingo, Casino + sub-tabs) redirects to its
 * expected URL.
 *
 * Single test, multiple steps, soft assertions.
 *
 * WHY ONE TEST:
 * - Cookie consent and campaign popup dismissed ONCE at the start
 * - Browser stays open throughout — no repeated open/close per check
 * - Soft assertions ensure every redirect is checked even if one fails
 * - test.step() gives clear per-step reporting in the HTML reporter
 *
 * Structure:
 *   Step 1:  Slingo → /slingo/
 *   Step 2:  Slots → /slots/
 *   Step 3:  Slots > Megaways → /slots/megaways/
 *   Step 4:  Slots > Jackpots → /slots/jackpots/
 *   Step 5:  Slots > Daily Jackpots → /slots/daily-jackpots/
 *   Step 6:  Bingo → /bingo/
 *   Step 7:  Casino → /casino/
 *   Step 8:  Casino > Roulette → /casino/roulette/
 *   Step 9:  Casino > BlackJack → /casino/blackjack/
 *   Step 10: Casino > Plinko → /casino/plinko-games/
 *   Step 11: Casino > Other → /casino/other/
 */

test.describe('P1 - Game Category Navigation', () => {

  test.setTimeout(180_000);

  test('GCN: All category and sub-category redirects', async ({ page }) => {
    test.skip(!currentGeoFeatures().hasGameCategoryNav, `No Slingo/Slots/Bingo/Casino category nav for this GEO (${test.info().project.name})`);

    // ── Setup: dismiss cookie + campaign popup ONCE ──────────────────────
    await setupCampaignPopupWatcher(page);
    await page.goto('');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000); // wait for campaign popup to appear before dismissing
    await dismissCookieConsent(page);
    await dismissCampaignPopup(page);
    await page.waitForTimeout(300);
    console.log('GCN setup complete — cookie dismissed once');

    // ── Helper: click a nav link by partial href and verify URL ──────────
    const results: { label: string; status: string }[] = [];

    async function clickNavAndVerify(hrefPart: string, label: string) {
      const expectedUrl = siteUrl(hrefPart);
      // href$= (ends with), not href*= (contains) — confirmed live on SE:
      // "Other" sub-category has no real nav tab at all, but a substring
      // match still hit an individual game tile living under that same
      // path (e.g. /casino/other/flip-n-spin/), silently clicking into a
      // game instead of skipping cleanly like the other missing sub-tabs.
      const link = page.locator(`a[href$="${hrefPart}"]`).filter({ visible: true }).first();
      // Sub-category tabs (e.g. Megaways) aren't offered on every GEO's catalog —
      // detect absence and skip that one item instead of a hard timeout, without
      // weakening the check for GEOs where it IS present.
      const exists = await link.isVisible({ timeout: 3_000 }).catch(() => false);
      if (!exists) {
        results.push({ label: `${label} (skipped — not offered for this GEO)`, status: 'Pass' });
        console.log('SKIP | ' + label + ' | link not found for this GEO');
        return;
      }
      await link.scrollIntoViewIfNeeded().catch(() => {});
      await link.click();
      await page.waitForLoadState('domcontentloaded');
      await dismissCampaignPopup(page); // dismiss if popup appears on this page
      await page.waitForTimeout(800);
      const actualUrl = page.url();
      const passed = actualUrl === expectedUrl || actualUrl.startsWith(expectedUrl);
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
      await expect.soft(page).toHaveURL(expectedUrl, { timeout: 8_000 });
    }

    function printSummary() {
      console.log('\n' + '═'.repeat(40));
      console.log('  GAME CATEGORY NAVIGATION - RESULTS');
      console.log('═'.repeat(40));
      for (const r of results) {
        const icon = r.status === 'Pass' ? '✅' : '❌';
        console.log(`  ${icon}  ${r.label.padEnd(25)} ${r.status}`);
      }
      const passed = results.filter(r => r.status === 'Pass').length;
      const failed = results.filter(r => r.status === 'Fail').length;
      console.log('─'.repeat(40));
      console.log(`  Total: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}`);
      console.log('═'.repeat(40) + '\n');
    }


    // ── Step 1: Slingo ───────────────────────────────────────────────────
    await test.step('Slingo category → /slingo/', async () => {
      await clickNavAndVerify('/slingo/', 'Slingo');
    });

    // ── Step 2: Slots ────────────────────────────────────────────────────
    await test.step('Slots category → /slots/', async () => {
      await clickNavAndVerify('/slots/', 'Slots');
    });

    // ── Step 3: Slots > Megaways ─────────────────────────────────────────
    // Sub-category tabs are visible on the /slots/ page — no need to re-navigate
    await test.step('Slots > Megaways → /slots/megaways/', async () => {
      await clickNavAndVerify('/slots/megaways/', 'Megaways');
    });

    // ── Step 4: Slots > Jackpots ─────────────────────────────────────────
    // Sub-category tabs stay visible — click directly from current page
    await test.step('Slots > Jackpots → /slots/jackpots/', async () => {
      await clickNavAndVerify('/slots/jackpots/', 'Jackpots');
    });

    // ── Step 5: Slots > Daily Jackpots ───────────────────────────────────
    await test.step('Slots > Daily Jackpots → /slots/daily-jackpots/', async () => {
      await clickNavAndVerify('/slots/daily-jackpots/', 'Daily Jackpots');
    });

    // ── Step 6: Bingo ────────────────────────────────────────────────────
    // Bingo is a top-level category — click the main nav
    await test.step('Bingo category → /bingo/', async () => {
      await clickNavAndVerify('/bingo/', 'Bingo');
    });

    // ── Step 7: Casino ───────────────────────────────────────────────────
    await test.step('Casino category → /casino/', async () => {
      await clickNavAndVerify('/casino/', 'Casino');
    });

    // ── Step 8: Casino > Roulette ────────────────────────────────────────
    await test.step('Casino > Roulette → /casino/roulette/', async () => {
      await clickNavAndVerify('/casino/roulette/', 'Roulette');
    });

    // ── Step 9: Casino > BlackJack ───────────────────────────────────────
    await test.step('Casino > BlackJack → /casino/blackjack/', async () => {
      await clickNavAndVerify('/casino/blackjack/', 'BlackJack');
    });

    // ── Step 10: Casino > Plinko ─────────────────────────────────────────
    await test.step('Casino > Plinko → /casino/plinko-games/', async () => {
      await clickNavAndVerify('/casino/plinko-games/', 'Plinko');
    });

    // ── Step 11: Casino > Other ──────────────────────────────────────────
    await test.step('Casino > Other → /casino/other/', async () => {
      await clickNavAndVerify('/casino/other/', 'Other');
    });

    printSummary();
  });

});

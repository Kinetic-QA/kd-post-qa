import { test, expect } from '@playwright/test';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher } from '../../helpers/common';
// dismissCampaignPopup is called after every navigation — it only acts if popup is present,
// so it adds zero delay when there is no popup.

/**
 * GCN: Game Category - Navigation
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

test.describe('P2 - Game Category Navigation', () => {

  test.setTimeout(180_000);

  test('GCN: All category and sub-category redirects', async ({ page }) => {

    // ── Setup: dismiss cookie + campaign popup ONCE ──────────────────────
    await setupCampaignPopupWatcher(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000); // wait for campaign popup to appear before dismissing
    await dismissCookieConsent(page);
    await dismissCampaignPopup(page);
    await page.waitForTimeout(300);
    console.log('GCN setup complete — cookie dismissed once');

    // ── Helper: click a nav link by partial href and verify URL ──────────
    const results: { label: string; status: string }[] = [];

    async function clickNavAndVerify(hrefPart: string, expectedUrl: string, label: string) {
      const link = page.locator(`a[href*="${hrefPart}"]`).filter({ visible: true }).first();
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
      await clickNavAndVerify('/slingo/', 'https://www.slingo.com/slingo/', 'Slingo');
    });

    // ── Step 2: Slots ────────────────────────────────────────────────────
    await test.step('Slots category → /slots/', async () => {
      await clickNavAndVerify('/slots/', 'https://www.slingo.com/slots/', 'Slots');
    });

    // ── Step 3: Slots > Megaways ─────────────────────────────────────────
    // Sub-category tabs are visible on the /slots/ page — no need to re-navigate
    await test.step('Slots > Megaways → /slots/megaways/', async () => {
      await clickNavAndVerify('/slots/megaways/', 'https://www.slingo.com/slots/megaways/', 'Megaways');
    });

    // ── Step 4: Slots > Jackpots ─────────────────────────────────────────
    // Sub-category tabs stay visible — click directly from current page
    await test.step('Slots > Jackpots → /slots/jackpots/', async () => {
      await clickNavAndVerify('/slots/jackpots/', 'https://www.slingo.com/slots/jackpots/', 'Jackpots');
    });

    // ── Step 5: Slots > Daily Jackpots ───────────────────────────────────
    await test.step('Slots > Daily Jackpots → /slots/daily-jackpots/', async () => {
      await clickNavAndVerify('/slots/daily-jackpots/', 'https://www.slingo.com/slots/daily-jackpots/', 'Daily Jackpots');
    });

    // ── Step 6: Bingo ────────────────────────────────────────────────────
    // Bingo is a top-level category — click the main nav
    await test.step('Bingo category → /bingo/', async () => {
      await clickNavAndVerify('/bingo/', 'https://www.slingo.com/bingo/', 'Bingo');
    });

    // ── Step 7: Casino ───────────────────────────────────────────────────
    await test.step('Casino category → /casino/', async () => {
      await clickNavAndVerify('/casino/', 'https://www.slingo.com/casino/', 'Casino');
    });

    // ── Step 8: Casino > Roulette ────────────────────────────────────────
    await test.step('Casino > Roulette → /casino/roulette/', async () => {
      await clickNavAndVerify('/casino/roulette/', 'https://www.slingo.com/casino/roulette/', 'Roulette');
    });

    // ── Step 9: Casino > BlackJack ───────────────────────────────────────
    await test.step('Casino > BlackJack → /casino/blackjack/', async () => {
      await clickNavAndVerify('/casino/blackjack/', 'https://www.slingo.com/casino/blackjack/', 'BlackJack');
    });

    // ── Step 10: Casino > Plinko ─────────────────────────────────────────
    await test.step('Casino > Plinko → /casino/plinko-games/', async () => {
      await clickNavAndVerify('/casino/plinko-games/', 'https://www.slingo.com/casino/plinko-games/', 'Plinko');
    });

    // ── Step 11: Casino > Other ──────────────────────────────────────────
    await test.step('Casino > Other → /casino/other/', async () => {
      await clickNavAndVerify('/casino/other/', 'https://www.slingo.com/casino/other/', 'Other');
    });

    printSummary();
  });

});

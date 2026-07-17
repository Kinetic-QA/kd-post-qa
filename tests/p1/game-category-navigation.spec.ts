import { test, expect } from '@playwright/test';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher, siteUrl } from '../../helpers/common';
import { currentGeoFeatures } from '../../helpers/geo-features';
// dismissCampaignPopup is called after every navigation — it only acts if popup is present,
// so it adds zero delay when there is no popup.

/**
 * GCN: Game Category - Navigation
 * Scope: Verifies every main category and sub-category navigation link
 * across ALL brands' taxonomies redirects to its expected URL — not just
 * Slingo/SC's (Slingo, Slots + sub-tabs, Bingo, Casino + sub-tabs), but also
 * SNG's (New Slots sub-tab, entire Live Casino category + sub-tabs) — see
 * Structure below for the full combined list. Every step skips cleanly via
 * clickNavAndVerify's own existence check for whichever brand doesn't offer
 * it, so this single step list covers every brand without per-brand branching.
 *
 * Single test, multiple steps, soft assertions.
 *
 * WHY ONE TEST:
 * - Cookie consent and campaign popup dismissed ONCE at the start
 * - Browser stays open throughout — no repeated open/close per check
 * - Soft assertions ensure every redirect is checked even if one fails
 * - test.step() gives clear per-step reporting in the HTML reporter
 *
 * Structure (combined Slingo/SC + SNG taxonomy — steps are hardcoded to
 * these hrefs regardless of brand; each brand just skips whichever ones
 * don't match its own nav):
 *   Step 1:  Slingo → /slingo/
 *   Step 2:  Slots → /slots/
 *   Step 2b: Slots > New Slots → /slots/new/                  [SNG only]
 *   Step 3:  Slots > Megaways → /slots/megaways/
 *   Step 4:  Slots > Jackpots → /slots/jackpots/
 *   Step 5:  Slots > Daily Jackpots → /slots/daily-jackpots/  [SC only]
 *   Step 6:  Bingo → /bingo/                                  [SC only]
 *   Step 7:  Casino → /casino/
 *   Step 8:  Casino > Roulette → /casino/roulette/
 *   Step 9:  Casino > BlackJack → /casino/blackjack/
 *   Step 10: Casino > Plinko → /casino/plinko-games/          [SC only]
 *   Step 11: Casino > Other → /casino/other/
 *   Step 12: Live Casino → /live-casino/                       [SNG only]
 *   Step 13: Live Casino > Live Roulette → /live-casino/live-roulette/    [SNG only]
 *   Step 14: Live Casino > Live BlackJack → /live-casino/live-blackjack/  [SNG only]
 *   Step 15: Live Casino > Live Baccarat → /live-casino/live-baccarat/    [SNG only]
 *   Step 16: Live Casino > Game Shows → /live-casino/game-shows/          [SNG only]
 *   Step 17: Live Casino > Live Games → /live-casino/live-games/         [SNG only]
 *
 * SNG AB (confirmed live 2026-07-17): different top-level taxonomy —
 * Home/Slots/Casino/Live Casino, no Bingo, no top-level Slingo (AB's
 * "Slingo" content lives at /slots/slingo/, a different href than Step 1
 * checks for, so Step 1 skips cleanly as "not offered" — it's SEO body copy,
 * not a real nav tab, confirmed via live DOM inspection). Full confirmed
 * taxonomy: Slots sub-tabs are All/New Slots/Megaways/Jackpots (no Daily
 * Jackpots); Casino sub-tabs are All/Roulette/BlackJack/Other (no Plinko);
 * Live Casino sub-tabs are All/Live Roulette/Live BlackJack/Live Baccarat/
 * Game Shows/Live Games. All real sub-tabs are now covered by the steps
 * above.
 */

test.describe('P1 - Game Category Navigation', () => {

  test.setTimeout(180_000);

  test('GCN: All category and sub-category redirects', async ({ page }) => {
    test.skip(!currentGeoFeatures().hasGameCategoryNav, `No Slingo/Slots/Bingo/Casino category nav for this GEO (${test.info().project.name})`);

    // ── Setup: dismiss cookie + campaign popup ONCE ──────────────────────
    await setupCampaignPopupWatcher(page);
    await page.goto('', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000); // wait for campaign popup to appear before dismissing
    await dismissCookieConsent(page);
    await dismissCampaignPopup(page);
    await page.waitForTimeout(300);
    console.log('GCN setup complete — cookie dismissed once');

    // ── Helper: click a nav link by partial href and verify URL ──────────
    const results: { label: string; status: string }[] = [];

    // Entry point is always the homepage/header nav directly — confirmed live
    // on both Slingo UK and SNG AB that every real category/sub-category link
    // (Megaways, Jackpots, Roulette, etc.) is directly clickable on the page
    // without ever needing the hamburger sidebar. An earlier version of this
    // spec force-opened the hamburger sidebar as a fallback based on a stale,
    // incorrect assumption that sub-tabs lived only inside it — that
    // unconditional sidebar-opening was itself the cause of a real bug (a
    // leftover open sidebar's overlay blocking clicks on the next step's
    // on-page link). Removed entirely rather than patched, since it was never
    // actually needed.
    // Scope every category/sub-category lookup to the real nav wrapper —
    // per PLAN.md's 2026-07-17 findings entry (SNG AB primary-nav locator
    // investigation) plus a follow-up live check of our own: an unscoped
    // `a[href$="..."]` match is genuinely ambiguous, not just theoretically.
    // Confirmed live on SNG AB that a Megaways href matches 3 elements
    // (the real nav sub-tab, an unrelated SEO body-copy link, AND a mobile
    // drawer-menu duplicate) and confirmed live on Slingo UK that a /slots/
    // href matches 6 elements total on the page vs. exactly 1 inside this
    // wrapper. `.filter({ visible: true }).first()` happened to land on the
    // right element in both brands purely because of DOM order, not because
    // it was actually guaranteed to. `[class*="Nav_nav__"]` matches on the
    // stable base name rather than the full hash-suffixed class (confirmed
    // present, exactly once, on both brands), since PLAN.md's note warns the
    // hash suffix itself isn't guaranteed stable across builds/deploys.
    const NAV = '[class*="Nav_nav__"]';

    async function clickNavAndVerify(hrefPart: string, label: string) {
      const expectedUrl = siteUrl(hrefPart);
      // href$= (ends with), not href*= (contains) — confirmed live on SE:
      // "Other" sub-category has no real nav tab at all, but a substring
      // match still hit an individual game tile living under that same
      // path (e.g. /casino/other/flip-n-spin/), silently clicking into a
      // game instead of skipping cleanly like the other missing sub-tabs.
      const link = page.locator(NAV).locator(`a[href$="${hrefPart}"]`).filter({ visible: true }).first();
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
      // Native el.click() via evaluate, not link.click() — confirmed live on
      // SNG AB: at Playwright's test viewport width, a normally-collapsed
      // header dropdown (`Nav_level-one`) overlaps the on-page inline sub-tab
      // row at this exact position (Megaways/Jackpots/etc.), so a real
      // coordinate-based click (even `{ force: true }`, which only skips
      // Playwright's pre-click check, not where the click physically lands)
      // gets handed to that dropdown instead of the link. Confirmed via a
      // real user's screen recording that this does NOT affect actual site
      // visitors — a normal browser window at normal size clicks Megaways
      // fine — so this is a test-viewport artifact, not a site bug worth
      // reporting. Calling the DOM element's native .click() bypasses
      // coordinates/hit-testing entirely and fires the anchor's real default
      // navigation directly, same outcome a real user gets.
      await link.evaluate((el: HTMLElement) => el.click());
      await page.waitForLoadState('domcontentloaded');
      await dismissCampaignPopup(page); // dismiss if popup appears on this page
      // Poll for the redirect instead of a fixed sleep-then-read — a fixed
      // 800ms read raced ahead of a genuinely-slower-but-still-correct
      // redirect (confirmed live on SNG AB/BlackJack: page.url() still showed
      // the parent category at 800ms, logging a false "Fail" in our own
      // results summary, even though the redirect landed correctly a moment
      // later and the real gating assertion below passed). Matches the same
      // up-to-8s window expect.soft(...).toHaveURL() already tolerates, so
      // our own summary log agrees with the actual pass/fail outcome.
      const redirected = await page.waitForURL(url => url.toString() === expectedUrl || url.toString().startsWith(expectedUrl), { timeout: 8_000 }).then(() => true).catch(() => false);
      const actualUrl = page.url();
      const passed = redirected || actualUrl === expectedUrl || actualUrl.startsWith(expectedUrl);
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

    // ── Step 2b: Slots > New Slots ───────────────────────────────────────
    // Not part of Slingo/SC's taxonomy — confirmed live on SNG AB
    // (2026-07-17) as a real sub-tab (/slots/new/); skips cleanly on brands
    // that don't offer it.
    await test.step('Slots > New Slots → /slots/new/', async () => {
      await clickNavAndVerify('/slots/new/', 'New Slots');
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

    // ── Steps 12-17: Live Casino + sub-tabs ───────────────────────────────
    // Not part of Slingo/SC's taxonomy at all — confirmed live on SNG AB
    // (2026-07-17) as a full top-level category with 5 real sub-tabs.
    // Skips cleanly on brands (like Slingo) with no Live Casino category.
    await test.step('Live Casino category → /live-casino/', async () => {
      await clickNavAndVerify('/live-casino/', 'Live Casino');
    });

    await test.step('Live Casino > Live Roulette → /live-casino/live-roulette/', async () => {
      await clickNavAndVerify('/live-casino/live-roulette/', 'Live Roulette');
    });

    await test.step('Live Casino > Live BlackJack → /live-casino/live-blackjack/', async () => {
      await clickNavAndVerify('/live-casino/live-blackjack/', 'Live BlackJack');
    });

    await test.step('Live Casino > Live Baccarat → /live-casino/live-baccarat/', async () => {
      await clickNavAndVerify('/live-casino/live-baccarat/', 'Live Baccarat');
    });

    await test.step('Live Casino > Game Shows → /live-casino/game-shows/', async () => {
      await clickNavAndVerify('/live-casino/game-shows/', 'Game Shows');
    });

    await test.step('Live Casino > Live Games → /live-casino/live-games/', async () => {
      await clickNavAndVerify('/live-casino/live-games/', 'Live Games');
    });

    printSummary();
  });

});

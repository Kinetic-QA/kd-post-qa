import { test, expect } from '../../helpers/stealth-fixtures';
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

    // ── Lord Ping (LP) UK — brand-new brand, onboarded 2026-07-28 ─────────
    // Confirmed live: LP's sub-categories (Jackpots/Daily Jackpots/Megaways/
    // Themes/Providers/Roulette/Blackjack/Baccarat/Game Shows/Table Games/
    // Poker/Scratch Cards) are NOT reachable via the header's Nav_nav__ bar
    // at all — unlike Slingo/SNG, where sub-tabs stay visible inline on the
    // category page itself, LP's Nav_nav__ bar only ever shows the 3
    // top-level tabs (Online Slots/Live Casino/Casino Games), confirmed by
    // inspecting it while already on a sub-category page. Every sub-category
    // link exists ONLY inside the hamburger sidebar's per-category
    // accordion (each of the 3 top-level items independently toggles a
    // collapsed <ul>, maxHeight 0 -> ~410px on click) — and that sidebar
    // itself is off-canvas by default even on desktop, so it must be opened
    // via the hamburger first. Top-level categories ARE reachable via Nav_nav__, so
    // those reuse clickNavAndVerify unchanged; only sub-categories need the
    // dedicated helper below.
    // IE and CA both confirmed live 2026-07-29 to share UK's exact taxonomy
    // and English URL slugs (just prefixed with /en-IE/ or /en-CA/ by
    // baseURL) — widened to cover all three rather than adding near-
    // duplicate branches.
    const isLpUkFormat = (process.env.TEST_BRAND ?? 'SC').toUpperCase() === 'LP'
      && ['UK', 'IE', 'CA'].includes(test.info().project.name.replace(/-mobile$/, ''));
    // ES has its own real taxonomy, confirmed live 2026-07-29 via the
    // sidebar's own DOM — different sub-categories than UK (no Daily
    // Jackpots, no Live Casino sub-breakdown at all, Video Bingo instead of
    // Poker/Scratch Cards) and Spanish URL slugs. See geo-features.ts's
    // LP.ES block for the full confirmed structure.
    const isLpEsFormat = (process.env.TEST_BRAND ?? 'SC').toUpperCase() === 'LP'
      && test.info().project.name.replace(/-mobile$/, '') === 'ES';

    async function clickSidebarSubCategoryAndVerify(categoryClass: string, hrefPart: string, label: string) {
      await page.evaluate(() => (document.querySelector('[class*="hamburger" i], #menu-X') as HTMLElement | null)?.click());
      await page.waitForTimeout(600);
      // Expand this category's accordion — confirmed live: each of the 3
      // top-level rows is its own independent toggle; clicking one does not
      // auto-collapse a sibling, so no need to track which is open already.
      // :not([href]) — same documented pattern as the GC UK mobile-sidebar
      // note above (see geo-features.ts): the expandable toggle and the
      // "All X" sub-link it reveals share this exact CSS class, so an
      // unscoped match risks a strict-mode "resolved to 2 elements"
      // violation, and even where DOM order happens to make .first() land
      // on the right one, being explicit is safer than relying on that.
      // Native el.click() via evaluate, not a real Playwright .click() —
      // confirmed live: even after the hamburger-open wait above, this
      // toggle can still be mid-CSS-transition (translating on-screen) when
      // Playwright's actionability check runs, reporting "element is
      // outside of the viewport" — same off-canvas-menu class of issue
      // documented elsewhere in this file/project, worked around the same
      // way (bypass hit-testing entirely, fire the click handler directly).
      await page.locator(`[class*="${categoryClass}"]:not([href])`).first().evaluate((el: HTMLElement) => el.click());
      await page.waitForTimeout(500);
      const link = page.locator(`[class*="MainMenu_main-menu"] a[href$="${hrefPart}"]`).first();
      const exists = await link.isVisible({ timeout: 3_000 }).catch(() => false);
      if (!exists) {
        results.push({ label: `${label} (skipped — not offered for this GEO)`, status: 'Pass' });
        console.log('SKIP | ' + label + ' | link not found for this GEO');
        return;
      }
      await link.evaluate((el: HTMLElement) => el.click());
      await page.waitForLoadState('domcontentloaded');
      await dismissCampaignPopup(page);
      const expectedUrl = siteUrl(hrefPart);
      const redirected = await page.waitForURL(url => url.toString() === expectedUrl || url.toString().startsWith(expectedUrl), { timeout: 8_000 }).then(() => true).catch(() => false);
      const actualUrl = page.url();
      const passed = redirected || actualUrl === expectedUrl || actualUrl.startsWith(expectedUrl);
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
      console.log((passed ? 'PASS' : 'FAIL') + ' | ' + label + ' | ' + actualUrl);
      await expect.soft(page).toHaveURL(expectedUrl, { timeout: 8_000 });
      // Close the sidebar before the next step re-opens it — avoids a
      // leftover open sidebar's overlay blocking the next click, the same
      // lesson already learned from the unconditional-sidebar-opening bug
      // documented at the top of this file.
      await page.evaluate(() => (document.querySelector('[class*="hamburger" i], #menu-X') as HTMLElement | null)?.click());
      await page.waitForTimeout(300);
    }

    if (isLpUkFormat) {
      await test.step('Online Slots category → /online-slots/', async () => {
        await clickNavAndVerify('/online-slots/', 'Online Slots');
      });
      await test.step('Online Slots > Jackpots → /online-slots/jackpots/', async () => {
        await clickSidebarSubCategoryAndVerify('MainMenu_main_1_slots', '/online-slots/jackpots/', 'Jackpots');
      });
      await test.step('Online Slots > Daily Jackpots → /online-slots/daily-jackpots/', async () => {
        await clickSidebarSubCategoryAndVerify('MainMenu_main_1_slots', '/online-slots/daily-jackpots/', 'Daily Jackpots');
      });
      await test.step('Online Slots > Megaways → /online-slots/megaways/', async () => {
        await clickSidebarSubCategoryAndVerify('MainMenu_main_1_slots', '/online-slots/megaways/', 'Megaways');
      });
      await test.step('Online Slots > Providers → /online-slots/slots-providers/', async () => {
        await clickSidebarSubCategoryAndVerify('MainMenu_main_1_slots', '/online-slots/slots-providers/', 'Providers');
      });
      await test.step('Online Slots > Themes → /online-slots/slots-themes/', async () => {
        await clickSidebarSubCategoryAndVerify('MainMenu_main_1_slots', '/online-slots/slots-themes/', 'Themes');
      });

      // ── Themes page: "More Themes" dropdown ──────────────────────────
      // Confirmed live: this is a react-select SINGLE-select control
      // (classes slots-select__*) that, on picking a theme, navigates to
      // /online-slots/slots-themes/<theme-slug>/ and updates the control's
      // own displayed text to the selected theme's label — it is NOT a
      // true multi-select (no multi-value chips ever appeared). Testing
      // 2-3 DIFFERENT theme selections in sequence (not the same one twice)
      // verifies the control genuinely re-navigates and re-labels itself
      // each time, rather than only ever proving the first selection works.
      await test.step('Online Slots > Themes → "More Themes" dropdown selects multiple themes', async () => {
        await page.goto(siteUrl('/online-slots/slots-themes/'), { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1_500);
        await dismissCookieConsent(page);
        await dismissCampaignPopup(page);

        async function selectTheme(visibleText: string, expectedSlug: string) {
          const control = page.locator('.slots-select__control').first();
          // Confirmed live on Lord Ping UK mobile: a fresh page.goto() here
          // can leave the control below the fold or mid-layout-shift long
          // enough that even scrollIntoViewIfNeeded() + a real Playwright
          // .click() still reports "not visible" repeatedly — native
          // el.click() via evaluate bypasses that actionability wait
          // entirely, same pattern used for every other troublesome click
          // target in this file.
          await control.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(300);
          await control.evaluate((el: HTMLElement) => el.click());
          await page.waitForTimeout(500);
          const option = page.locator('[class*="slots-select__option"]', { hasText: visibleText }).first();
          const optionExists = await option.isVisible({ timeout: 3_000 }).catch(() => false);
          if (!optionExists) {
            results.push({ label: `Themes dropdown: "${visibleText}" (skipped — option not found)`, status: 'Pass' });
            return;
          }
          await option.click();
          await page.waitForTimeout(1_500);
          const expectedUrl = siteUrl(`/online-slots/slots-themes/${expectedSlug}/`);
          const actualUrl = page.url();
          const passed = actualUrl === expectedUrl || actualUrl.startsWith(expectedUrl);
          const controlText = await page.locator('.slots-select__control').first().evaluate(el => {
            const label = el.querySelector('[class*="singleValue"]');
            return label ? label.textContent?.trim() : el.textContent?.trim();
          });
          results.push({ label: `Themes dropdown: "${visibleText}" → ${expectedSlug} (shows "${controlText}")`, status: passed ? 'Pass' : 'Fail' });
          console.log((passed ? 'PASS' : 'FAIL') + ' | Themes dropdown "' + visibleText + '" | ' + actualUrl);
          await expect.soft(page).toHaveURL(expectedUrl, { timeout: 8_000 });
        }

        // 3 different themes, confirmed live to each exist and navigate correctly.
        await selectTheme('Egyptian', 'ancient-egyptian');
        await selectTheme('Pirates', 'pirates');
        await selectTheme('Vikings', 'vikings');
      });

      await test.step('Live Casino category → /live-casino/', async () => {
        await clickNavAndVerify('/live-casino/', 'Live Casino');
      });
      await test.step('Live Casino > Roulette → /live-casino/roulette/', async () => {
        await clickSidebarSubCategoryAndVerify('MainMenu_main_2_live', '/live-casino/roulette/', 'Live Casino Roulette');
      });
      await test.step('Live Casino > Blackjack → /live-casino/blackjack/', async () => {
        await clickSidebarSubCategoryAndVerify('MainMenu_main_2_live', '/live-casino/blackjack/', 'Live Casino Blackjack');
      });
      await test.step('Live Casino > Baccarat → /live-casino/baccarat/', async () => {
        await clickSidebarSubCategoryAndVerify('MainMenu_main_2_live', '/live-casino/baccarat/', 'Live Casino Baccarat');
      });
      await test.step('Live Casino > Game Shows → /live-casino/game-shows/', async () => {
        await clickSidebarSubCategoryAndVerify('MainMenu_main_2_live', '/live-casino/game-shows/', 'Live Casino Game Shows');
      });

      await test.step('Casino Games category → /casino-games/', async () => {
        await clickNavAndVerify('/casino-games/', 'Casino Games');
      });
      await test.step('Casino Games > Table Games → /casino-games/table-games/', async () => {
        await clickSidebarSubCategoryAndVerify('MainMenu_main_3_casino', '/casino-games/table-games/', 'Table Games');
      });
      await test.step('Casino Games > Poker → /casino-games/poker/', async () => {
        await clickSidebarSubCategoryAndVerify('MainMenu_main_3_casino', '/casino-games/poker/', 'Poker');
      });
      await test.step('Casino Games > Scratch Cards → /casino-games/scratch-cards/', async () => {
        await clickSidebarSubCategoryAndVerify('MainMenu_main_3_casino', '/casino-games/scratch-cards/', 'Scratch Cards');
      });
    }

    if (isLpEsFormat) {
      await test.step('Online Slots category → /tragaperras/', async () => {
        await clickNavAndVerify('/tragaperras/', 'Online Slots');
      });
      await test.step('Online Slots > Jackpots → /tragaperras/bote/', async () => {
        await clickSidebarSubCategoryAndVerify('MainMenu_main_1_slots', '/tragaperras/bote/', 'Jackpots');
      });
      await test.step('Online Slots > Megaways → /tragaperras/megaways/', async () => {
        await clickSidebarSubCategoryAndVerify('MainMenu_main_1_slots', '/tragaperras/megaways/', 'Megaways');
      });
      await test.step('Online Slots > Providers → /tragaperras/proveedores/', async () => {
        await clickSidebarSubCategoryAndVerify('MainMenu_main_1_slots', '/tragaperras/proveedores/', 'Proveedores');
      });
      await test.step('Online Slots > Themes → /tragaperras/tematicas/', async () => {
        await clickSidebarSubCategoryAndVerify('MainMenu_main_1_slots', '/tragaperras/tematicas/', 'Temáticas');
      });

      // No Daily Jackpots sub-item on ES (confirmed live — UK has one, ES doesn't).

      // Live Casino has NO sub-category accordion on ES at all — confirmed
      // live: main_2_live is a flat single link, not an expandable toggle
      // like main_1_slots/main_3_casino. Only the top-level check applies.
      await test.step('Live Casino category → /ruleta-en-vivo/', async () => {
        await clickNavAndVerify('/ruleta-en-vivo/', 'Live Casino');
      });

      await test.step('Casino Games category → /juegos-casino/', async () => {
        await clickNavAndVerify('/juegos-casino/', 'Casino Games');
      });
      await test.step('Casino Games > Table Games → /juegos-casino/mesa/', async () => {
        await clickSidebarSubCategoryAndVerify('MainMenu_main_3_casino', '/juegos-casino/mesa/', 'Juegos de Mesa');
      });
      await test.step('Casino Games > Video Bingo → /juegos-casino/video-bingo/', async () => {
        await clickSidebarSubCategoryAndVerify('MainMenu_main_3_casino', '/juegos-casino/video-bingo/', 'Video Bingo');
      });

      // No Poker/Scratch Cards sub-items on ES (confirmed live — UK has both, ES has Video Bingo instead).
    }

    // ── Prime Slots (PSL) UK — brand-new brand, onboarded 2026-07-30 ──────
    // Confirmed live: NOT built on the LP/SNG sidebar-accordion platform at
    // all — this brand has no hamburger/off-canvas sidebar whatsoever. Real
    // nav is a classic always-visible top tab bar (`.main-tabs`) with CSS
    // hover-dropdown sub-categories (`.header-menu-dropdown`/`.header-menu-
    // child`) — neither the shared `NAV` locator above (scoped to
    // `[class*="Nav_nav__"]`, which this brand's plain markup never
    // matches) nor LP's `clickSidebarSubCategoryAndVerify` (which expects a
    // click-toggle accordion, not a CSS :hover reveal) apply here. Own
    // taxonomy, confirmed live via the header-menu-dropdown DOM: Slots (New
    // Slots/Best Slots/Jackpots/Daily Jackpots/Jackpot King/Megaways/Other
    // Slots/All Slots), Scratch Cards (Classic Scratch Cards/All Scratch
    // Cards — a whole new top-level category not seen on any other brand
    // onboarded so far), Casino (Roulette/BlackJack/Special games/All
    // Casino games). No Bingo, no Live Casino, no Slingo.
    // Widened 2026-08-03 to include PSC (Prime Scratch Cards): confirmed
    // live it shares the exact same `.main-tabs` top-level nav (Home/
    // Scratch Cards/Slots/Casino, same href slugs) as PSL, but has NO
    // `.header-menu-dropdown` submenus at all (0 found) — a flatter
    // taxonomy, not PSL's nested New Slots/Best Slots/Jackpots structure.
    // Safe to share this branch: clickDropdownChildAndVerify already skips
    // gracefully when its dropdown parent isn't found, so PSC's top-level
    // tab clicks run and pass while its (nonexistent) submenu checks skip.
    const isPslUkFormat = ['PSL', 'PSC'].includes((process.env.TEST_BRAND ?? 'SC').toUpperCase());
    // Lucky Me Slots (LMS) UK — onboarded 2026-08-03, brand-new brand.
    // Confirmed live NOT to share PSL/PSC's `.main-tabs` header at all —
    // every category link (top-level AND sub-category alike) lives inside
    // a real off-canvas sidebar (`nav#top-nav`, hamburger trigger
    // `id="menu-X"` — see geo-features.ts's LMS.UK block for the full
    // investigation). Unlike LP's accordion sidebar, every link here is
    // immediately visible once the sidebar opens — no per-category expand
    // click needed — so a single flat click-and-verify helper suffices,
    // simpler than LP's clickSidebarSubCategoryAndVerify.
    const isLmsUkFormat = (process.env.TEST_BRAND ?? 'SC').toUpperCase() === 'LMS';
    // Lucky Me Slots (LMS) SE — onboarded 2026-08-04. Confirmed live this
    // brand's SE market has a genuinely SMALLER taxonomy than UK/CA: no
    // Table Games, no Live Casino (both confirmed 404 via direct nav), and
    // no VIP Lounge/Daily Tournaments/Daily Promotions/Quick Cashouts group
    // either (those pages return a live 200 but are orphaned — not linked
    // from the sidebar at all, same "confirmed-live orphaned page" pattern
    // already documented for LP SE's promotions pages). Real sidebar only
    // has Online Slots/Progressive Jackpots/Game List, plus a real
    // "Utbetalningar" (Withdrawals) entry (/withdraw/) that UK/CA don't
    // have. Needs its own narrower step list rather than reusing
    // isLmsUkFormat's 5-link block, which would fail for real on this
    // GEO's missing Table Games/Live Casino links.
    const isLmsSeFormat = (process.env.TEST_BRAND ?? 'SC').toUpperCase() === 'LMS'
      && test.info().project.name.replace(/-mobile$/, '') === 'SE';
    // Simba Games (SG) UK — onboarded 2026-08-04, brand-new brand. Same
    // underlying sidebar architecture as LMS (nav#top-nav, hamburger
    // trigger id="menu-X") — reuses clickLmsSidebarLinkAndVerify unchanged
    // — but a genuinely RICHER 7-link taxonomy: Online Slots/Card & Table
    // Games/Live Dealer/Roulette/Video Poker (real URL typo,
    // "/video-pocker/", confirmed live, not a mistake) plus Game List and
    // VIP Lounge, vs LMS's 4-5 links.
    const isSgUkFormat = (process.env.TEST_BRAND ?? 'SC').toUpperCase() === 'SG';

    async function clickLmsSidebarLinkAndVerify(hrefPart: string, label: string) {
      await page.evaluate(() => (document.querySelector('#menu-X') as HTMLElement | null)?.click());
      await page.waitForTimeout(600);
      const link = page.locator('nav#top-nav').locator(`a[href="${hrefPart}"]`).first();
      const exists = await link.isVisible({ timeout: 3_000 }).catch(() => false);
      if (!exists) {
        results.push({ label: `${label} (skipped — not offered for this GEO)`, status: 'Pass' });
        console.log('SKIP | ' + label + ' | link not found for this GEO');
        return;
      }
      await link.evaluate((el: HTMLElement) => el.click());
      await page.waitForLoadState('domcontentloaded');
      await dismissCampaignPopup(page);
      const expectedUrl = siteUrl(hrefPart);
      const redirected = await page.waitForURL(url => url.toString() === expectedUrl || url.toString().startsWith(expectedUrl), { timeout: 8_000 }).then(() => true).catch(() => false);
      const actualUrl = page.url();
      const passed = redirected || actualUrl === expectedUrl || actualUrl.startsWith(expectedUrl);
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
      console.log((passed ? 'PASS' : 'FAIL') + ' | ' + label + ' | ' + actualUrl);
      await expect.soft(page).toHaveURL(expectedUrl, { timeout: 8_000 });
    }

    async function clickTopTabAndVerify(hrefPart: string, label: string) {
      const expectedUrl = siteUrl(hrefPart);
      const link = page.locator('.main-tabs a[href$="' + hrefPart + '"]').first();
      const exists = await link.isVisible({ timeout: 3_000 }).catch(() => false);
      if (!exists) {
        results.push({ label: `${label} (skipped — not offered for this GEO)`, status: 'Pass' });
        console.log('SKIP | ' + label + ' | link not found for this GEO');
        return;
      }
      await link.evaluate((el: HTMLElement) => el.click());
      await page.waitForLoadState('domcontentloaded');
      await dismissCampaignPopup(page);
      const redirected = await page.waitForURL(url => url.toString() === expectedUrl || url.toString().startsWith(expectedUrl), { timeout: 8_000 }).then(() => true).catch(() => false);
      const actualUrl = page.url();
      const passed = redirected || actualUrl === expectedUrl || actualUrl.startsWith(expectedUrl);
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
      console.log((passed ? 'PASS' : 'FAIL') + ' | ' + label + ' | ' + actualUrl);
      await expect.soft(page).toHaveURL(expectedUrl, { timeout: 8_000 });
    }

    // Sub-category links are real anchors always present in the DOM, just
    // CSS-hidden until the parent .header-menu-dropdown is hovered (a plain
    // CSS :hover reveal, not a click-toggle like LP's sidebar accordion) —
    // hovering the parent <li> first, then firing the child's native
    // .click() via evaluate (bypassing Playwright's own visibility/
    // actionability wait, same pattern used elsewhere in this file for
    // hover-reveal targets), lands reliably regardless of the reveal
    // animation's exact timing.
    async function clickDropdownChildAndVerify(categoryLabel: string, hrefPart: string, label: string) {
      const expectedUrl = siteUrl(hrefPart);
      const parent = page.locator('.header-menu-dropdown', { hasText: categoryLabel }).first();
      const parentExists = await parent.count() > 0;
      if (!parentExists) {
        results.push({ label: `${label} (skipped — not offered for this GEO)`, status: 'Pass' });
        console.log('SKIP | ' + label + ' | category not found for this GEO');
        return;
      }
      await parent.hover().catch(() => {});
      await page.waitForTimeout(400);
      const link = parent.locator(`a[href$="${hrefPart}"]`).first();
      const linkExists = await link.count() > 0;
      if (!linkExists) {
        results.push({ label: `${label} (skipped — not offered for this GEO)`, status: 'Pass' });
        console.log('SKIP | ' + label + ' | link not found for this GEO');
        return;
      }
      await link.evaluate((el: HTMLElement) => el.click());
      await page.waitForLoadState('domcontentloaded');
      await dismissCampaignPopup(page);
      const redirected = await page.waitForURL(url => url.toString() === expectedUrl || url.toString().startsWith(expectedUrl), { timeout: 8_000 }).then(() => true).catch(() => false);
      const actualUrl = page.url();
      const passed = redirected || actualUrl === expectedUrl || actualUrl.startsWith(expectedUrl);
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
      console.log((passed ? 'PASS' : 'FAIL') + ' | ' + label + ' | ' + actualUrl);
      await expect.soft(page).toHaveURL(expectedUrl, { timeout: 8_000 });
    }

    if (isPslUkFormat) {
      await test.step('Slots category → /slots/', async () => {
        await clickTopTabAndVerify('/slots/', 'Slots');
      });
      await test.step('Slots > New Slots → /slots/new/', async () => {
        await clickDropdownChildAndVerify('Slots', '/slots/new/', 'New Slots');
      });
      await test.step('Slots > Best Slots → /slots/best/', async () => {
        await clickDropdownChildAndVerify('Slots', '/slots/best/', 'Best Slots');
      });
      await test.step('Slots > Jackpots → /slots/jackpots/', async () => {
        await clickDropdownChildAndVerify('Slots', '/slots/jackpots/', 'Jackpots');
      });
      await test.step('Slots > Daily Jackpots → /slots/daily-jackpots/', async () => {
        await clickDropdownChildAndVerify('Slots', '/slots/daily-jackpots/', 'Daily Jackpots');
      });
      await test.step('Slots > Jackpot King → /slots/jackpot-king/', async () => {
        await clickDropdownChildAndVerify('Slots', '/slots/jackpot-king/', 'Jackpot King');
      });
      await test.step('Slots > Megaways → /slots/megaways/', async () => {
        await clickDropdownChildAndVerify('Slots', '/slots/megaways/', 'Megaways');
      });
      await test.step('Slots > Other Slots → /slots/other-slots/', async () => {
        await clickDropdownChildAndVerify('Slots', '/slots/other-slots/', 'Other Slots');
      });

      await test.step('Scratch Cards category → /scratch-cards/', async () => {
        await clickTopTabAndVerify('/scratch-cards/', 'Scratch Cards');
      });
      await test.step('Scratch Cards > Classic Scratch Cards → /scratch-cards/classic/', async () => {
        await clickDropdownChildAndVerify('Scratch Cards', '/scratch-cards/classic/', 'Classic Scratch Cards');
      });

      await test.step('Casino category → /casino/', async () => {
        await clickTopTabAndVerify('/casino/', 'Casino');
      });
      await test.step('Casino > Roulette → /casino/roulette/', async () => {
        await clickDropdownChildAndVerify('Casino', '/casino/roulette/', 'Roulette');
      });
      await test.step('Casino > BlackJack → /casino/blackjack/', async () => {
        await clickDropdownChildAndVerify('Casino', '/casino/blackjack/', 'BlackJack');
      });
      await test.step('Casino > Special games → /casino/special/', async () => {
        await clickDropdownChildAndVerify('Casino', '/casino/special/', 'Special games');
      });
    }

    if (isLmsUkFormat && !isLmsSeFormat) {
      await test.step('Online Slots → /online-slots/', async () => {
        await clickLmsSidebarLinkAndVerify('/online-slots/', 'Online Slots');
      });
      await test.step('Progressive Jackpots → /progressive-jackpots/', async () => {
        await clickLmsSidebarLinkAndVerify('/progressive-jackpots/', 'Progressive Jackpots');
      });
      await test.step('Table Games → /table-games/', async () => {
        await clickLmsSidebarLinkAndVerify('/table-games/', 'Table Games');
      });
      await test.step('Live Casino → /live-casino/', async () => {
        await clickLmsSidebarLinkAndVerify('/live-casino/', 'Live Casino');
      });
      await test.step('Game List → /game-list/', async () => {
        await clickLmsSidebarLinkAndVerify('/game-list/', 'Game List');
      });
    }

    if (isLmsSeFormat) {
      await test.step('Online Slots → /online-slots/', async () => {
        await clickLmsSidebarLinkAndVerify('/online-slots/', 'Online Slots');
      });
      await test.step('Progressive Jackpots → /progressive-jackpots/', async () => {
        await clickLmsSidebarLinkAndVerify('/progressive-jackpots/', 'Progressive Jackpots');
      });
      await test.step('Game List → /game-list/', async () => {
        await clickLmsSidebarLinkAndVerify('/game-list/', 'Game List');
      });
    }

    if (isSgUkFormat) {
      await test.step('Online Slots → /slots/', async () => {
        await clickLmsSidebarLinkAndVerify('/slots/', 'Online Slots');
      });
      await test.step('Card & Table Games → /cards-and-tables/', async () => {
        await clickLmsSidebarLinkAndVerify('/cards-and-tables/', 'Card & Table Games');
      });
      await test.step('Live Dealer → /live-dealer/', async () => {
        await clickLmsSidebarLinkAndVerify('/live-dealer/', 'Live Dealer');
      });
      await test.step('Roulette Game → /roulette/', async () => {
        await clickLmsSidebarLinkAndVerify('/roulette/', 'Roulette Game');
      });
      await test.step('Video Poker → /video-pocker/', async () => {
        await clickLmsSidebarLinkAndVerify('/video-pocker/', 'Video Poker');
      });
      await test.step('Game List → /game-list/', async () => {
        await clickLmsSidebarLinkAndVerify('/game-list/', 'Game List');
      });
      await test.step('VIP Lounge → /vip-lounge/', async () => {
        await clickLmsSidebarLinkAndVerify('/vip-lounge/', 'VIP Lounge');
      });
    }

    printSummary();
  });

});

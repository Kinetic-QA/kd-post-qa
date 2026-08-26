import { test, expect } from '../../helpers/stealth-fixtures';
import { dismissCampaignPopup, dismissCookieConsent, setupCampaignPopupWatcher, playCtaLocator } from '../../helpers/common';
import { currentGeoFeatures } from '../../helpers/geo-features';
import { currentLocaleStrings } from '../../helpers/locale-strings';

/**
 * GIM-01: Game Information Modal
 * Scope: Full game info modal flow — open from a tile click, Play It →
 * registration handoff, opening the game in a new tab, geo currency display
 * inside the modal, closing/reopening, and hover-triggered Play It routing.
 * Currency symbol is GEO-dependent — see helpers/geo-features.ts.
 * Steps 6-7: window.open() used as equivalent of "Open link in new tab"
 */

// Deliberately not hardcoding a specific game title — catalogs differ per
// GEO (confirmed live: this exact title doesn't reliably exist on ES), so
// every step below always operates on whichever game tile is first/visible.

test.describe('P1 - Game Information Modal', () => {

  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await setupCampaignPopupWatcher(page);
    await page.goto('', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000);
    await dismissCookieConsent(page);
    await dismissCampaignPopup(page);
    await page.waitForTimeout(500);
  });

  test('GIM-01: Game information modal full flow', async ({ page }) => {
    test.setTimeout(120_000);

    const geoFeatures = currentGeoFeatures();
    const EXPECTED_CURRENCY = geoFeatures.gameModalCurrencyText ?? geoFeatures.currencySymbol;
    const strings = currentLocaleStrings();
    const isMobile = test.info().project.name.endsWith('-mobile');

    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(50));
      console.log('  GIM-01 GAME INFO MODAL - RESULTS');
      console.log('  Currency checked: ' + EXPECTED_CURRENCY);
      console.log('═'.repeat(50));
      for (const r of results) {
        console.log(`  ${r.status === 'Pass' ? '✅' : '❌'}  ${r.label.padEnd(40)} ${r.status}`);
      }
      const passed = results.filter(r => r.status === 'Pass').length;
      const failed = results.filter(r => r.status === 'Fail').length;
      console.log('─'.repeat(50));
      console.log(`  Total: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}`);
      console.log('═'.repeat(50) + '\n');
    }
    async function runStep(label: string, fn: () => Promise<void>) {
      await test.step(label, async () => {
        try { await fn(); record(label, true); }
        catch (e) { record(label, false); throw e; }
      });
    }

    async function findGameLink(excludeHrefs?: Set<string>) {
      const vh = page.viewportSize()?.height ?? 720;
      // Exclude the bare category nav links themselves (e.g. href="/slingo/"
      // with no game slug after it) — on some GEOs (confirmed ES) the
      // sidebar's own "Slingo"/"Slots" category link matches this selector
      // too and sorts ahead of any real game tile, so the fallback silently
      // opened the category page instead of a game's info modal.
      const gameHrefSubstrings = geoFeatures.gameTileHrefSubstrings ?? ['/slingo/', '/slots/'];
      const links = page.locator(
        gameHrefSubstrings.map(sub => `a[href*="${sub}"]:not([href$="${sub}"])`).join(', ')
      );
      // Confirmed live on SNG AB desktop: the exact-href exclusion above
      // only rules out "/slingo/"/"/slots/" themselves — it doesn't rule out
      // a sub-category NAV link like "/slots/new/" ("New Slots"), which also
      // passes a bounding-box-based in-viewport check (it's part of the
      // sticky sub-nav row) and then times out on click since the sticky
      // header moves it "outside of the viewport" by click time. An
      // ancestor-based check (closest("[class*='Nav_nav__']")) was tried
      // first but proved unreliable at this later point in the test (Step
      // 10, after prior navigation) — likely a timing race against page
      // state, not a real "not in nav" case. Directly excluding hrefs that
      // the real nav wrapper itself contains is driven by live data instead
      // of a heuristic, so it isn't sensitive to DOM/timing differences.
      // evaluateAll's return value is JSON-serialized across the page/Node
      // boundary, so build the Set in Node from a plain array — a Set
      // returned directly from page context doesn't survive that.
      // Confirmed live: Nav_nav__ alone isn't enough — its sub-nav row
      // (Nav_sub-nav__, containing "New Slots"/"Megaways"/etc.) only renders
      // when actually on a category page (e.g. /slots/), not on the
      // homepage where this test starts. The hamburger sidebar drawer
      // (MainMenu_main-menu__, a completely separate container) duplicates
      // the same sub-category links on every page including the homepage,
      // which is what was actually being matched here — include it too.
      // .main-tabs/.header-menu-dropdown — confirmed live on Prime Slots
      // (PSL) UK 2026-07-30: this brand's nav uses plain always-visible tabs
      // + CSS hover-dropdowns, not the Nav_nav__/MainMenu_main-menu React
      // CSS-module classes every other brand shares, so without these the
      // exclusion set stayed empty and a real dropdown-child nav link
      // (e.g. "/slots/new/") got treated as a game tile.
      const navHrefList = await page.locator('[class*="Nav_nav__"] a[href], [class*="MainMenu_main-menu"] a[href], .main-tabs a[href], .header-menu-dropdown a[href], #top-nav a[href]')
        .evaluateAll(els => els.map(el => (el as HTMLAnchorElement).href));
      const navHrefs = new Set(navHrefList);
      let count = await links.count();
      // Confirmed live on Lucky Me Slots (LMS) SE 2026-08-04: unlike every
      // other GEO checked so far, this brand's real homepage shows ZERO
      // individual game-tile links at all — only the bare category nav
      // links themselves (confirmed via a full-page link dump after a full
      // scroll). Individual tiles only exist on the category page itself
      // (e.g. /online-slots/). Navigate there once if the homepage
      // genuinely has none, rather than timing out on an empty locator;
      // harmless no-op for every other GEO, which always finds tiles on
      // the homepage already.
      if (count === 0) {
        const categoryPath = geoFeatures.gameTileHrefSubstrings?.[0];
        if (categoryPath) {
          await page.goto(categoryPath.replace(/^\//, ''), { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(1_500);
          await dismissCookieConsent(page);
          await dismissCampaignPopup(page);
          count = await links.count();
        }
      }
      for (let i = 0; i < Math.min(count, 30); i++) {
        const candidate = links.nth(i);
        const href = await candidate.getAttribute('href').catch(() => null);
        if (href && navHrefs.has(new URL(href, page.url()).href)) continue;
        // Confirmed live on MC/DK: without this, a bounded caller-side retry
        // loop calling findGameLink() again after a failed click just gets
        // the SAME deterministic candidate back every time (nothing about
        // page state changed), defeating the whole point of retrying with a
        // different tile — a real, reproducible hang, not a one-off flake.
        if (href && excludeHrefs?.has(href)) continue;
        const box = await candidate.boundingBox().catch(() => null);
        // Confirmed live on MC/UK: a tile's title link can sit inside a
        // hover-reveal overlay (e.g. GameTile_tile-hover__*, also holding a
        // "Play Now" button) that measures 0x0 until actually hovered — the
        // topmost on-screen row can be entirely made of these, while a
        // same-size, already-clickable row sits just below the current
        // viewport. scrollIntoViewIfNeeded() runs right after this returns
        // regardless, so requiring box.y < vh only rejected valid
        // below-the-fold candidates for no benefit — dropped that upper
        // bound; box.y <= 100 stays to avoid a sticky-header duplicate.
        if (!box || box.y <= 100 || box.width <= 30) continue;
        return candidate;
      }
      return links.first();
    }

    async function closeGameInfoModal() {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1_000);
      if (page.url().includes('gamepage')) {
        await page.evaluate(() => history.pushState({}, '', location.pathname));
        await page.waitForTimeout(500);
      }
    }

    async function closeAccountModal() {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1_200);
      if (!page.url().includes('#account')) return;
      await page.goto('', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);
    }

    try {

    // Confirmed live on MC/UK: the title link can sit inside a hover-reveal
    // overlay (visibility:hidden, not zero-size, until the tile is actually
    // hovered) — a plain click()/hover() on the link itself correctly
    // refuses to act on something CSS-invisible, and force-hovering the
    // link's own (zero-size) box doesn't trigger the reveal either. What
    // does: hovering the nearest ANCESTOR that actually has real dimensions
    // (the tile's image/container) — confirmed live this reveals the link.
    // Harmless no-op on brands where the link is already visible at rest
    // (its own nearest sized ancestor is then itself).
    async function hoverRevealAncestor(locator: ReturnType<typeof page.locator>) {
      const handle = await locator.elementHandle();
      if (!handle) return;
      const ancestorHandle = await handle.evaluateHandle((el) => {
        let node: Element | null = el.parentElement;
        while (node) {
          const r = node.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) return node;
          node = node.parentElement;
        }
        return el;
      });
      const ancestorElement = ancestorHandle.asElement();
      // force:true + short timeout — confirmed live on Lucky Me Slots (LMS)
      // UK 2026-08-03: a plain .hover() retried against a genuinely
      // intercepting element (an unrelated lazy-loading sibling tile
      // image, or even the search input box) for its full default 30s
      // before giving up — with up to 20 candidates checked elsewhere in
      // this file, that alone can exceed the whole test's budget. force
      // skips the pointer-interception hit-test (we only need to trigger
      // the CSS :hover state, not simulate a literally unobstructed real
      // click), and 2s is plenty for a hover that's actually going to work.
      if (ancestorElement) await ancestorElement.hover({ force: true, timeout: 2_000 }).catch(() => {});
    }

    await runStep('Step 1: Click game title -> info modal appears', async () => {
      const link = await findGameLink();
      // Confirmed live on Lucky Me Slots (LMS) UK 2026-08-03: unlike MC/UK
      // (where the link has real dimensions at rest and only needs a hover
      // before clicking), LMS's game-link anchor is genuinely zero-size
      // until its ancestor `.game-box` is hovered — scrollIntoViewIfNeeded()
      // itself timed out waiting for a visible target, before hover ever
      // ran. Hover-reveal first, then scroll — safe for every brand, since
      // hovering an already-visible ancestor is a documented no-op.
      await hoverRevealAncestor(link);
      await page.waitForTimeout(300);
      await link.scrollIntoViewIfNeeded();
      // Confirmed live on MC/UK and MC/COM: scrollIntoViewIfNeeded() can
      // align the target right at the very top edge, directly under the
      // sticky header — a plain click's pointer event gets intercepted
      // there, and on some pages the resulting point falls fully outside
      // the viewport instead. Nudge the page up slightly afterward so the
      // target sits comfortably below the header before clicking.
      // Confirmed live on SNG ON mobile 2026-08-24 (reproduced identically
      // on retry): applying this nudge unconditionally instead pushed a
      // candidate that scrollIntoViewIfNeeded() had already placed near the
      // BOTTOM of the viewport into the sticky bottom nav bar (Menu/Search/
      // Promotions/Play Now) — force:true bypasses Playwright's own
      // actionability checks, but the resulting click still lands on
      // whatever's actually on top at that pixel, so it silently hit the
      // footer's "Search game" link (href="#search") both times instead of
      // the game tile underneath. Same root cause and same fix already
      // applied to Step 10's identical nudge below (see its own comment) —
      // only nudge when the candidate is actually near the TOP.
      const preNudgeBox = await link.boundingBox().catch(() => null);
      if (preNudgeBox && preNudgeBox.y >= 0 && preNudgeBox.y < 150) {
        await page.evaluate(() => window.scrollBy(0, -120));
        await page.waitForTimeout(200);
      }
      // Guarding the -120 nudge above was NOT enough on SNG ON mobile
      // (reconfirmed 2026-08-25, still landing on "#search" every time) —
      // the candidate never needed the top nudge in the first place; it was
      // ALREADY sitting under the fixed [class*="MobileFooter"] bottom nav
      // bar before any nudge ran, because that bar is position:fixed and
      // always covers the same slice of the viewport regardless of scroll
      // position. A hardcoded pixel guess for its height would be exactly
      // the kind of brittle per-brand assumption that's caused repeat
      // failures elsewhere in this file — read its REAL live bounding box
      // instead and scroll down just enough to clear it whenever they
      // overlap. Harmless no-op on desktop / brands with no MobileFooter
      // (locator resolves to nothing, boundingBox() returns null).
      if (isMobile) {
        const footerBox = await page.locator('[class*="MobileFooter"]').first().boundingBox().catch(() => null);
        const linkBox = await link.boundingBox().catch(() => null);
        if (footerBox && linkBox && (linkBox.y + linkBox.height) > footerBox.y) {
          const clearance = (linkBox.y + linkBox.height) - footerBox.y + 20;
          await page.evaluate((px) => window.scrollBy(0, px), clearance);
          await page.waitForTimeout(200);
        }
      }
      await hoverRevealAncestor(link);
      await page.waitForTimeout(300);
      await link.click({ force: true });
      await page.waitForTimeout(2_000);
      await expect(page).toHaveURL(/#gamepage\//, { timeout: 10_000 });
      console.log('GIM-01 modal URL: ' + page.url());
    });

    await runStep('Step 2: Game information modal is visible', async () => {
      const modal = page.locator('[class*="Popup_popup"], .game-popup').filter({ visible: true }).first();
      await expect(modal).toBeVisible({ timeout: 8_000 });
    });

    await runStep('Step 3: URL contains /#gamepage/<game-title>', async () => {
      const url = page.url();
      console.log('GIM-01 gamepage slug: ' + (url.split('#gamepage/')[1] ?? ''));
      expect(url.includes('#gamepage/')).toBe(true);
    });

    await runStep('Step 3b: Click Play It -> registration modal opens', async () => {
      if (!geoFeatures.hasAccountModal) {
        // Clicking Play does nothing for this GEO (confirmed live — no
        // navigation, no modal), so the game-info modal opened in Step 1
        // never gets a chance to close via the usual #account handoff.
        // closeGameInfoModal() (Escape + pushState) isn't enough to unmount
        // it — confirmed live this still left it intercepting later clicks
        // (Step 10 failed even after calling it). A full navigation is what
        // Steps 14-16 already rely on for the same React GamePopup
        // component, so use that here too rather than the lighter helper.
        await page.goto('', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1_000);
        await dismissCampaignPopup(page);
        console.log('GIM-01 Step 3b skipped — clicking Play does not open an #account modal for this GEO');
        return;
      }
      // Scoped to the open game-info modal — an unscoped page-wide search
      // for this CTA text can match unrelated content-block buttons
      // elsewhere on the page (confirmed live: a "Content_block-center"
      // promo tile also says "A JUGAR" on ES).
      const modal = page.locator('[class*="Popup_popup"], .game-popup').filter({ visible: true }).first();
      const playItBtn = playCtaLocator(modal, strings.playCta).first();
      // Confirmed count 1 in the modal, so it's the right element — but on
      // SNG AB mobile it has a genuine 0×0 bounding box (a desktop-only
      // hover-reveal element, class GameTile_tile-hover, that never gets a
      // real size on a touch viewport — confirmed via computed style: not
      // scroll position, not CSS visibility, an actual zero-size element).
      // scrollIntoViewIfNeeded()/a coordinate-based click can't act on a
      // zero-size target. Native el.click() bypasses hit-testing/size
      // entirely and DOES trigger the real navigation to #account —
      // confirmed live — same pattern as the desktop header nav fix in
      // game-category-navigation.spec.ts.
      await playItBtn.evaluate((el: HTMLElement) => el.click());
      await page.waitForTimeout(2_000);
      await expect(page).toHaveURL(/#account/, { timeout: 10_000 });
    });

    await runStep('Step 4: Registration modal visible + URL has /#account', async () => {
      if (!geoFeatures.hasAccountModal) {
        console.log('GIM-01 Step 4 skipped — no #account modal for this GEO');
        return;
      }
      expect(page.url()).toContain('#account');
    });

    await runStep('Step 5: Click X -> registration modal closes', async () => {
      if (!geoFeatures.hasAccountModal) {
        console.log('GIM-01 Step 5 skipped — no #account modal for this GEO');
        return;
      }
      await closeAccountModal();
      await expect(page).not.toHaveURL(/#account/, { timeout: 8_000 });
    });

    await runStep('Steps 6-9: Open game link in new tab -> verify -> close', async () => {
      await dismissCampaignPopup(page);
      const link = await findGameLink();
      // Same LMS UK fix as Step 1 above: hover-reveal before scrolling,
      // since the link can be genuinely zero-size (not just off-screen)
      // until its ancestor is hovered.
      await hoverRevealAncestor(link);
      await page.waitForTimeout(300);
      await link.scrollIntoViewIfNeeded();
      const href = await link.getAttribute('href') ?? '/';
      const fullUrl = new URL(href, page.url()).toString();
      const hrefPath = new URL(href, page.url()).pathname;
      const [newTab] = await Promise.all([
        page.context().waitForEvent('page'),
        page.evaluate((url: string) => window.open(url, '_blank'), fullUrl)
      ]);
      await newTab.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1_500);
      const newTabUrl = newTab.url();
      console.log('GIM-01 new tab URL: ' + newTabUrl);
      const hasSlug = newTabUrl.includes('#gamepage/') || newTabUrl.includes(hrefPath);
      expect(hasSlug).toBe(true);
      await newTab.close();
      await page.waitForTimeout(500);
    });

    await runStep('Step 10: Click game title again -> info modal reopens', async () => {
      await dismissCampaignPopup(page);
      // MC/IE (confirmed live 2026-07-23): findGameLink() can pick a tile
      // sitting inside a horizontally-scrolling carousel row — page-level
      // scrollIntoViewIfNeeded() only handles real vertical/overflow scroll
      // containers, not a transform-based horizontal carousel, so the tile
      // can remain genuinely outside the viewport (force:true doesn't
      // bypass Playwright's hard viewport check either). Re-pick a fresh
      // candidate up to twice if the chosen one isn't actually reachable —
      // findGameLink() returns a different tile each call as page state
      // shifts, and another candidate is very likely to be a plain,
      // non-carousel tile that scrolls into view normally.
      let clicked = false;
      let lastError: unknown;
      const triedHrefs = new Set<string>();
      for (let attempt = 1; attempt <= 3 && !clicked; attempt++) {
        const link = await findGameLink(triedHrefs);
        const linkHref = await link.getAttribute('href').catch(() => null);
        if (linkHref) triedHrefs.add(linkHref);
        // Same LMS hover-reveal fix as Steps 6-9 above: this candidate can be
        // genuinely zero-size until its ancestor tile is hovered, which made
        // the unconditional scrollIntoViewIfNeeded() below hang for the full
        // default timeout on LMS CA (confirmed live 2026-08-04) before ever
        // reaching the box-check/hover-reveal further down this loop.
        await hoverRevealAncestor(link);
        await link.scrollIntoViewIfNeeded();
        await page.waitForTimeout(150);
        // Only nudge away from the sticky header if the candidate actually
        // landed near the TOP of the viewport (the MC/UK and MC/COM case this
        // was written for). Confirmed live on Slingo UK: applying this nudge
        // unconditionally instead pushed a candidate that scrollIntoViewIfNeeded()
        // had already placed near the BOTTOM of the viewport out of view by the
        // same 120px (candidate measured at y=790 against a 720px-tall viewport
        // — exactly this offset).
        const preNudgeBox = await link.boundingBox().catch(() => null);
        if (preNudgeBox && preNudgeBox.y >= 0 && preNudgeBox.y < 150) {
          await page.evaluate(() => window.scrollBy(0, -120));
          await page.waitForTimeout(200);
        }
        const box = await link.boundingBox().catch(() => null);
        const vh = page.viewportSize()?.height ?? 720;
        const vw = page.viewportSize()?.width ?? 1280;
        // Confirmed live on MC/DK: a candidate can pass a Y-only check yet
        // still be genuinely outside the viewport HORIZONTALLY — its own
        // row is a sideways-scrolling GamesSlider carousel (hasGameFilterCarousel:
        // true), and scrollIntoViewIfNeeded() only scrolls the page
        // vertically, never that carousel's own horizontal scroll position.
        // Check both axes so this doesn't reach Playwright's own hard click-
        // time viewport check, which force:true can't bypass either way.
        if (!box || box.y < 0 || box.y > vh || box.x < 0 || box.x > vw) {
          console.log(`GIM-01 Step 10 attempt ${attempt}: candidate outside viewport (x=${box?.x}, y=${box?.y}), retrying with a different tile`);
          continue;
        }
        await hoverRevealAncestor(link);
        await page.waitForTimeout(300);
        // Confirmed live on MC/DK: the hover-reveal itself (e.g. a CSS
        // zoom/scale transition on the tile) can shift the tile enough to
        // land it back outside the viewport even though the PRE-hover box
        // above was fine — re-check right before clicking rather than
        // trusting a now-stale measurement.
        const postHoverBox = await link.boundingBox().catch(() => null);
        if (!postHoverBox || postHoverBox.y < 0 || postHoverBox.y > vh || postHoverBox.x < 0 || postHoverBox.x > vw) {
          console.log(`GIM-01 Step 10 attempt ${attempt}: hover shifted candidate outside viewport (x=${postHoverBox?.x}, y=${postHoverBox?.y}), retrying with a different tile`);
          continue;
        }
        // Confirmed live on SNG ON mobile 2026-08-25: this y<vh/y>0 check
        // alone isn't enough — a candidate can sit fully WITHIN those
        // bounds yet still be visually covered by the fixed
        // [class*="MobileFooter"] bottom nav bar (position:fixed, so it
        // overlaps the same viewport slice regardless of scroll position).
        // force:true still resolves the click to whatever's actually on
        // top at that pixel, so it silently landed on the footer's
        // "Search game" link (href="#search") both times instead of the
        // tile underneath — same root cause already fixed for Step 1's
        // click above (see its comment); apply the same live-footer-box
        // check here rather than retrying candidates that will all fail
        // the same way if they're all in that same footer band.
        if (isMobile) {
          const footerBox = await page.locator('[class*="MobileFooter"]').first().boundingBox().catch(() => null);
          if (footerBox && (postHoverBox.y + postHoverBox.height) > footerBox.y) {
            const clearance = (postHoverBox.y + postHoverBox.height) - footerBox.y + 20;
            await page.evaluate((px) => window.scrollBy(0, px), clearance);
            await page.waitForTimeout(200);
          }
        }
        try {
          await link.click({ force: true, timeout: 5_000 });
          clicked = true;
        } catch (e) {
          lastError = e;
        }
      }
      if (!clicked) throw lastError ?? new Error('GIM-01 Step 10: no reachable game tile found after 3 attempts');
      await page.waitForTimeout(2_000);
      await expect(page).toHaveURL(/#gamepage\//, { timeout: 10_000 });
    });

    await runStep('Step 11: Currency in modal matches geo (' + EXPECTED_CURRENCY + ')', async () => {
      const modalText = await page.locator('[class*="Popup_popup"], .game-popup')
        .filter({ visible: true }).first().textContent().catch(() => '');
      const currencyFound = (modalText ?? '').includes(EXPECTED_CURRENCY);
      if (!currencyFound) {
        const found = ['£', '€', '$'].filter(s => (modalText ?? '').includes(s));
        console.log('GIM-01 currencies found: ' + (found.join(', ') || 'none'));
      }
      console.log('GIM-01 currency ' + EXPECTED_CURRENCY + ' found: ' + currencyFound);
      expect(currencyFound).toBe(true);
    });

    await runStep('Step 12: Click X -> game info modal closes', async () => {
      await closeGameInfoModal();
      await expect(page).not.toHaveURL(/#gamepage/, { timeout: 8_000 });
      console.log('GIM-01 URL after modal close: ' + page.url());
    });

    await runStep('Steps 14-16: Hover first game tile -> Play CTA -> registration modal', async () => {
      // Full navigation to properly unmount the React GamePopup component
      await page.goto('', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');

      // Campaign popup appears ~3s after page load. Wait for it, then dismiss.
      // Strategy: wait 4s (longer than popup timer), then poll until popup is gone.
      await page.waitForTimeout(4_000);

      // Keep pressing Escape until no Popup_popup element is visible (max 5 attempts)
      for (let i = 0; i < 5; i++) {
        const popupVisible = await page.locator('[class*="Popup_popup"], .game-popup')
          .filter({ visible: true }).isVisible({ timeout: 500 }).catch(() => false);
        if (!popupVisible) break;
        await page.keyboard.press('Escape');
        await page.waitForTimeout(800);
      }

      // Confirm GamePopup is detached from DOM before hovering
      await page.locator('[class*="GamePopup"]').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(300);

      // Catalogs differ per GEO — always operate on the first real game
      // tile rather than a hardcoded title (see findGameLink for why).
      // Confirmed live on Lord Ping UK: a "TikiPop" tile has no <img>
      // markup at all in its accessibility tree (unlike every sibling
      // tile, which pairs an <img> with its link) — consistent with a
      // broken/missing image asset collapsing its container to 0x0.
      // findGameLink()'s own box filter rejects an already-0x0 candidate
      // at selection time, but this one measures fine THEN and collapses
      // moments later — a timing race a single point-in-time check can't
      // fully close. Loop with fresh re-measurement each attempt instead
      // of trusting one snapshot.
      let gameLink = await findGameLink();
      let box: { x: number; y: number; width: number; height: number } | null = null;
      const badHrefs = new Set<string>();
      for (let attempt = 0; attempt < 3; attempt++) {
        // Confirmed live on Lucky Me Slots (LMS) UK 2026-08-03: every tile
        // link on this brand is genuinely zero-size until hover-revealed
        // (not a broken tile like TikiPop above) — scrollIntoViewIfNeeded()
        // times out on ALL 3 attempts here since none ever gets a real box
        // this way. Catch rather than throw so this loop falls through to
        // its intended null-box fallback (hoverRevealAncestor below)
        // instead of failing the whole step on an uncaught timeout.
        await gameLink.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(500);
        box = await gameLink.boundingBox().catch(() => null);
        if (box && box.width > 0 && box.height > 0) break;
        const badHref = await gameLink.getAttribute('href').catch(() => null);
        if (badHref) badHrefs.add(badHref);
        gameLink = await findGameLink(badHrefs);
        box = null;
      }
      // Confirmed live on Lord Ping UK mobile: a real Playwright .hover()
      // times out here because the fixed/sticky MobileFooter bottom-nav bar
      // physically overlaps the tile and "intercepts pointer events" for
      // the simulated mouse move — consistent with the touch-devices-have-
      // no-hover-state reality already documented below (real mobile users
      // never hover at all; the CTA click a few lines down already uses a
      // native evaluate() click that works regardless of CSS :hover state).
      // Skip the hover simulation entirely on mobile rather than fighting a
      // real device limitation that doesn't affect actual users.
      // Confirmed live on Lord Ping UK desktop too, reproduced across
      // multiple full runs: this specific "TikiPop" tile ALWAYS reports
      // "element is not visible" to Playwright's own actionability check
      // for the full 10s, even though a plain getBoundingClientRect() read
      // moments earlier shows a non-zero box — a persistent CSS state
      // (opacity/visibility, not layout collapse) that a bounding-box
      // measurement alone can't detect, not a timing race. Treat the hover
      // as best-effort: catch and fall through to the CTA click below
      // (which already works via native evaluate() regardless of CSS
      // :hover state) rather than failing the whole step over a hover this
      // one broken tile can never satisfy.
      if (!isMobile && box) {
        await page.mouse.move(50, 50);
        await page.waitForTimeout(300);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 });
        await gameLink.hover({ timeout: 5_000 }).catch(() => {});
        await page.waitForTimeout(1_500);
      } else if (!isMobile) {
        // Confirmed live on Lucky Me Slots (LMS) UK 2026-08-03: this
        // brand's tile link is genuinely zero-size at rest (box stayed
        // null above), same hover-reveal pattern as Step 1's
        // hoverRevealAncestor — hover the nearest sized ancestor instead
        // of a coordinate-based mouse move, which has nothing to target
        // without a real box.
        await hoverRevealAncestor(gameLink);
        await page.waitForTimeout(300);
      }

      // Confirmed live: the hover "JUGAR" text is just an image/text swap on
      // the SAME tile link, not a separate element — so clicking it goes
      // wherever that tile's link normally goes. That's not consistent
      // per-game: some tiles route straight to registration when logged
      // out, others open the game info modal first (same as a plain click,
      // per Step 1). Try the distinct-overlay case first in case a
      // particular tile does have one; either way, fall through to the
      // modal's own Play CTA (same button confirmed working in Step 3b) so
      // this step reaches registration regardless of which tile landed us
      // in the modal.
      // Confirmed live on SNG AB mobile: this CTA can exist (count 1) with a
      // genuine 0×0 bounding box (desktop-only hover-reveal element, see
      // Step 3b's note) — `.filter({ visible: true })` then reports it as
      // absent even though it's the correct, right element, silently
      // falling through to the tile-click branch and never reaching
      // registration. Check existence by count, not visibility, and use a
      // native click either way so a zero-size element still works.
      // Confirmed live on Lucky Me Slots (LMS) UK 2026-08-03: this brand's
      // real "Play Now" button is a SIBLING of the link's own immediate
      // wrapping div (both live inside a shared `.game-cta` container one
      // level higher), so gameLink.locator('xpath=..') alone never found
      // it (0 count). Widen the search scope to the nearest `.game-cta`/
      // `.game-box` ancestor when one exists, falling back to the plain
      // immediate parent for every other brand (unaffected — a wider scope
      // that also contains the immediate parent is a superset match, not a
      // behavior change for brands where the CTA already sits there).
      const widerScope = gameLink.locator('xpath=ancestor::*[contains(@class,"game-cta") or contains(@class,"game-box")][1]');
      const hasWiderScope = await widerScope.count() > 0;
      const ctaContainer = hasWiderScope ? widerScope : gameLink.locator('xpath=..');
      const tileCta = playCtaLocator(ctaContainer, strings.playCta).first();
      const ctaExists = await tileCta.count() > 0;
      if (ctaExists) {
        await tileCta.evaluate((el: HTMLElement) => el.click());
      } else {
        await gameLink.click({ force: true });
      }
      console.log('GIM-01 Play CTA found on tile: ' + ctaExists);
      await page.waitForTimeout(2_000);

      if (page.url().includes('#gamepage/')) {
        const modal = page.locator('[class*="Popup_popup"], .game-popup').filter({ visible: true }).first();
        const modalPlayCta = playCtaLocator(modal, strings.playCta).first();
        if (await modalPlayCta.count() > 0) {
          await modalPlayCta.evaluate((el: HTMLElement) => el.click());
          await page.waitForTimeout(2_000);
        }
      }
    });

    await runStep('Step 17: Registration modal visible + URL has /#account', async () => {
      if (!geoFeatures.hasAccountModal) {
        console.log('GIM-01 Step 17 skipped — no #account modal for this GEO');
        return;
      }
      await expect(page).toHaveURL(/#account/, { timeout: 10_000 });
      console.log('GIM-01 Registration modal at: ' + page.url());
    });

    await runStep('Step 18: Close registration modal -> test complete', async () => {
      if (!geoFeatures.hasAccountModal) {
        console.log('GIM-01 Step 18 skipped — no #account modal for this GEO');
        return;
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1_200);
      if (page.url().includes('#account')) {
        await page.goto('', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(500);
      }
      await expect(page).not.toHaveURL(/#account/, { timeout: 5_000 });
      console.log('GIM-01 COMPLETE');
    });

    } finally {
      printSummary();
    }
  });

});

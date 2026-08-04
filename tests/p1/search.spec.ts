import { test, expect } from '../../helpers/stealth-fixtures';
import { dismissCampaignPopup, dismissCookieConsent, setupCampaignPopupWatcher, playCtaLocator } from '../../helpers/common';
import { currentLocaleStrings } from '../../helpers/locale-strings';
import { currentGeoFeatures } from '../../helpers/geo-features';

/**
 * GS-01: Game - Search
 * Scope: Full search flow — open search panel, type a query, open a game
 * info modal from results, close it, hover a tile to reveal the Play It
 * CTA, route to registration, close the registration modal, and re-open
 * search / navigate Back.
 */

test.describe('P1 - Search', () => {

  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await setupCampaignPopupWatcher(page);
    await page.goto('', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000);
    await dismissCookieConsent(page);
    await dismissCampaignPopup(page);
    await page.waitForTimeout(1_000);
  });

  test('GS-01: Search flow', async ({ page }) => {
    test.setTimeout(120_000);

    const results: { label: string; status: string }[] = [];

    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }

    function printSummary() {
      console.log('\n' + '═'.repeat(45));
      console.log('  GS-01 SEARCH - RESULTS');
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

    // Auto-records pass/fail — failed steps appear in summary as ❌
    async function runStep(label: string, fn: () => Promise<void>) {
      await test.step(label, async () => {
        try {
          await fn();
          record(label, true);
        } catch (e) {
          record(label, false);
          throw e;
        }
      });
    }

    const strings = currentLocaleStrings();
    const geoFeatures = currentGeoFeatures();
    const isMobile = test.info().project.name.endsWith('-mobile');
    // Confirmed live on Lucky Me Slots (LMS) SE 2026-08-04: with only 2
    // categories and few real results, the search panel's own "browse
    // category" link (bare href="/online-slots/", matching this selector's
    // substring check with no slug after it) got picked as a "genuine"
    // result and clicked instead of an actual game tile — it isn't caught
    // by realNavHrefs() below since it lives inside the search-results
    // panel, not the header/sidebar nav. Exclude the bare category href
    // itself the same way game-info-modal.spec.ts's selector already does;
    // harmless no-op for brands whose real game tiles are individually
    // slugged and never end in the bare substring anyway.
    const gameLinkSelector = geoFeatures.searchResultHrefSubstrings
      .map(sub => `a[href*="${sub}"]:not([href$="${sub}"])`)
      .join(', ');

    try {

    // ── Step 1: Click Search button in header ────────────────────────────
    await runStep('Step 1: Search button → search panel opens', async () => {
      // On Slingo/SpinGenie, the header's own #search link is CSS-hidden at
      // mobile breakpoints (confirmed live in website-header.spec.ts) —
      // mobile's visible one lives in the sticky bottom nav instead, so an
      // unscoped .first() grabs the wrong, invisible one. Genting Casino
      // does NOT hide its header search on mobile (confirmed live on GC SE,
      // 2026-07-24 — no [class*="MobileFooter"] search link exists at all,
      // the header's #search link stays visible and clickable at mobile
      // width), so fall back to the plain header link when the
      // MobileFooter-scoped one genuinely doesn't exist for this brand.
      const mobileFooterSearch = page.locator('[class*="MobileFooter"] a[href="#search"]').first();
      // Confirmed live on Prime Slots (PSL) UK 2026-07-31: this brand
      // renders TWO a[href="#search"] elements on mobile — the desktop
      // header's own (now CSS-hidden at mobile width) and a second, real
      // "Search game" one inside its own mobile menu drawer. An unscoped
      // `.first()` picks whichever is first in DOM order regardless of
      // which one is actually visible — filter to the genuinely visible
      // copy instead, same fix already needed for other GEOs' duplicate
      // hidden/visible pairs.
      const searchLink = isMobile && (await mobileFooterSearch.count()) > 0
        ? mobileFooterSearch
        : page.locator('a[href="#search"]').filter({ visible: true }).first();
      // Confirmed live on ZI UK: this brand has no separate header search
      // icon at all — its only #search link is the hamburger sidebar's
      // "Search game" item, off-canvas until the sidebar is opened.
      if (geoFeatures.searchRequiresSidebarOpen && !(isMobile && (await mobileFooterSearch.count()) > 0)) {
        await page.evaluate(() => {
          (document.querySelector('[class*="hamburger" i], #menu-X') as HTMLElement | null)?.click();
        });
        await page.waitForTimeout(600);
        await dismissCampaignPopup(page);
      }
      await expect(searchLink).toBeVisible({ timeout: 10_000 });
      await searchLink.click({ force: true });
      await expect(page).toHaveURL(/#search/, { timeout: 10_000 });
      await page.waitForTimeout(1_500);
    });

    // ── Step 2: Click the search bar ────────────────────────────────────
    await runStep('Step 2: Search bar is clickable', async () => {
      const searchInput = page.getByPlaceholder(strings.searchPlaceholder).first();
      await expect(searchInput).toBeVisible({ timeout: 5_000 });
      // Confirmed live on ZI UK: opening the search panel via the sidebar
      // (searchRequiresSidebarOpen) leaves the sidebar drawer's own backdrop
      // in the DOM behind the search popup, overlapping the search input and
      // intercepting a plain click — force bypasses that, same as the
      // sidebar link click itself already needs above.
      await searchInput.click({ force: geoFeatures.searchRequiresSidebarOpen ?? false });
    });

    // ── Step 3: Type the GEO's search term ───────────────────────────────
    await runStep(`Step 3: Type "${geoFeatures.searchTerm}" → results appear`, async () => {
      const searchInput = page.getByPlaceholder(strings.searchPlaceholder).first();
      await searchInput.press('Control+a');
      await searchInput.fill(geoFeatures.searchTerm);
      await page.waitForTimeout(2_500);
    });

    // ── Step 4: Click a game title → info modal opens ────────────────────
    // Scoped to the actual results container — confirmed live on MC: an
    // unscoped page-wide search for the game-link selector can match a
    // same-href game tile from the homepage's own showcase grid sitting
    // behind the search overlay (not a descendant of the results container
    // at all), which silently no-ops when clicked instead of opening the
    // info modal.
    // body.searching — confirmed live on Prime Slots (PSL) UK 2026-07-30:
    // this brand has no GameSearchPopup class at all (0 found); its real
    // search-open state is a plain `search-open` class on <body> with the
    // results rendered in the normal page flow, not a dedicated popup
    // container — scope to body.search-open instead when GameSearchPopup
    // doesn't exist.
    const searchResultsContainer = () => page.locator('[class*="GameSearchPopup"], body.search-open').filter({ visible: true }).first();

    // .main-tabs/.header-menu-dropdown — confirmed live on Prime Slots (PSL)
    // UK 2026-07-30: this brand's search results container (body.search-open)
    // includes the whole page, header nav included, and its dropdown-child
    // nav links (e.g. "/slots/new/") sit well below y=50 once their parent
    // panel is revealed, so the plain y-based heuristic below isn't enough
    // to skip them — exclude by real href instead, same fix already applied
    // in game-info-modal.spec.ts.
    async function realNavHrefs(): Promise<Set<string>> {
      const navHrefList = await page.locator('[class*="Nav_nav__"] a[href], [class*="MainMenu_main-menu"] a[href], .main-tabs a[href], .header-menu-dropdown a[href], #top-nav a[href]')
        .evaluateAll(els => els.map(el => (el as HTMLAnchorElement).href));
      return new Set(navHrefList);
    }

    let gameTitle = '';
    await runStep('Step 4: Click game title → info modal appears', async () => {
      const vh = page.viewportSize()?.height ?? 720;
      const navHrefs = await realNavHrefs();
      const gameLinks = searchResultsContainer().locator(gameLinkSelector);
      const count = await gameLinks.count();
      let titleLink = gameLinks.first();
      // Confirmed live on Lucky Me Slots (LMS) UK 2026-08-03: every one of
      // this brand's game-tile title links is genuinely zero-size until its
      // ancestor `.game-box`-style tile is hovered (the same hover-reveal
      // pattern already handled in game-info-modal.spec.ts's
      // hoverRevealAncestor) — the box.width > 30 check below rejected
      // every real candidate here, silently falling through to a wrong
      // default link (a bare category href leaked through). Hover-reveal
      // each non-nav candidate before checking its box; harmless no-op on
      // brands where the link already has real dimensions at rest.
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
        // force:true + short timeout — confirmed live on Lucky Me Slots
        // (LMS) UK 2026-08-03: a plain .hover() retried against a
        // genuinely intercepting element (an unrelated lazy-loading
        // sibling tile image, or the search input box) for its full
        // default 30s before giving up — with up to 20 candidates checked
        // in this loop, that alone blew through the whole test's budget.
        // force skips the pointer-interception hit-test (only the CSS
        // :hover state matters here, not an unobstructed real click).
        if (ancestorElement) await ancestorElement.hover({ force: true, timeout: 2_000 }).catch(() => {});
      }
      // Confirmed live on Lucky Me Slots (LMS) UK 2026-08-03 desktop: none
      // of this brand's real candidates ever satisfy the strict y>50/vh
      // sanity window below (this brand's search-results grid lays out
      // differently), so the loop always fell through to the unconditional
      // `gameLinks.first()` default — which is a bare nav-href category
      // link, not excluded by that default at all. Track the first
      // genuinely non-nav candidate seen as a safety-net fallback so a
      // failed sanity check never silently regresses to a wrong link.
      let firstNonNavCandidate: ReturnType<typeof page.locator> | null = null;
      for (let i = 0; i < Math.min(count, 20); i++) {
        const href = await gameLinks.nth(i).getAttribute('href').catch(() => null);
        if (href && navHrefs.has(new URL(href, page.url()).href)) continue;
        if (!firstNonNavCandidate) firstNonNavCandidate = gameLinks.nth(i);
        // Check the box first without hovering — the common case (a real
        // box already, no reveal needed) stays exactly as fast as before.
        // Only hover-reveal (LMS's case) when the box looks genuinely
        // zero/tiny, and give the CSS "fadeIn" transition a brief moment
        // to finish before re-checking, so the very first valid candidate
        // succeeds immediately instead of looping through all 20.
        let box = await gameLinks.nth(i).boundingBox().catch(() => null);
        if (!box || box.width <= 30) {
          await hoverRevealAncestor(gameLinks.nth(i));
          await page.waitForTimeout(400);
          box = await gameLinks.nth(i).boundingBox().catch(() => null);
        }
        if (box && box.y > 50 && box.y < vh && box.width > 30) {
          titleLink = gameLinks.nth(i);
          gameTitle = (await titleLink.textContent().catch(() => ''))?.trim() ?? '';
          break;
        }
      }
      if (gameTitle === '' && firstNonNavCandidate) {
        titleLink = firstNonNavCandidate;
        gameTitle = (await titleLink.textContent().catch(() => ''))?.trim() ?? '';
      }
      await hoverRevealAncestor(titleLink);
      // Confirmed live on MC: scrollIntoViewIfNeeded() itself can hang
      // past its timeout on a tile already picked to be within the current
      // viewport (see the box.y check above) — same "already visible but
      // the call still waits" quirk as game-category-navigation.spec.ts.
      // Swallow it and fall through to the force click below rather than
      // failing the whole step over a no-op scroll.
      await titleLink.scrollIntoViewIfNeeded().catch(() => {});
      // Confirmed live on MC: the scrollable results container itself (and a
      // sibling image/back-button) can sit on top of the target link right
      // after scrollIntoViewIfNeeded(), intercepting a plain click — force
      // it through rather than waiting on actionability that never resolves.
      // Confirmed live on Lord Ping UK: force:true still throws "Element is
      // outside of the viewport" if the layout shifts (e.g. lazy-loaded
      // rows above pushing content down) between the box check above and
      // the click itself, since force only skips the actionability WAIT,
      // not the coordinate requirement. A native el.click() via evaluate
      // sidesteps coordinates/hit-testing entirely — same pattern already
      // used for this exact class of issue elsewhere in the project.
      await titleLink.evaluate((el: HTMLElement) => el.click());
      await page.waitForTimeout(2_000);
      // Confirmed live on Prime Slots (PSL) UK 2026-07-30: this brand's
      // search-result tile click opens the SAME plain #gamepage/<slug> hash
      // as a regular homepage tile click, not a distinct #search-gamepage/
      // hash like every other brand — widened rather than assume every
      // brand's search results use their own separate route.
      await expect(page).toHaveURL(/#(search-)?gamepage\//, { timeout: 10_000 });
      console.log('GS-01 modal opened for: ' + gameTitle);
    });

    // ── Step 5: Click X on the game info modal ───────────────────────────
    await runStep('Step 5: Click X → game info modal closes', async () => {
      // Scoped to the game popup overlay itself (class contains
      // "GamePopup") — confirmed live the broad, unscoped close-button
      // selector previously used here could match an unrelated element
      // elsewhere on the page instead of this modal's real close button,
      // silently doing nothing while still reporting "found a close
      // button" — leaving the modal fully open, not just fading out.
      const gamePopup = page.locator('[class*="GamePopup"]').filter({ visible: true }).first();
      const closeBtn = gamePopup.locator(
        '[class*="close" i][class*="button" i], [class*="Close"][class*="Button"], ' +
        'button[aria-label*="close" i], button[aria-label*="Close"], ' +
        '[class*="close" i], [class*="Close_"], [class*="close_"]'
      ).filter({ visible: true }).first();

      // Confirmed live: the close click (or Escape fallback) can silently
      // no-op on the first attempt — same "click lands before the element
      // is truly interactive" quirk seen on the consent checkboxes
      // elsewhere in this suite. Retry-and-verify instead of trusting one
      // attempt; a lingering overlay here physically intercepts the next
      // step's click, landing on ITS OWN leftover "Play it" link (for
      // whatever game was just closed) instead of the live search result.
      for (let attempt = 0; attempt < 4; attempt++) {
        const closeBtnVisible = await closeBtn.isVisible({ timeout: 3_000 }).catch(() => false);
        if (closeBtnVisible) {
          await closeBtn.click({ force: true }).catch(() => {});
        } else {
          await page.keyboard.press('Escape');
        }
        await page.waitForTimeout(1_000);
        const stillOpen = await gamePopup.isVisible({ timeout: 1_000 }).catch(() => false);
        if (!stillOpen) break;
      }
      await page.waitForTimeout(500);
      // Confirmed live on ZI UK: the close button (span.Popup_close) hides
      // the GamePopup element (gamePopup.isVisible() above correctly reports
      // false) but does NOT pop the URL hash back to plain #search — it's
      // left stuck on #search-gamepage/<slug>/. The old /#search/ regex here
      // matched that leftover URL too (it's a substring match, not anchored)
      // and silently passed, masking the real bug: because the route never
      // actually returned to bare #search, the app's SearchPopup component
      // (which only renders for that exact route) stayed hidden too — the
      // real cause of Step 6's "search popup missing entirely" failure.
      // Anchor the regex so a leftover -gamepage/ URL is caught here instead
      // of silently breaking a later step. Two recovery attempts confirmed
      // NOT reliable on ZI: goBack() skips straight past #search to the bare
      // homepage "/" (the sidebar-driven route apparently doesn't push a
      // real, distinct history entry the way a plain header link click
      // would), and re-clicking the sidebar's #search link fails outright —
      // the hamburger toggle itself doesn't visually reopen the drawer while
      // still on the #search-gamepage/ route (click registers, sidebar stays
      // off-canvas). Directly assigning location.hash IS reliable — unlike
      // history.replaceState, a real hash assignment fires a hashchange
      // event the app's own router picks up, landing cleanly on bare
      // #search with the SearchPopup visible again (confirmed live).
      if (!/#search$/.test(page.url())) {
        await page.evaluate(() => { window.location.hash = 'search'; });
        await page.waitForTimeout(1_500);
      }
      await expect(page).toHaveURL(/#search$/, { timeout: 10_000 });
      // Fail loudly here rather than silently continuing with it still
      // open — a silent timeout previously let the two-steps-later bug through.
      await expect(gamePopup).toBeHidden({ timeout: 5_000 });
    });

    // ── Step 6: Hover a game → PLAY IT visible ───────────────────────────
    await runStep('Step 6: Hover game tile → Play It CTA appears', async () => {
      // Same skip condition as Steps 7-8 below — the Play It CTA exists
      // solely to hand off into registration/login, so there's nothing
      // meaningful to check here on a GEO with no account modal (either a
      // real gap, or — as on Lucky Me Slots (LMS) SE 2026-08-04 — a
      // deliberate scope decision to not test login/registration at all).
      if (!geoFeatures.hasAccountModal) {
        console.log('GS-01 Step 6 skipped — no login/account modal for this GEO');
        return;
      }
      // Confirmed live on Lucky Me Slots (LMS) UK 2026-08-03 mobile: this
      // brand's `.game-cta` overlay (the "Play Now" button this step and
      // Step 7 need) is genuinely `display: none` at mobile widths — a
      // real CSS media-query removal, not just CSS-hover-hidden like every
      // other brand. Its mobile-visible replacement (`.mobile-game-name`
      // title link) only opens the game info modal (Step 4's flow, already
      // confirmed working), never a direct-to-registration shortcut — real
      // mobile users of this brand have no equivalent affordance at all.
      // Skip cleanly rather than forcing a flow that doesn't exist.
      if (isMobile) {
        const ctaDisplay = await page.locator('.game-cta').first()
          .evaluate(el => getComputedStyle(el).display).catch(() => 'none');
        if (ctaDisplay === 'none') {
          console.log('GS-01 Step 6 skipped — no mobile Play CTA affordance for this brand');
          return;
        }
      }
      const vh = page.viewportSize()?.height ?? 720;
      // Confirmed live on ZI UK: Step 5's location.hash recovery remounts the
      // whole search component fresh — the typed query and its results from
      // Step 3 are gone, leaving an empty "Find your game" state with no
      // tiles to hover. Re-type the query here if that happened, rather than
      // assuming Step 3's results are still around.
      let count = await searchResultsContainer().locator(gameLinkSelector).count();
      if (count === 0) {
        const searchInputAgain = page.getByPlaceholder(strings.searchPlaceholder).first();
        if (await searchInputAgain.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await searchInputAgain.click({ force: true }).catch(() => {});
          await searchInputAgain.fill(geoFeatures.searchTerm).catch(() => {});
          await page.waitForTimeout(2_500);
        }
      }
      const gameLinks = searchResultsContainer().locator(gameLinkSelector);
      count = await gameLinks.count();
      const navHrefsStep6 = await realNavHrefs();
      let titleLink = gameLinks.first();
      // Confirmed live on Lucky Me Slots (LMS) UK 2026-08-03: same hover-
      // reveal fix as Step 4 — check the box first (fast path, unchanged
      // for every other brand), only hover-reveal when it looks zero/tiny.
      async function hoverRevealAncestorStep6(locator: ReturnType<typeof page.locator>) {
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
        // force:true + short timeout — confirmed live on Lucky Me Slots
        // (LMS) UK 2026-08-03: a plain .hover() retried against a
        // genuinely intercepting element (an unrelated lazy-loading
        // sibling tile image, or the search input box) for its full
        // default 30s before giving up — with up to 20 candidates checked
        // in this loop, that alone blew through the whole test's budget.
        // force skips the pointer-interception hit-test (only the CSS
        // :hover state matters here, not an unobstructed real click).
        if (ancestorElement) await ancestorElement.hover({ force: true, timeout: 2_000 }).catch(() => {});
      }
      // Same LMS desktop finding as Step 4 above — track the first
      // genuinely non-nav candidate as a safety net in case none ever
      // satisfies the strict y/width sanity window.
      let firstNonNavCandidateStep6: ReturnType<typeof page.locator> | null = null;
      let foundGoodCandidateStep6 = false;
      for (let i = 0; i < Math.min(count, 20); i++) {
        const href = await gameLinks.nth(i).getAttribute('href').catch(() => null);
        if (href && navHrefsStep6.has(new URL(href, page.url()).href)) continue;
        if (!firstNonNavCandidateStep6) firstNonNavCandidateStep6 = gameLinks.nth(i);
        let box = await gameLinks.nth(i).boundingBox().catch(() => null);
        if (!box || box.width <= 30) {
          await hoverRevealAncestorStep6(gameLinks.nth(i));
          await page.waitForTimeout(400);
          box = await gameLinks.nth(i).boundingBox().catch(() => null);
        }
        if (box && box.y > 50 && box.y < vh && box.width > 30) {
          titleLink = gameLinks.nth(i);
          foundGoodCandidateStep6 = true;
          break;
        }
      }
      if (!foundGoodCandidateStep6 && firstNonNavCandidateStep6) {
        titleLink = firstNonNavCandidateStep6;
      }
      // Same MC hang seen in Step 4 above — swallow rather than fail.
      await hoverRevealAncestorStep6(titleLink);
      await titleLink.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(500);

      // Confirmed live: touch devices have no hover state at all — the Play
      // It CTA already renders statically without any hover, and real mobile
      // users go straight to #account on tap. Simulating a desktop-style
      // page.mouse hover on a touch-emulated (hasTouch: true) page sends a
      // hybrid input signal no real device produces — confirmed this was
      // actually causing the click below to land on the game info modal
      // (#search-gamepage/) instead of registration, not just being
      // redundant. Desktop genuinely needs the hover to reveal the CTA via
      // CSS :hover, so this stays unchanged there.
      // Scoped to the search popup — an unscoped page-wide search for this
      // CTA text can match unrelated content-block buttons elsewhere on the
      // page (confirmed live: a promo tile also says "A JUGAR" on ES).
      const searchPopup = page.locator('[class*="Popup_popup"], body.search-open').filter({ visible: true }).first();
      const playItBtn = playCtaLocator(searchPopup, strings.playCta).filter({ visible: true }).first();

      // Confirmed live on ROW: a single hover-then-check can miss if the
      // CSS hover-reveal animation is still mid-play when the assertion
      // fires (deep into a long single-worker run, not every time) — same
      // "one-shot check under load" flakiness already seen elsewhere in
      // this suite (cookie consent, campaign popup). Retry the hover itself
      // rather than just re-checking, since a stale mouse position won't
      // re-trigger the CSS hover state on its own.
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!isMobile) {
          // Confirmed live on ZI UK: titleLink resolves to the "desktop"
          // caption link, which sits AFTER/OUTSIDE .GameTile_main as a
          // sibling — the old `preceding::img[1]` xpath from there lands on
          // the "mobile" variant image (0x0 at desktop width, since it's
          // CSS-hidden), so its boundingBox() failed the y>50 sanity check
          // and silently fell back to titleLink's OWN tiny caption-text box.
          // Hovering just that caption never triggers the sibling
          // .GameTile_tile-hover's CSS :hover reveal at all (it's scoped to
          // .GameTile_main, not the whole tile). Go straight to the actual
          // hoverable container instead of inferring it from a neighboring
          // image — falls back to the old img/titleLink boxes if this
          // brand's markup doesn't have one, so existing GEOs are unaffected.
          const tileContainer = titleLink
            .locator('xpath=ancestor::li[1]')
            .locator('[class*="GameTile_main"], [class*="GameTile_search-tile"]')
            .first();
          const gameImg = titleLink.locator('xpath=preceding::img[1]').first();
          // Smooth mouse movement so hover animation is visually visible
          // Start from top-left corner so the glide across the screen is clearly seen
          const containerBox = await tileContainer.boundingBox().catch(() => null);
          const imgBox = containerBox ? null : await gameImg.boundingBox().catch(() => null);
          const targetBox = containerBox ?? ((imgBox && imgBox.y > 50 && imgBox.y < vh) ? imgBox
            : await titleLink.boundingBox().catch(() => null));
          if (targetBox) {
            const cx = targetBox.x + targetBox.width / 2;
            const cy = targetBox.y + targetBox.height / 2;
            // Confirmed live on ZI UK: starting the glide at the raw page
            // corner (50, 50) — outside the search popup's own bounds —
            // closes the whole popup outright (this brand's overlay reacts
            // to the mouse leaving it, unlike every other brand onboarded so
            // far). Start from inside the popup itself instead, near its own
            // top-left corner, so the glide stays within it the whole time.
            const popupBox = await searchPopup.boundingBox().catch(() => null);
            const startX = popupBox ? popupBox.x + 20 : 50;
            const startY = popupBox ? popupBox.y + 20 : 50;
            await page.mouse.move(startX, startY);            // start far from target, but inside the popup
            await page.waitForTimeout(200);
            await page.mouse.move(cx, cy, { steps: 30 });   // slow glide to game tile
          }
          await page.waitForTimeout(1_500); // let animation fully play
        } else {
          // Confirmed live on Lucky Me Slots (LMS) UK 2026-08-03: unlike
          // the brands this mobile no-op was written for, LMS's CTA stays
          // CSS-hover-gated even under Pixel 5/touch emulation — it does
          // NOT render statically on mobile the way the comment above
          // assumes. Try a hover-reveal on the tile's nearest sized
          // ancestor as a fallback; harmless no-op if the CTA is already
          // visible without it (every other brand this block was written
          // for), since isVisible below already short-circuits on success.
          await hoverRevealAncestorStep6(titleLink);
          await page.waitForTimeout(400);
        }
        const visible = await playItBtn.isVisible({ timeout: 3_000 }).catch(() => false);
        if (visible) break;
      }
      await expect(playItBtn).toBeVisible({ timeout: 5_000 });
    });

    // ── Step 7: Click PLAY IT → registration modal opens ────────────────
    await runStep('Step 7: Click Play It → registration modal opens', async () => {
      if (!geoFeatures.hasAccountModal) {
        // Confirmed live on SE: clicking Play triggers no navigation, but
        // leaves behind an invisible <son-auth-modals> element that still
        // intercepts pointer events site-wide, breaking the later Back
        // button click (Step 11) even though nothing visibly changed.
        // Skip the click entirely for GEOs where it wouldn't do anything.
        console.log('GS-01 Step 7 skipped — clicking Play does not open an #account modal for this GEO');
        return;
      }
      // Same LMS UK mobile finding as Step 6 — no Play CTA affordance
      // exists at all at this breakpoint, so there's nothing for this step
      // to click.
      if (isMobile) {
        const ctaDisplay = await page.locator('.game-cta').first()
          .evaluate(el => getComputedStyle(el).display).catch(() => 'none');
        if (ctaDisplay === 'none') {
          console.log('GS-01 Step 7 skipped — no mobile Play CTA affordance for this brand');
          return;
        }
      }
      // Scoped to the search popup — an unscoped page-wide search for this
      // CTA text can match unrelated content-block buttons elsewhere on the
      // page (confirmed live: a promo tile also says "A JUGAR" on ES).
      const searchPopup = page.locator('[class*="Popup_popup"], body.search-open').filter({ visible: true }).first();
      const playItBtn = playCtaLocator(searchPopup, strings.playCta).filter({ visible: true }).first();
      // Confirmed live on Prime Slots (PSL) UK 2026-07-31: this brand's real
      // tile markup renders TWO "Play" buttons per game (a hover-reveal one
      // under .game-up, and a second one nested in the .game-link span) that
      // share the same (invalid, duplicate) id — each is a real, functional
      // 0×0-sized element outside its own CSS :hover state, only gaining a
      // real bounding box while actively hovered. A real `.click({force:
      // true})` still needs genuine screen coordinates even with force, so it
      // can silently misfire if Step 6's hover has lapsed by the time this
      // click fires (mouse movement, a re-render, timing). A native
      // `el.click()` sidesteps hover/coordinates entirely — confirmed live
      // this reaches #account reliably regardless of which of the two
      // duplicate buttons is currently hover-visible — same pattern already
      // used for this exact class of issue elsewhere in this project (see
      // Step 4's titleLink click above).
      await playItBtn.evaluate((el: HTMLElement) => el.click());
      await page.waitForTimeout(3_000);
    });

    // ── Step 8: Verify registration modal + /#account slug ───────────────
    await runStep('Step 8: Registration modal visible + URL has /#account', async () => {
      if (!geoFeatures.hasAccountModal) {
        console.log('GS-01 Step 8 skipped — no login/account modal for this GEO');
        return;
      }
      // Same LMS UK mobile finding as Steps 6-7 — nothing was clicked, so
      // there's no modal to verify.
      if (isMobile) {
        const ctaDisplay = await page.locator('.game-cta').first()
          .evaluate(el => getComputedStyle(el).display).catch(() => 'none');
        if (ctaDisplay === 'none') {
          console.log('GS-01 Step 8 skipped — no mobile Play CTA affordance for this brand');
          return;
        }
      }
      await expect(page).toHaveURL(/#account/, { timeout: 15_000 });
    });

    // ── Step 9: Click X on registration modal ────────────────────────────
    await runStep('Step 9: Click X → registration modal closes', async () => {
      // The X close button is always at the top-right corner of the modal.
      // Instead of guessing CSS class names (which also match "Report a problem"),
      // we find the modal container and click its top-right corner directly.
      const modal = page.locator('[class*="Popup_popup"]').filter({ visible: true }).first();
      const box = await modal.boundingBox().catch(() => null);

      if (box) {
        // Click top-right corner of the modal where the X button sits
        await page.mouse.click(box.x + box.width - 20, box.y + 20);
        await page.waitForTimeout(1_000);
      }

      // Fallback: Escape key
      if (page.url().includes('#account')) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1_000);
      }

      // Confirmed live on Prime Slots (PSL) UK 2026-07-31: this brand's
      // account modal is a Tailwind-styled web component (.modal-content),
      // not the AccountPopup_account/Popup_popup React CSS-module class
      // every other brand shares — the corner-click above never finds a
      // real bounding box (modal locator matches 0 elements), and Escape
      // confirmed does NOT close it either. Same closeAccountModal() fallback
      // already used in website-header/sidebar-navigation/blog-page-header/
      // game-info-modal specs: a direct click on the real close icon, a
      // hash reset (fires a real hashchange the app's router picks up,
      // unlike history.pushState), and force-hiding the still-mounted
      // <son-auth-modals> element so it stops intercepting later clicks.
      if (page.url().includes('#account')) {
        const closeIcon = page.locator('.modal-header .cursor-pointer').last();
        if (await closeIcon.count() > 0) {
          await closeIcon.evaluate((el: HTMLElement) => el.click()).catch(() => {});
          await page.waitForTimeout(800);
        }
        if (page.url().includes('#account')) {
          await page.evaluate(() => { history.pushState({}, '', location.pathname); });
          await page.waitForTimeout(500);
        }
        await page.evaluate(() => {
          document.querySelectorAll('son-auth-modals').forEach(el => {
            (el as HTMLElement).style.pointerEvents = 'none';
          });
        }).catch(() => {});
      }

      // After closing, URL should no longer have #account
      // Step 10 will re-open the search panel
      await expect(page).not.toHaveURL(/#account/, { timeout: 8_000 });
    });

    // ── Step 10: Click Search button again ───────────────────────────────
    await runStep('Step 10: Click Search button again → panel reopens', async () => {
      await dismissCampaignPopup(page);
      // Same MobileFooter-vs-plain-header fallback as Step 1 — see that
      // step's comment (GC doesn't hide its header search on mobile).
      // Same PSL UK duplicate-element fix as Step 1: filter to the
      // genuinely visible copy instead of an unscoped `.first()`.
      const mobileFooterSearch2 = page.locator('[class*="MobileFooter"] a[href="#search"]').first();
      const searchLink = isMobile && (await mobileFooterSearch2.count()) > 0
        ? mobileFooterSearch2
        : page.locator('a[href="#search"]').filter({ visible: true }).first();
      if (geoFeatures.searchRequiresSidebarOpen && !(isMobile && (await mobileFooterSearch2.count()) > 0)) {
        await page.evaluate(() => {
          (document.querySelector('[class*="hamburger" i], #menu-X') as HTMLElement | null)?.click();
        });
        await page.waitForTimeout(600);
        await dismissCampaignPopup(page);
      }
      await expect(searchLink).toBeVisible({ timeout: 10_000 });
      await searchLink.click({ force: true });
      await expect(page).toHaveURL(/#search/, { timeout: 10_000 });
      await page.waitForTimeout(1_500);
    });

    // ── Step 11: Click Back ──────────────────────────────────────────────
    await runStep('Step 11: Click Back → returns to homepage', async () => {
      // The visible "Back" text is screen-reader-only (0x0 on screen,
      // confirmed live in website-header.spec.ts) — the real clickable
      // element is this button.
      // Confirmed live on ZI UK: the desktop back control has NO text at all
      // (not even the screen-reader-only "Back" every other brand has) —
      // just an <i> icon inside button.SearchBar_search-back. Falling back
      // to the same class-based locator mobile already uses covers this
      // without affecting brands where the text-based one still matches.
      // Confirmed live on Prime Slots (PSL) UK 2026-07-31: this brand's real
      // mobile back control is `button.search-back` (plain Tailwind-style
      // class, no `SearchBar_` CSS-module prefix like every other brand) —
      // widened the class selector to match both.
      const backBtn = isMobile
        ? page.locator('[class*="SearchBar_search-back"], button.search-back').first()
        : page.getByText(strings.backButtonText, { exact: true }).or(page.locator('[class*="SearchBar_search-back"], button.search-back')).first();
      await expect(backBtn).toBeVisible({ timeout: 5_000 });
      // Confirmed live on ZI UK: a leftover GamePopup overlay (from Steps
      // 4-5's game info modal) physically covers this button — a plain
      // click keeps retrying against it for the full default timeout. A
      // native el.click() via evaluate fires directly on the button
      // regardless, same fix already used for website-header.spec.ts's
      // Promotions-icon click.
      await backBtn.evaluate((el: HTMLElement) => el.click());
      await page.waitForTimeout(2_000);
      // Confirmed live on MC SE mobile 2026-07-29: same leftover
      // #search-gamepage/<slug>/ hash already documented on ZI UK at Step 5
      // above — clicking Back here can register but leave the route stuck
      // on the game-specific hash instead of clearing it entirely. Same
      // reliable recovery: a direct location.hash assignment fires a real
      // hashchange the app's router picks up.
      if (/#search/.test(page.url())) {
        await page.evaluate(() => { window.location.hash = ''; });
        await page.waitForTimeout(1_500);
      }
      await expect(page).not.toHaveURL(/#search/);
    });

    } finally {
      printSummary();
    }
  });

});

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
    const gameLinkSelector = geoFeatures.searchResultHrefSubstrings
      .map(sub => `a[href*="${sub}"]`)
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
      const searchLink = isMobile && (await mobileFooterSearch.count()) > 0
        ? mobileFooterSearch
        : page.locator('a[href="#search"]').first();
      // Confirmed live on ZI UK: this brand has no separate header search
      // icon at all — its only #search link is the hamburger sidebar's
      // "Search game" item, off-canvas until the sidebar is opened.
      if (geoFeatures.searchRequiresSidebarOpen && !(isMobile && (await mobileFooterSearch.count()) > 0)) {
        await page.evaluate(() => {
          (document.querySelector('[class*="hamburger" i]') as HTMLElement | null)?.click();
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
    // Scoped to the actual results container — confirmed live on DE: an
    // unscoped page-wide search for the game-link selector can match a
    // same-href game tile from the homepage's own showcase grid sitting
    // behind the search overlay (not a descendant of the results container
    // at all), which silently no-ops when clicked instead of opening the
    // info modal.
    const searchResultsContainer = () => page.locator('[class*="GameSearchPopup"]').filter({ visible: true }).first();

    let gameTitle = '';
    await runStep('Step 4: Click game title → info modal appears', async () => {
      const vh = page.viewportSize()?.height ?? 720;
      const gameLinks = searchResultsContainer().locator(gameLinkSelector);
      const count = await gameLinks.count();
      let titleLink = gameLinks.first();
      for (let i = 0; i < Math.min(count, 20); i++) {
        const box = await gameLinks.nth(i).boundingBox().catch(() => null);
        if (box && box.y > 50 && box.y < vh && box.width > 30) {
          titleLink = gameLinks.nth(i);
          gameTitle = (await titleLink.textContent().catch(() => ''))?.trim() ?? '';
          break;
        }
      }
      // Confirmed live on MC/DE: scrollIntoViewIfNeeded() itself can hang
      // past its timeout on a tile already picked to be within the current
      // viewport (see the box.y check above) — same "already visible but
      // the call still waits" quirk as game-category-navigation.spec.ts.
      // Swallow it and fall through to the force click below rather than
      // failing the whole step over a no-op scroll.
      await titleLink.scrollIntoViewIfNeeded().catch(() => {});
      // Confirmed live on DE: the scrollable results container itself (and a
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
      await expect(page).toHaveURL(/#search-gamepage\//, { timeout: 10_000 });
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
      let titleLink = gameLinks.first();
      for (let i = 0; i < Math.min(count, 20); i++) {
        const box = await gameLinks.nth(i).boundingBox().catch(() => null);
        if (box && box.y > 50 && box.y < vh && box.width > 30) {
          titleLink = gameLinks.nth(i);
          break;
        }
      }
      // Same MC/DE hang seen in Step 4 above — swallow rather than fail.
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
      const searchPopup = page.locator('[class*="Popup_popup"]').filter({ visible: true }).first();
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
      // Scoped to the search popup — an unscoped page-wide search for this
      // CTA text can match unrelated content-block buttons elsewhere on the
      // page (confirmed live: a promo tile also says "A JUGAR" on ES).
      const searchPopup = page.locator('[class*="Popup_popup"]').filter({ visible: true }).first();
      const playItBtn = playCtaLocator(searchPopup, strings.playCta).filter({ visible: true }).first();
      await playItBtn.click({ force: true });
      await page.waitForTimeout(3_000);
    });

    // ── Step 8: Verify registration modal + /#account slug ───────────────
    await runStep('Step 8: Registration modal visible + URL has /#account', async () => {
      if (!geoFeatures.hasAccountModal) {
        console.log('GS-01 Step 8 skipped — no login/account modal for this GEO');
        return;
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

      // After closing, URL should no longer have #account
      // Step 10 will re-open the search panel
      await expect(page).not.toHaveURL(/#account/, { timeout: 8_000 });
    });

    // ── Step 10: Click Search button again ───────────────────────────────
    await runStep('Step 10: Click Search button again → panel reopens', async () => {
      await dismissCampaignPopup(page);
      // Same MobileFooter-vs-plain-header fallback as Step 1 — see that
      // step's comment (GC doesn't hide its header search on mobile).
      const mobileFooterSearch2 = page.locator('[class*="MobileFooter"] a[href="#search"]').first();
      const searchLink = isMobile && (await mobileFooterSearch2.count()) > 0
        ? mobileFooterSearch2
        : page.locator('a[href="#search"]').first();
      if (geoFeatures.searchRequiresSidebarOpen && !(isMobile && (await mobileFooterSearch2.count()) > 0)) {
        await page.evaluate(() => {
          (document.querySelector('[class*="hamburger" i]') as HTMLElement | null)?.click();
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
      const backBtn = isMobile
        ? page.locator('[class*="SearchBar_search-back"]').first()
        : page.getByText(strings.backButtonText, { exact: true }).or(page.locator('[class*="SearchBar_search-back"]')).first();
      await expect(backBtn).toBeVisible({ timeout: 5_000 });
      // Confirmed live on ZI UK: a leftover GamePopup overlay (from Steps
      // 4-5's game info modal) physically covers this button — a plain
      // click keeps retrying against it for the full default timeout. A
      // native el.click() via evaluate fires directly on the button
      // regardless, same fix already used for website-header.spec.ts's
      // Promotions-icon click.
      await backBtn.evaluate((el: HTMLElement) => el.click());
      await page.waitForTimeout(2_000);
      await expect(page).not.toHaveURL(/#search/);
    });

    } finally {
      printSummary();
    }
  });

});

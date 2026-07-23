import { test, expect } from '@playwright/test';
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
      // Header's own #search link is CSS-hidden at mobile breakpoints
      // (confirmed live in website-header.spec.ts) — mobile's visible one
      // lives in the sticky bottom nav, so an unscoped .first() grabs the
      // wrong, invisible one.
      const searchLink = isMobile
        ? page.locator('[class*="MobileFooter"] a[href="#search"]').first()
        : page.locator('a[href="#search"]').first();
      await expect(searchLink).toBeVisible({ timeout: 10_000 });
      await searchLink.click({ force: true });
      await expect(page).toHaveURL(/#search/, { timeout: 10_000 });
      await page.waitForTimeout(1_500);
    });

    // ── Step 2: Click the search bar ────────────────────────────────────
    await runStep('Step 2: Search bar is clickable', async () => {
      const searchInput = page.getByPlaceholder(strings.searchPlaceholder).first();
      await expect(searchInput).toBeVisible({ timeout: 5_000 });
      await searchInput.click();
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
      await titleLink.scrollIntoViewIfNeeded();
      // Confirmed live on DE: the scrollable results container itself (and a
      // sibling image/back-button) can sit on top of the target link right
      // after scrollIntoViewIfNeeded(), intercepting a plain click — force
      // it through rather than waiting on actionability that never resolves.
      await titleLink.click({ force: true });
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
      await expect(page).toHaveURL(/#search/, { timeout: 10_000 });
      // Fail loudly here rather than silently continuing with it still
      // open — a silent timeout previously let the two-steps-later bug through.
      await expect(gamePopup).toBeHidden({ timeout: 5_000 });
    });

    // ── Step 6: Hover a game → PLAY IT visible ───────────────────────────
    await runStep('Step 6: Hover game tile → Play It CTA appears', async () => {
      const vh = page.viewportSize()?.height ?? 720;
      const gameLinks = searchResultsContainer().locator(gameLinkSelector);
      const count = await gameLinks.count();
      let titleLink = gameLinks.first();
      for (let i = 0; i < Math.min(count, 20); i++) {
        const box = await gameLinks.nth(i).boundingBox().catch(() => null);
        if (box && box.y > 50 && box.y < vh && box.width > 30) {
          titleLink = gameLinks.nth(i);
          break;
        }
      }
      await titleLink.scrollIntoViewIfNeeded();
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
          const gameImg = titleLink.locator('xpath=preceding::img[1]').first();
          // Smooth mouse movement so hover animation is visually visible
          // Start from top-left corner so the glide across the screen is clearly seen
          const imgBox = await gameImg.boundingBox().catch(() => null);
          const targetBox = (imgBox && imgBox.y > 50 && imgBox.y < vh) ? imgBox
            : await titleLink.boundingBox().catch(() => null);
          if (targetBox) {
            const cx = targetBox.x + targetBox.width / 2;
            const cy = targetBox.y + targetBox.height / 2;
            await page.mouse.move(50, 50);                   // start far from target
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
      const searchLink = isMobile
        ? page.locator('[class*="MobileFooter"] a[href="#search"]').first()
        : page.locator('a[href="#search"]').first();
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
      const backBtn = isMobile
        ? page.locator('[class*="SearchBar_search-back"]').first()
        : page.getByText(strings.backButtonText, { exact: true }).first();
      await expect(backBtn).toBeVisible({ timeout: 5_000 });
      await backBtn.click();
      await page.waitForTimeout(2_000);
      await expect(page).not.toHaveURL(/#search/);
    });

    } finally {
      printSummary();
    }
  });

});

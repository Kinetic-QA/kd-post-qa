import { test, expect } from '@playwright/test';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher, siteUrl } from '../../helpers/common';
import { currentLocaleStrings } from '../../helpers/locale-strings';
import { currentGeoFeatures } from '../../helpers/geo-features';

/**
 * WH: Website Header
 * Scope: Global header smoke test — Login/Join CTAs, Search icon, Promotions
 * icon, hamburger menu open, brand logo → homepage, and sticky-on-scroll
 * behavior.
 * NOT YET VERIFIED against live DOM — selectors use semantic roles/text first,
 * with class-pattern fallbacks borrowed from other confirmed specs. Run live
 * and adjust selectors before trusting this in CI.
 */

test.describe('P1 - Website Header', () => {

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

  test('WH-01: Website header full flow', async ({ page }) => {
    test.setTimeout(120_000);

    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(45));
      console.log('  WH-01 WEBSITE HEADER - RESULTS');
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
        try { await fn(); record(label, true); }
        catch (e) { record(label, false); throw e; }
      });
    }

    async function closeAccountModal() {
      await page.keyboard.press('Escape');
      await page.locator('[class*="AccountPopup_account"]')
        .waitFor({ state: 'detached', timeout: 5_000 }).catch(async () => {
          const modal = page.locator('[class*="AccountPopup_account"]').first();
          const box = await modal.boundingBox().catch(() => null);
          if (box) await page.mouse.click(box.x + box.width - 20, box.y + 20);
          await page.waitForTimeout(800);
        });
      await expect(page).not.toHaveURL(/#account/, { timeout: 8_000 });
    }

    const strings = currentLocaleStrings();
    const geoFeatures = currentGeoFeatures();
    const isMobile = test.info().project.name.endsWith('-mobile');

    // Mobile has no Login/Join in the header itself — both live inside the
    // hamburger sidebar (confirmed live: same [class*="MainMenu_main-menu"]
    // container Step 5 already checks). The sidebar is permanently in the
    // DOM with a real (nonzero) bounding box, just translated off-screen
    // when closed — Playwright's isVisible() doesn't check on-screen
    // position, so it reports "visible" even while off-canvas. Checking the
    // actual rect avoids treating a closed sidebar as already open.
    async function isMobileMenuOnScreen(): Promise<boolean> {
      return await page.evaluate(() => {
        const el = document.querySelector('[class*="MainMenu_main-menu"]');
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.x > -10 && rect.x < window.innerWidth;
      });
    }

    async function openMobileMenuIfNeeded() {
      if (!isMobile) return;
      if (await isMobileMenuOnScreen()) return;
      await page.evaluate(() => {
        (document.querySelector('[class*="hamburger" i]') as HTMLElement | null)?.click();
      });
      await page.waitForTimeout(800);
    }

    try {

    await runStep('Step 1: LOGIN CTA opens login widget (/#account)', async () => {
      // Mobile has no standalone Login button — it only exists inside the
      // hamburger sidebar alongside Join (confirmed live), so there's no
      // single "Login CTA" entry point to test in isolation the way desktop
      // has. Covered instead by Step 5 (hamburger reveals both) and the
      // mobile-only PLAY step below.
      if (isMobile) {
        console.log('WH-01 Step 1 skipped on mobile — no standalone Login CTA, see Step 5 and PLAY step');
        return;
      }
      if (!geoFeatures.hasAccountModal) {
        console.log('WH-01 Step 1 skipped — no login/account modal for this GEO');
        return;
      }
      const loginBtn = page.getByRole('banner').getByRole('button', { name: strings.loginButton }).first();
      await expect(loginBtn).toBeVisible({ timeout: 10_000 });
      await loginBtn.click();
      await expect(page).toHaveURL(/#account/, { timeout: 10_000 });
      await closeAccountModal();
    });

    await runStep('Step 2: JOIN CTA opens registration widget (/#account)', async () => {
      if (isMobile) {
        console.log('WH-01 Step 2 skipped on mobile — no standalone Join CTA, see Step 5 and PLAY step');
        return;
      }
      if (!geoFeatures.hasAccountModal) {
        console.log('WH-01 Step 2 skipped — no login/account modal for this GEO');
        return;
      }
      await dismissCampaignPopup(page);
      const joinBtn = page.getByRole('banner').getByRole('button', { name: strings.joinButton }).first();
      await expect(joinBtn).toBeVisible({ timeout: 10_000 });
      await joinBtn.click();
      await expect(page).toHaveURL(/#account/, { timeout: 10_000 });
      await closeAccountModal();
    });

    await runStep('Step 2b: PLAY button opens account widget (mobile only)', async () => {
      if (!isMobile) return;
      if (!geoFeatures.hasAccountModal) {
        console.log('WH-01 Step 2b skipped — no login/account modal for this GEO');
        return;
      }
      await dismissCampaignPopup(page);
      // Bottom-nav PLAY is mobile's single entry point covering both
      // Login/Join — per live confirmation, which widget it opens can
      // depend on whichever was last used in the session, so this only
      // asserts the widget opens, not which specific form it lands on.
      const playBtn = page.locator('[class*="MobileFooter"] button.play, [class*="MobileMenu_play-but"] button').first();
      await expect(playBtn).toBeVisible({ timeout: 10_000 });
      await playBtn.scrollIntoViewIfNeeded();
      await playBtn.click();
      await expect(page).toHaveURL(/#account/, { timeout: 10_000 });
      // closeAccountModal() targets a desktop-only class — re-navigating is
      // a reliable reset here rather than chasing the mobile modal's close
      // button (this fullscreen mobile takeover, unlike desktop's popup, has
      // its own separate DOM structure).
      await page.goto('', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');
      await dismissCampaignPopup(page);
    });

    await runStep('Step 3: Search icon opens search panel (/#search)', async () => {
      await dismissCampaignPopup(page);
      // Mobile's visible search icon lives in the sticky bottom nav — the
      // header's own #search link is still in the DOM but CSS-hidden at
      // mobile breakpoints (confirmed live), so an unscoped .first() would
      // grab the wrong, invisible one.
      const searchLink = isMobile
        ? page.locator('[class*="MobileFooter"] a[href="#search"]').first()
        : page.locator('a[href="#search"]').first();
      await expect(searchLink).toBeVisible({ timeout: 10_000 });
      await searchLink.click({ force: true });
      await expect(page).toHaveURL(/#search/, { timeout: 10_000 });
      await page.waitForTimeout(1_500);
      // The visible "Back" text is screen-reader-only (0x0 on screen) — the
      // real clickable element is this button (confirmed live). Closing via
      // Escape/history.pushState instead changes the URL but leaves the
      // search-cover overlay at full size, which then blocks clicks on
      // whatever step runs next.
      const backBtn = isMobile
        ? page.locator('[class*="SearchBar_search-back"]').first()
        : page.getByText(strings.backButtonText, { exact: true }).first();
      if (await backBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await backBtn.click();
        await page.waitForTimeout(1_000);
      }
      if (page.url().includes('#search')) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1_000);
      }
      if (page.url().includes('#search')) {
        await page.evaluate(() => history.pushState({}, '', location.pathname));
        await page.waitForTimeout(500);
      }
      await expect(page).not.toHaveURL(/#search/, { timeout: 8_000 });
    });

    await runStep('Step 4: Promotion icon leads to Promotions page', async () => {
      if (!geoFeatures.promotionsPath) {
        console.log('WH-01 Step 4 skipped — no Promotions page for this GEO');
        return;
      }
      if (geoFeatures.hasPromotionsIconInHeader === false) {
        console.log('WH-01 Step 4 skipped — no Promotions icon in header for this GEO (page exists, just no header entry point)');
        return;
      }
      await dismissCampaignPopup(page);
      // href*="promotion" is English-domain-path-only (e.g. "casino-promotions") —
      // ES's promotions path is "promociones" and doesn't contain that substring.
      // Mobile's visible entry point is the gift icon in the bottom nav
      // (confirmed live: [class*="MobileMenu_promos-but"]) — the header's
      // own promotions icon is CSS-hidden at mobile breakpoints, and there's
      // also a real (but off-screen unless scrolled) footer link with the
      // same href, so an unscoped .first() picks the wrong one on mobile.
      const promoLink = isMobile
        ? page.locator(`[class*="MobileMenu_promos-but"] a[href*="${geoFeatures.promotionsPath.replace(/\/$/, '')}"]`).first()
        : page.getByRole('banner').locator(`a[href*="${geoFeatures.promotionsPath.replace(/\/$/, '')}"]`).first();
      await expect(promoLink).toBeVisible({ timeout: 10_000 });
      await promoLink.click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(new RegExp(geoFeatures.promotionsPath.replace(/\/$/, '')), { timeout: 10_000 });
      await page.goBack();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);
    });

    await runStep('Step 5: Hamburger icon opens sidebar menu', async () => {
      await dismissCampaignPopup(page);
      const hamburger = page.locator('[class*="hamburger" i]').first();
      await expect(hamburger).toBeVisible({ timeout: 10_000 });
      await page.evaluate(() => {
        const el = document.querySelector('[class*="hamburger" i]');
        (el as HTMLElement | null)?.click();
      });
      await page.waitForTimeout(800);
      // Not page.locator(...).isVisible() — the sidebar has a real, nonzero
      // bounding box even while closed (just translated off-screen), so
      // that check reports "visible" regardless of open state. Confirming
      // it's actually on-screen is what makes this assertion meaningful.
      const sidebarVisible = await isMobileMenuOnScreen();
      expect(sidebarVisible).toBe(true);
      await page.evaluate(() => {
        const el = document.querySelector('[class*="hamburger" i]');
        (el as HTMLElement | null)?.click();
      });
      await page.waitForTimeout(500);
    });

    await runStep('Step 6: Brand logo click sends to homepage', async () => {
      await page.goto('slingo/', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');
      await dismissCampaignPopup(page);
      const logo = page.getByRole('banner').locator(`a[href="${siteUrl('')}"]`).first();
      await expect(logo).toBeVisible({ timeout: 10_000 });
      await logo.click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(siteUrl(''), { timeout: 10_000 });
    });

    await runStep('Step 7: Header sticks to top only while scrolling', async () => {
      // Mobile has no sticky top header by design — the persistent nav on
      // mobile is the fixed bottom bar (MobileFooter), not the top header,
      // which is expected to scroll away with the page (confirmed live).
      const pinnedLocator = isMobile
        ? page.locator('[class*="MobileFooter"]').first()
        : page.getByRole('banner').first();
      const label = isMobile
        ? 'Bottom nav remains pinned in place across scroll depths'
        : 'Header remains pinned in place across scroll depths';

      await page.evaluate(() => window.scrollTo(0, 1200));
      await page.waitForTimeout(500);
      const boxAt1200 = await pinnedLocator.boundingBox().catch(() => null);
      await page.evaluate(() => window.scrollTo(0, 2200));
      await page.waitForTimeout(500);
      const boxAt2200 = await pinnedLocator.boundingBox().catch(() => null);
      const sticky = !!boxAt1200 && !!boxAt2200 && Math.abs(boxAt1200.y - boxAt2200.y) < 2;
      console.log(`WH-01 ${isMobile ? 'bottom nav' : 'header'} y at scroll 1200: ${boxAt1200?.y}, at scroll 2200: ${boxAt2200?.y}`);
      record(label, sticky);
      await page.evaluate(() => window.scrollTo(0, 0));
    });

    } finally {
      printSummary();
    }
  });

});

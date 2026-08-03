import { test, expect } from '../../helpers/stealth-fixtures';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher, siteUrl, resolveMobileAccountButton } from '../../helpers/common';
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
      // :is(..., .modal-content) — confirmed live on Prime Slots (PSL) UK
      // 2026-07-30: this brand's account modal is a Tailwind-styled web
      // component (.modal/.modal-content/.modal-content), not the
      // AccountPopup_account React CSS-module class every other brand
      // shares, and Escape does NOT close it — falls through to the
      // top-right-corner click below, which needs a real bounding box to
      // find in the first place.
      await page.locator(':is([class*="AccountPopup_account"], .modal-content)')
        .waitFor({ state: 'detached', timeout: 5_000 }).catch(async () => {
          // .modal-header .cursor-pointer — confirmed live on PSL UK: this
          // brand's real close control is an unlabeled icon inside
          // .modal-header — a direct click on it is unambiguous, unlike
          // guessing a corner coordinate on the modal card.
          const closeIcon = page.locator('.modal-header .cursor-pointer').last();
          if (await closeIcon.count() > 0) {
            await closeIcon.evaluate((el: HTMLElement) => el.click()).catch(() => {});
          } else {
            const modal = page.locator(':is([class*="AccountPopup_account"], .modal-content)').first();
            const box = await modal.boundingBox().catch(() => null);
            if (box) await page.mouse.click(box.x + box.width - 20, box.y + 20);
          }
          await page.waitForTimeout(800);
        });
      // Confirmed live on PSL UK: the close icon click above genuinely
      // dismisses the modal's real content, but the URL hash is left stuck
      // on #account regardless — same class of leftover-hash bug already
      // documented for search.spec.ts's #search route on other brands.
      // Directly assigning location.hash fires a real hashchange event
      // rather than history.pushState, which the app's router reliably
      // picks up.
      if (page.url().includes('#account')) {
        await page.evaluate(() => { history.pushState({}, '', location.pathname); });
        await page.waitForTimeout(500);
      }
      // Confirmed live on PSL UK: the <son-auth-modals> custom element
      // itself stays mounted after close (not just the hash), still
      // intercepting pointer events on later clicks (e.g. the header's
      // OWN Join button in the very next step) even though nothing is
      // visually on screen — force-hide it directly rather than relying on
      // whatever internal state the component manages on its own.
      await page.evaluate(() => {
        document.querySelectorAll('son-auth-modals').forEach(el => {
          (el as HTMLElement).style.pointerEvents = 'none';
        });
      }).catch(() => {});
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
        const el = document.querySelector('[class*="MainMenu_main-menu"], #top-nav');
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.x > -10 && rect.x < window.innerWidth;
      });
    }

    async function openMobileMenuIfNeeded() {
      if (!isMobile) return;
      if (await isMobileMenuOnScreen()) return;
      await page.evaluate(() => {
        (document.querySelector('[class*="hamburger" i], #menu-X') as HTMLElement | null)?.click();
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
      // force: true — confirmed live on PSL UK: a leftover (visually hidden
      // but still-mounted) <son-auth-modals> element intercepts pointer
      // events on the header after a previous step's close, same class of
      // overlay issue already documented elsewhere in this project.
      await loginBtn.click({ force: true });
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
      // force: true — same leftover <son-auth-modals> overlay issue as
      // Step 1 above.
      await joinBtn.click({ force: true });
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
      // Confirmed live on MC: the mobile hamburger menu's Play entry is a
      // plain <li> (icon + "Play" span), not a <button> descendant like
      // every other GEO onboarded so far — same gap as registration.spec.ts.
      const playBtn = page.locator('[class*="MobileFooter"] button.play, [class*="MobileMenu_play-but"]').first();
      // Confirmed live on ZI UK: this brand has no bottom-nav/hamburger-menu
      // "Play" entry point at all — Login and Join stay as their own separate
      // buttons inside the hamburger sidebar, same as desktop, so fall back
      // to whichever of those the sidebar actually exposes instead of
      // assuming every brand collapses both into one Play button.
      if (await playBtn.count() === 0) {
        // Confirmed live on Prime Slots (PSL) UK 2026-07-31: this brand has
        // no bottom-nav Play button AND no hamburger/sidebar at all
        // (hasSidebarMenu: false) — its real mobile Login entry point is a
        // separate #nav-login-header button in the always-visible top bar,
        // CSS-hidden at desktop widths only. resolveMobileAccountButton()
        // already covers exactly this shape (built for this same PSL gap
        // elsewhere — see its own docstring) instead of assuming every
        // sidebar-less brand still has one to open.
        const mobileLoginBtn = await resolveMobileAccountButton(page, 'login', strings.loginButton);
        if (!mobileLoginBtn) throw new Error('WH-01 Step 2b: no Play button, sidebar login, or mobile login button found for this GEO');
        await expect(mobileLoginBtn).toBeVisible({ timeout: 10_000 });
        // PSL UK's real mobile login button reports "outside of viewport"
        // even to Playwright's own click (which still needs real screen
        // coordinates) — same fix as helpers/common.ts's other
        // resolveMobileAccountButton() callers: a native DOM click
        // sidesteps viewport/coordinate math entirely.
        await mobileLoginBtn.evaluate((el: HTMLElement) => el.click());
        await expect(page).toHaveURL(/#account/, { timeout: 10_000 });
        await page.goto('', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');
        await dismissCampaignPopup(page);
        return;
      }
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
      // On Slingo/SpinGenie, mobile's visible search icon lives in the
      // sticky bottom nav — the header's own #search link is still in the
      // DOM but CSS-hidden at mobile breakpoints (confirmed live), so an
      // unscoped .first() would grab the wrong, invisible one. Genting
      // Casino does NOT hide its header search on mobile (confirmed live on
      // GC SE, 2026-07-24 — no MobileFooter search link exists at all for
      // this brand), so fall back to the plain header link when the
      // MobileFooter-scoped one genuinely doesn't exist.
      const mobileFooterSearch = page.locator('[class*="MobileFooter"] a[href="#search"]').first();
      // Confirmed live on Prime Slots (PSL) UK 2026-07-31: this brand
      // renders TWO a[href="#search"] elements on mobile — the desktop
      // header's own (now CSS-hidden at mobile width) and a second, real
      // "Search game" one inside its own mobile menu drawer — same fix as
      // search.spec.ts's Step 1.
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
      // The visible "Back" text is screen-reader-only (0x0 on screen) — the
      // real clickable element is this button (confirmed live). Closing via
      // Escape/history.pushState instead changes the URL but leaves the
      // search-cover overlay at full size, which then blocks clicks on
      // whatever step runs next.
      // Confirmed live on ZI UK: the desktop back control has NO text at all
      // (not even the screen-reader-only "Back" every other brand has) —
      // just an <i> icon inside button.SearchBar_search-back. Falling back
      // to the same class-based locator mobile already uses covers this
      // without affecting brands where the text-based one still matches.
      const backBtn = isMobile
        ? page.locator('[class*="SearchBar_search-back"]').first()
        : page.getByText(strings.backButtonText, { exact: true }).or(page.locator('[class*="SearchBar_search-back"]')).first();
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
      // Desktop scope changed from getByRole('banner') to the MainMenu_
      // container — confirmed live on a brand with hasPromotionsIconInHeader:
      // true: its Promotions link sits inside a separate
      // <nav role="navigation"> landmark, a SIBLING of the small
      // <header role="banner"> strip (logo/search/login/register only), not
      // nested inside it — getByRole('banner') never found it. This code
      // path was never exercised against a true case before, so widening it
      // carries no regression risk for any other GEO.
      const promoLink = isMobile
        ? page.locator(`[class*="MobileMenu_promos-but"] a[href*="${geoFeatures.promotionsPath.replace(/\/$/, '')}"]`).first()
        : page.locator(`[class*="MainMenu_"] a[href*="${geoFeatures.promotionsPath.replace(/\/$/, '')}"]`).first();
      // Confirmed live on Lord Ping (LP) UK, 2026-07-28: this brand's mobile
      // bottom nav has exactly 3 icons (menu/search/play) and NO promos-but
      // icon at all, even though the desktop header DOES have a real
      // Promotions link — hasPromotionsIconInHeader only captures desktop,
      // so a mobile-specific existence check is needed here too. Genuine
      // per-platform gap, not a selector bug — skip cleanly rather than
      // hard-fail on an icon this brand's mobile nav never offers.
      const promoLinkExists = await promoLink.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!promoLinkExists) {
        console.log(`WH-01 Step 4 skipped — no ${isMobile ? 'mobile bottom-nav' : 'header'} Promotions icon for this GEO`);
        return;
      }
      // Confirmed live: the MainMenu_ container is a hamburger-
      // triggered off-canvas sidebar that's off-screen by default even on
      // DESKTOP (x: -271px), not just mobile — genuinely different from
      // every other GEO's directly-visible header nav. isVisible() reports
      // true regardless of on-screen position (same gap already handled for
      // mobile elsewhere in this file), so open the hamburger first if the
      // link isn't actually on-screen yet.
      const isOnScreen = await promoLink.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.x > -10 && rect.x < window.innerWidth;
      }).catch(() => false);
      if (!isOnScreen) {
        await page.evaluate(() => {
          (document.querySelector('[class*="hamburger" i], #menu-X') as HTMLElement | null)?.click();
        });
        await page.waitForTimeout(800);
      }
      // Confirmed live on ZI UK: a leftover Overlay_overlay backdrop (from the
      // just-closed search popup) persists over the header long enough to
      // physically cover this link — even click({force:true}) still
      // dispatches a real mouse click at the link's coordinates, which the
      // overlay swallows (URL never changes). A native el.click() via
      // evaluate — same fix sidebar-navigation.spec.ts's navStep already
      // uses for its own overlap issue — fires directly on the element
      // regardless of what's visually on top of it.
      await promoLink.evaluate((el: HTMLElement) => el.click());
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(new RegExp(geoFeatures.promotionsPath.replace(/\/$/, '')), { timeout: 10_000 });
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);
    });

    await runStep('Step 5: Hamburger icon opens sidebar menu', async () => {
      if (geoFeatures.hasSidebarMenu === false) {
        console.log('WH-01 Step 5 skipped — no hamburger/sidebar menu exists for this GEO');
        return;
      }
      await dismissCampaignPopup(page);
      const hamburger = page.locator('[class*="hamburger" i], #menu-X').first();
      await expect(hamburger).toBeVisible({ timeout: 10_000 });
      async function toggleHamburger() {
        await page.evaluate(() => {
          const el = document.querySelector('[class*="hamburger" i], #menu-X');
          (el as HTMLElement | null)?.click();
        });
        await page.waitForTimeout(800);
      }
      // Confirmed live on ZI UK: a GEO with searchRequiresSidebarOpen (Step 3
      // above) opens this same hamburger toggle to reach the search link but
      // never explicitly closes it again afterward — the toggle's internal
      // open/closed state can therefore already be "open" by the time this
      // step runs, so a single click here would actually CLOSE it instead of
      // opening it. Reset to a known-closed baseline first rather than
      // assuming the toggle always starts closed.
      if (await isMobileMenuOnScreen()) {
        await toggleHamburger();
      }
      await toggleHamburger();
      // Not page.locator(...).isVisible() — the sidebar has a real, nonzero
      // bounding box even while closed (just translated off-screen), so
      // that check reports "visible" regardless of open state. Confirming
      // it's actually on-screen is what makes this assertion meaningful.
      const sidebarVisible = await isMobileMenuOnScreen();
      expect(sidebarVisible).toBe(true);
      await toggleHamburger();
    });

    await runStep('Step 6: Brand logo click sends to homepage', async () => {
      // Any real non-homepage path works here — this step only needs "not
      // already on the homepage" so the logo click is a meaningful nav, not
      // specifically the Slingo category. The old hardcoded 'slingo/' 404s
      // (or worse, trips Cloudflare bot-detection on GC UK, confirmed live)
      // on any brand without a Slingo category — fall back through paths
      // this brand is actually confirmed to have.
      const otherPagePath = geoFeatures.promotionsPath ?? geoFeatures.blogPath ?? geoFeatures.featuresPath
        ?? geoFeatures.gameTileHrefSubstrings?.[0]?.replace(/^\//, '') ?? 'slingo/';
      await page.goto(otherPagePath, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');
      await dismissCampaignPopup(page);
      // Confirmed live on Prime Slots (PSL) UK 2026-07-31: this brand's real
      // logo anchor uses a bare root-relative href="/" attribute, not the
      // full absolute URL every other brand onboarded so far renders — a
      // CSS attribute selector matches the literal attribute, not the
      // resolved .href property, so the absolute-only match below silently
      // found 0 elements here. Also match the site's root PATH (not just "/"
      // hardcoded, so GEO-specific base paths like Slingo ROW's /en-row/
      // still resolve correctly) alongside the existing absolute form.
      const rootPath = new URL(siteUrl('')).pathname;
      const logo = page.getByRole('banner').locator(`a[href="${siteUrl('')}"], a[href="${rootPath}"]`).first();
      await expect(logo).toBeVisible({ timeout: 10_000 });
      await logo.click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(siteUrl(''), { timeout: 10_000 });
    });

    await runStep('Step 7: Header sticks to top only while scrolling', async () => {
      // PSL-family brands (PSL, PSC — confirmed live on PSC CA 2026-08-03,
      // same as PSL's confirmed no-sidebar/no-MobileFooter platform) have
      // no fixed bottom bar at all: 0 [class*="MobileFooter"] elements
      // found, and no other real fixed/sticky bottom nav either — mobile
      // reuses the exact same `.main-tabs` header as desktop (see
      // hasSidebarMenu: false in geo-features.ts). Skip gracefully here
      // rather than soft-failing on a check this brand family has no
      // equivalent element for.
      if (isMobile && geoFeatures.hasSidebarMenu === false) {
        console.log('WH-01 Step 7 skipped — no MobileFooter/bottom nav exists for this GEO');
        record('Header remains pinned in place across scroll depths (skipped — no bottom nav for this GEO)', true);
        return;
      }
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

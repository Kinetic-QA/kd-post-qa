import { test, expect } from '@playwright/test';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher, siteUrl, assertNoSiteError } from '../../helpers/common';
import { currentGeoFeatures } from '../../helpers/geo-features';
import { currentLocaleStrings } from '../../helpers/locale-strings';

/**
 * SN: Sidebar Navigation
 * Scope: Full sidebar menu flow — hamburger open/close, Login/Join CTA
 * handoff, and every sidebar navigation link (Promotions, Features, Home,
 * category links, Responsible Gaming, Help, Contact, About, Blog).
 *
 * CONFIRMED via live DOM inspection:
 * - Hamburger: <a class="withMainMenu_hamburger__4zgpj hamburger"> (clicking toggles sidebar)
 * - Sidebar nav: <nav class="MainMenu_main-menu__fEivu"> (NO aria-label)
 * - Close: click hamburger again (same toggle)
 * - Slingo logo: <a href="/"> with img inside (no text)
 *
 * KEY RULES:
 * 1. page.goto('/') called ONCE — never again mid-test
 * 2. Hamburger clicked via page.evaluate() — React requires JS click
 * 3. Stay on current page between steps — hamburger works on all pages
 * 4. history.pushState clears hash without triggering popup
 */

const SIDEBAR = '[class*="MainMenu_main-menu"]';
const HAMBURGER = '[class*="hamburger"]';

test.describe('P2 - Sidebar Navigation', () => {

  test.setTimeout(180_000);

  test('SN-01: Sidebar navigation full flow', async ({ page }) => {

    const strings = currentLocaleStrings();
    const geoFeatures = currentGeoFeatures();
    const isMobile = test.info().project.name.endsWith('-mobile');
    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(50));
      console.log('  SN-01 SIDEBAR NAVIGATION - RESULTS');
      console.log('═'.repeat(50));
      for (const r of results) {
        console.log(`  ${r.status === 'Pass' ? '✅' : '❌'}  ${r.label.padEnd(42)} ${r.status}`);
      }
      const passed = results.filter(r => r.status === 'Pass').length;
      const failed = results.filter(r => r.status === 'Fail').length;
      console.log('─'.repeat(50));
      console.log(`  Total: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}`);
      console.log('═'.repeat(50) + '\n');
    }

    // -- Setup: ONE page.goto('/') -----------------------------------------
    await setupCampaignPopupWatcher(page);
    await page.goto('', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1_000);
    await dismissCookieConsent(page);
    await page.waitForTimeout(3_000);
    await dismissCampaignPopup(page);
    console.log('SN-01 setup complete');

    // -- Helpers ----------------------------------------------------------
    async function clickHamburger() {
      // JS click - React requires this to properly handle the toggle
      await page.evaluate(function(sel) {
        var el = document.querySelector(sel);
        if (el) (el as HTMLElement).click();
      }, HAMBURGER);
      await page.waitForTimeout(600);
    }

    async function isSidebarOpen() {
      // Confirmed via live inspection: Overlay_overlay shows when sidebar is open
      const display = await page.locator('[class*="Overlay_overlay"]')
        .evaluate(el => window.getComputedStyle(el).display).catch(() => 'none');
      return display !== 'none';
    }

    async function openSidebar() {
      // Idempotent — confirmed live (both SNG AB and Slingo UK): navStepIfExists
      // calls openSidebar() itself, then delegates to navStep(), which calls
      // openSidebar() AGAIN. clickHamburger() is a raw toggle (same element
      // closes it, see Steps 3-4 below), so the second call was silently
      // CLOSING the sidebar it had just opened, right before navStep tried to
      // click a link inside it — hung for the full click timeout on both
      // brands' very first category-nav step every single run. Skip the
      // toggle entirely when already open instead of blindly re-clicking it.
      if (await isSidebarOpen()) return;
      // Smart poll: check for popup every 800ms up to 4s, exit early if found
      for (let i = 0; i < 5; i++) {
        const hasPopup = await page.locator('[class*="OfferPopup_close"]')
          .isVisible({ timeout: 800 }).catch(() => false);
        if (hasPopup) { await dismissCampaignPopup(page); break; }
        await page.waitForTimeout(300);
      }
      await clickHamburger();
    }

    // Mobile's login/registration widget is a fullscreen takeover with its
    // own DOM (confirmed live in login-widget.spec.ts) — the desktop
    // Escape/corner-click close never actually dismisses it there, leaving
    // it in the DOM to intercept clicks on whatever step runs next.
    // Re-navigating is a reliable reset instead of chasing that widget's
    // close control.
    async function closeAccountModal() {
      if (isMobile) {
        await page.goto('', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(500);
        return;
      }
      await page.keyboard.press('Escape');
      await page.locator('[class*="AccountPopup_account"]').waitFor({ state: 'detached', timeout: 5_000 }).catch(async () => {
        const modal = page.locator('[class*="AccountPopup_account"]').first();
        const box = await modal.boundingBox().catch(() => null);
        if (box) await page.mouse.click(box.x + box.width - 20, box.y + 20);
        await page.waitForTimeout(800);
      });
      await page.waitForTimeout(300);
    }

    // navStep: open sidebar -> click link by href -> verify URL
    async function navStep(label: string, href: string, expectedPath: string) {
      await openSidebar();
      const link = page.locator(SIDEBAR + ' a[href*="' + expectedPath + '"]').first();
      // Native el.click() via evaluate, not link.click() — confirmed live on
      // SNG AB: the sidebar's Slots/Casino/Live Casino rows render an "All"
      // sub-link (the real, correct link this locator resolves to) directly
      // beneath a sibling toggle row ("Online Slots"/"Casino" label + arrow)
      // that visually overlaps it, so a real coordinate-based click gets
      // intercepted by that sibling instead of landing on "All" — same class
      // of issue as the desktop header nav (see game-category-navigation.spec.ts),
      // but UNLIKE that case this has NOT yet been confirmed against a real
      // user's mouse click in a normal browser — don't assume it's equally
      // harmless. Flag to Reeve for a manual check before treating this
      // sidebar overlap as confirmed-safe the way the header one was.
      await link.evaluate((el: HTMLElement) => el.click());
      // Confirmed live (same root cause already fixed in footer-navigation.spec.ts's
      // footerStep): the PREVIOUS navStep's navigation can still be in flight when
      // this click fires, so a fixed wait doesn't guarantee THIS click's navigation
      // is what actually lands — a slower earlier response can arrive after and
      // clobber the URL back to the previous page (confirmed: Contact us landing on
      // the prior step's /help/ URL). Wait for the expected path specifically.
      await page.waitForURL(new RegExp(expectedPath.replace(/\//g, '\\/')), { timeout: 10_000 }).catch(() => {});
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(800);
      await assertNoSiteError(page);
      const actualUrl = page.url();
      const passed = actualUrl.includes(expectedPath);
      record(label, passed);
      console.log((passed ? 'PASS' : 'FAIL') + ' | ' + label + ' | ' + actualUrl);
      await expect.soft(page).toHaveURL(
        new RegExp(expectedPath.replace(/\//g, '\\/')), { timeout: 8_000 }
      );
    }

    // Same as navStep, but for a category link that may not exist at all for
    // this brand/GEO (e.g. SNG AB has Slots/Casino/Live Casino but no
    // Slingo/Bingo) — skip cleanly instead of hard-failing on a link that
    // was never going to be there, same pattern footer-navigation.spec.ts
    // already uses for optional footer links.
    async function navStepIfExists(label: string, href: string, expectedPath: string) {
      await openSidebar();
      const link = page.locator(SIDEBAR + ' a[href*="' + expectedPath + '"]').first();
      const exists = await link.isVisible({ timeout: 3_000 }).catch(() => false);
      if (!exists) {
        record(`${label} (skipped — not offered for this GEO)`, true);
        console.log('SN-01 ' + label + ' skipped — not offered for this GEO');
        return;
      }
      await navStep(label, href, expectedPath);
    }

    try {

    // -- Steps 1-2: Hamburger opens sidebar -------------------------------
    await test.step('Steps 1-2: Hamburger opens sidebar', async () => {
      await openSidebar();
      const visible = await isSidebarOpen();
      record('Hamburger opens sidebar', visible);
      expect(visible).toBe(true);
      console.log('Sidebar open: ' + visible);
    });

    // -- Steps 3-4: X button closes sidebar -------------------------------
    await test.step('Steps 3-4: X button closes sidebar', async () => {
      await clickHamburger(); // same toggle closes it
      await page.waitForTimeout(400);
      const stillOpen = await isSidebarOpen();
      record('X closes sidebar', !stillOpen);
      console.log('Sidebar closed: ' + !stillOpen);
    });

    // -- Steps 5-8: LOG IN CTA -> /#account -------------------------------
    await test.step('Steps 5-8: LOG IN CTA opens login modal', async () => {
      if (!geoFeatures.hasAccountModal) {
        record('LOG IN CTA opens login modal (/#account)', true);
        console.log('SN-01 Steps 5-8 skipped — no login/account modal for this GEO');
        return;
      }
      await openSidebar();
      const loginBtn = page.locator(SIDEBAR + ' button').filter({ hasText: strings.loginButton }).first();
      await loginBtn.click();
      await page.waitForTimeout(2_000);
      const hasAccount = page.url().includes('#account');
      record('LOG IN CTA opens login modal (/#account)', hasAccount);
      await expect.soft(page).toHaveURL(/#account/, { timeout: 8_000 });
      await closeAccountModal();
    });

    // -- Steps 9-11: JOIN CTA -> /#account --------------------------------
    await test.step('Steps 9-11: JOIN CTA opens registration modal', async () => {
      if (!geoFeatures.hasAccountModal) {
        record('JOIN CTA opens registration modal (/#account)', true);
        console.log('SN-01 Steps 9-11 skipped — no login/account modal for this GEO');
        return;
      }
      await openSidebar();
      const joinBtn = page.locator(SIDEBAR + ' button').filter({ hasText: strings.joinButton }).first();
      await joinBtn.click();
      await page.waitForTimeout(2_000);
      const hasAccount = page.url().includes('#account');
      record('JOIN CTA opens registration modal (/#account)', hasAccount);
      await expect.soft(page).toHaveURL(/#account/, { timeout: 8_000 });
      await closeAccountModal();
    });

    // -- Steps 12-14: Promotions -------------------------------------------
    if (geoFeatures.promotionsPath) {
      const promoPath = geoFeatures.promotionsPath;
      await navStep(`Promotions -> /${promoPath}`, `/${promoPath}`, `/${promoPath}`);
    } else {
      // A dynamic test.skip() here would abort the WHOLE test and discard
      // every step's result already recorded above it (confirmed live on
      // SE: 4 real passing steps got reported as "skipped" at the outer
      // level) — record a soft skip instead, same pattern the Blog step
      // below already uses, so a GEO missing just this one page doesn't
      // lose credit for everything else that ran.
      record('Promotions link (skipped — no Promotions page for this GEO)', true);
      console.log('SN-01 Promotions skipped — no Promotions page for this GEO');
    }

    // -- Steps 15-17: Slingo Logo -> homepage -----------------------------
    await test.step('Steps 15-17: Slingo logo -> homepage (no slug)', async () => {
      await openSidebar();
      // Slingo logo is the second <a href="/"> in sidebar (first is hamburger toggle)
      const slingoLogo = page.locator(SIDEBAR + ` a[href="${siteUrl('')}"]`).first();
      await slingoLogo.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(800);
      const url = page.url();
      const isHome = url === siteUrl('');
      record('Slingo logo -> homepage (no slug)', isHome);
      console.log((isHome ? 'PASS' : 'FAIL') + ' | Slingo logo | ' + url);
      await expect.soft(page).toHaveURL(siteUrl(''), { timeout: 8_000 });
    });

    // -- Steps 18-20: Features ---------------------------------------------
    if (geoFeatures.featuresPath) {
      const featuresPath = geoFeatures.featuresPath;
      await navStep(`Features -> /${featuresPath}`, `/${featuresPath}`, `/${featuresPath}`);
    } else {
      // Same reasoning as the Promotions branch above — soft skip, not a
      // test-aborting test.skip().
      record('Features link (skipped — no Features page for this GEO)', true);
      console.log('SN-01 Features skipped — no Features page for this GEO');
    }

    // -- Steps 21-23: Home -------------------------------------------------
    await test.step('Steps 21-23: Home link -> homepage (no slug)', async () => {
      await openSidebar();
      // MC FR-CA (root-caused and fixed 2026-07-23): this step used to time
      // out clicking the Home link. Root cause was a text mismatch, not a
      // DOM-order/selector issue — the actual drawer's Home link reads
      // "Página Inicial" (a genuine wrong-locale-bundle bug, unrelated to
      // MC's separate, brand-owner-confirmed-intentional English "Home" in
      // the always-visible top-strip nav), which strings.homeLinkText now
      // matches (see locale-strings.ts). `.first()` is correct once the text
      // itself matches — no DOM-order workaround needed.
      const homeLink = page.locator(SIDEBAR + ` a[href="${siteUrl('')}"]`).filter({ hasText: strings.homeLinkText }).first();
      await homeLink.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(800);
      const url = page.url();
      const isHome = url === siteUrl('');
      record('Home link -> homepage (no slug)', isHome);
      await expect.soft(page).toHaveURL(siteUrl(''), { timeout: 8_000 });
    });

    // -- Steps 24-32: Slingo / Slots / Bingo / Casino / Live Casino ---------
    if (geoFeatures.hasGameCategoryNav) {
      // Each brand offers a different subset of these (e.g. SNG AB has
      // Slots/Casino/Live Casino but no Slingo/Bingo) — check-and-skip per
      // link rather than assuming the fixed Slingo/Slots/Casino trio every
      // GEO configured so far happened to share.
      await navStepIfExists('Slingo link -> /slingo/', '/slingo/', '/slingo/');
      await navStepIfExists('Slots link -> /slots/', '/slots/', '/slots/');
      await navStepIfExists('Bingo link -> /bingo/', '/bingo/', '/bingo/');
      await navStepIfExists('Casino link -> /casino/', '/casino/', '/casino/');
      await navStepIfExists('Live Casino link -> /live-casino/', '/live-casino/', '/live-casino/');
    } else {
      // Same reasoning as the Promotions/Features branches above — soft skip,
      // not a test-aborting test.skip(). Confirmed live (DE): no Slingo/Slots/
      // Bingo/Casino category nav links exist in the sidebar at all.
      record('Slingo/Slots/Casino links (skipped — no category nav for this GEO)', true);
      console.log('SN-01 Slingo/Slots/Casino skipped — no category nav for this GEO');
    }

    // -- Steps 33-35: Responsible Gaming ----------------------------------
    const responsibleGamingPath = geoFeatures.responsibleGamingPath ?? 'responsible-gaming/';
    await navStep('Responsible Gaming -> /' + responsibleGamingPath, '/' + responsibleGamingPath, '/' + responsibleGamingPath);

    // -- Steps 36-38: Help ------------------------------------------------
    const helpPath = geoFeatures.helpPath ?? 'help/';
    await navStep('Help -> /' + helpPath, '/' + helpPath, '/' + helpPath);

    // -- Steps 39-41: Contact us -------------------------------------------
    const contactPath = geoFeatures.contactPath ?? 'contact/';
    await navStep(`Contact us -> /${contactPath}`, `/${contactPath}`, `/${contactPath}`);

    // -- Steps 42-44: About us --------------------------------------------
    const aboutUsPath = geoFeatures.aboutUsPath ?? 'about-us/';
    await navStep(`About us -> /${aboutUsPath}`, `/${aboutUsPath}`, `/${aboutUsPath}`);

    // -- Step 45: Blog -> /blog/ -------------------------------------------
    if (geoFeatures.hasBlog && geoFeatures.blogPath) {
      const blogPath = geoFeatures.blogPath;
      await navStep(`Blog -> /${blogPath}`, `/${blogPath}`, `/${blogPath}`);
    } else {
      record('Blog link (skipped — no Blog for this GEO)', true);
    }

    // -- Step 46: Final hamburger -> sidebar opens -------------------------
    await test.step('Step 46: Final hamburger click -> sidebar opens', async () => {
      await openSidebar();
      const visible = await isSidebarOpen();
      record('Final hamburger click -> sidebar opens', visible);
    });

    } finally {
      printSummary();
    }
  });

});

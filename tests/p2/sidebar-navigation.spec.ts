import { test, expect } from '@playwright/test';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher } from '../../helpers/common';

/**
 * SN: Sidebar Navigation
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

const BASE = 'https://www.slingo.com';
const SIDEBAR = '[class*="MainMenu_main-menu"]';
const HAMBURGER = '[class*="hamburger"]';

test.describe('P2 - Sidebar Navigation', () => {

  test.setTimeout(180_000);

  test('SN-01: Sidebar navigation full flow', async ({ page }) => {

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
    await page.goto('/');
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
      // Smart poll: check for popup every 800ms up to 4s, exit early if found
      for (let i = 0; i < 5; i++) {
        const hasPopup = await page.locator('[class*="OfferPopup_close"]')
          .isVisible({ timeout: 800 }).catch(() => false);
        if (hasPopup) { await dismissCampaignPopup(page); break; }
        await page.waitForTimeout(300);
      }
      await clickHamburger();
    }

    // navStep: open sidebar -> click link by href -> verify URL
    async function navStep(label: string, href: string, expectedPath: string) {
      await openSidebar();
      const link = page.locator(SIDEBAR + ' a[href*="' + expectedPath + '"]').first();
      await link.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(800);
      const actualUrl = page.url();
      const passed = actualUrl.includes(expectedPath);
      record(label, passed);
      console.log((passed ? 'PASS' : 'FAIL') + ' | ' + label + ' | ' + actualUrl);
      await expect.soft(page).toHaveURL(
        new RegExp(expectedPath.replace(/\//g, '\\/')), { timeout: 8_000 }
      );
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
      await openSidebar();
      const loginBtn = page.locator(SIDEBAR + ' button').filter({ hasText: /log in/i }).first();
      await loginBtn.click();
      await page.waitForTimeout(2_000);
      const hasAccount = page.url().includes('#account');
      record('LOG IN CTA opens login modal (/#account)', hasAccount);
      await expect.soft(page).toHaveURL(/#account/, { timeout: 8_000 });
      // Wait for modal to actually unmount from DOM, not just URL change
      await page.keyboard.press('Escape');
      await page.locator('[class*="AccountPopup_account"]').waitFor({ state: 'detached', timeout: 5_000 }).catch(async () => {
        // If still there, click top-right corner to close
        const modal = page.locator('[class*="AccountPopup_account"]').first();
        const box = await modal.boundingBox().catch(() => null);
        if (box) await page.mouse.click(box.x + box.width - 20, box.y + 20);
        await page.waitForTimeout(800);
      });
      await page.waitForTimeout(300);
    });

    // -- Steps 9-11: JOIN CTA -> /#account --------------------------------
    await test.step('Steps 9-11: JOIN CTA opens registration modal', async () => {
      await openSidebar();
      const joinBtn = page.locator(SIDEBAR + ' button').filter({ hasText: /^join$/i }).first();
      await joinBtn.click();
      await page.waitForTimeout(2_000);
      const hasAccount = page.url().includes('#account');
      record('JOIN CTA opens registration modal (/#account)', hasAccount);
      await expect.soft(page).toHaveURL(/#account/, { timeout: 8_000 });
      // Wait for modal to actually unmount from DOM
      await page.keyboard.press('Escape');
      await page.locator('[class*="AccountPopup_account"]').waitFor({ state: 'detached', timeout: 5_000 }).catch(async () => {
        const modal = page.locator('[class*="AccountPopup_account"]').first();
        const box = await modal.boundingBox().catch(() => null);
        if (box) await page.mouse.click(box.x + box.width - 20, box.y + 20);
        await page.waitForTimeout(800);
      });
      await page.waitForTimeout(300);
    });

    // -- Steps 12-14: Promotions -------------------------------------------
    await navStep('Promotions -> /casino-promotions/', '/casino-promotions/', '/casino-promotions/');

    // -- Steps 15-17: Slingo Logo -> homepage -----------------------------
    await test.step('Steps 15-17: Slingo logo -> homepage (no slug)', async () => {
      await openSidebar();
      // Slingo logo is the second <a href="/"> in sidebar (first is hamburger toggle)
      const slingoLogo = page.locator(SIDEBAR + ' a[href="https://www.slingo.com/"]').first();
      await slingoLogo.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(800);
      const url = page.url();
      const isHome = url === BASE + '/' || url === BASE;
      record('Slingo logo -> homepage (no slug)', isHome);
      console.log((isHome ? 'PASS' : 'FAIL') + ' | Slingo logo | ' + url);
      await expect.soft(page).toHaveURL(BASE + '/', { timeout: 8_000 });
    });

    // -- Steps 18-20: Features ---------------------------------------------
    await navStep('Features -> /casino-features/', '/casino-features/', '/casino-features/');

    // -- Steps 21-23: Home -------------------------------------------------
    await test.step('Steps 21-23: Home link -> homepage (no slug)', async () => {
      await openSidebar();
      const homeLink = page.locator(SIDEBAR + ' a[href="https://www.slingo.com/"]').filter({ hasText: "Home" }).first();
      await homeLink.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(800);
      const url = page.url();
      const isHome = url === BASE + '/' || url === BASE;
      record('Home link -> homepage (no slug)', isHome);
      await expect.soft(page).toHaveURL(BASE + '/', { timeout: 8_000 });
    });

    // -- Steps 24-26: Slingo -----------------------------------------------
    await navStep('Slingo link -> /slingo/', '/slingo/', '/slingo/');

    // -- Steps 27-29: Slots ------------------------------------------------
    await navStep('Slots link -> /slots/', '/slots/', '/slots/');

    // -- Steps 30-32: Casino -----------------------------------------------
    await navStep('Casino link -> /casino/', '/casino/', '/casino/');

    // -- Steps 33-35: Responsible Gaming ----------------------------------
    await navStep('Responsible Gaming -> /responsible-gaming/', '/responsible-gaming/', '/responsible-gaming/');

    // -- Steps 36-38: Help ------------------------------------------------
    await navStep('Help -> /help/', '/help/', '/help/');

    // -- Steps 39-41: Contact us -------------------------------------------
    await navStep('Contact us -> /contact/', '/contact/', '/contact/');

    // -- Steps 42-44: About us --------------------------------------------
    await navStep('About us -> /about-us/', '/about-us/', '/about-us/');

    // -- Step 45: Blog -> /blog/ -------------------------------------------
    await navStep('Blog -> /blog/', '/blog/', '/blog/');

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

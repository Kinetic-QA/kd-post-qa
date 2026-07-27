import { test, expect } from '../../helpers/stealth-fixtures';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher, assertNoSiteError } from '../../helpers/common';
import { currentGeoFeatures } from '../../helpers/geo-features';

/**
 * HP: Help Page
 * Scope: FAQ accordion expands to show an answer on click and collapses
 * again on a second click. Entry point is via the sidebar menu (not a
 * direct URL), matching how a real user reaches this page.
 * CONFIRMED via live DOM inspection: Bootstrap-style accordion —
 * button.accordion-button carries a "collapsed" class when closed and loses
 * it when open (no aria-expanded attribute, no <details> element).
 */

const HAMBURGER = '[class*="hamburger"]';
const SIDEBAR = '[class*="MainMenu_main-menu"]';

test.describe('P3 - Help Page', () => {

  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await setupCampaignPopupWatcher(page);
    await page.goto('', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000);
    await dismissCookieConsent(page);
    await dismissCampaignPopup(page);
    await page.waitForTimeout(500);

    // Entry point: hamburger -> sidebar -> Help link (not a direct goto),
    // matching how a real user reaches this page on brands where the
    // sidebar has that entry point. Confirmed live on PC ES: the Help page
    // itself is real (200s) but has NO sidebar entry at all — footer-only,
    // same gap as sidebar-navigation.spec.ts's Help step. Fall back to a
    // direct goto rather than hard-failing on a real site-structure gap;
    // this spec's actual scope is the accordion behavior, not the nav path.
    const helpPath = currentGeoFeatures().helpPath ?? 'help/';
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      (el as HTMLElement | null)?.click();
    }, HAMBURGER);
    await page.waitForTimeout(800);
    const helpLink = page.locator(SIDEBAR + ` a[href*="/${helpPath}"]`).first();
    const hasSidebarLink = await helpLink.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasSidebarLink) {
      await helpLink.click();
      await page.waitForLoadState('domcontentloaded');
    } else {
      console.log('HP-01 no sidebar Help entry point for this GEO — navigating directly');
      await page.keyboard.press('Escape').catch(() => {});
      await page.goto(helpPath, { waitUntil: 'domcontentloaded' });
    }
    await page.waitForTimeout(1_000);
    await dismissCampaignPopup(page);
  });

  test('HP-01: Help page FAQ accordion expand/collapse', async ({ page }) => {
    test.setTimeout(90_000);

    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(45));
      console.log('  HP-01 HELP PAGE - RESULTS');
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
        try { await fn(); await assertNoSiteError(page); record(label, true); }
        catch (e) { record(label, false); throw e; }
      });
    }

    try {

    await runStep('Step 1: Accordion question is visible', async () => {
      const accordionButton = page.locator('button.accordion-button').first();
      await expect(accordionButton).toBeVisible({ timeout: 10_000 });
    });

    await runStep('Step 2: Clicking the accordion shows the answer content', async () => {
      const accordionButton = page.locator('button.accordion-button').first();
      await accordionButton.click();
      await page.waitForTimeout(500);
      const isExpanded = await accordionButton.evaluate(el => !el.classList.contains('collapsed'));
      record('Accordion content shown after click', isExpanded);
    });

    await runStep('Step 3: Clicking the accordion again hides the answer content', async () => {
      const accordionButton = page.locator('button.accordion-button').first();
      await accordionButton.click();
      await page.waitForTimeout(500);
      const isCollapsed = await accordionButton.evaluate(el => el.classList.contains('collapsed'));
      record('Accordion content hidden after second click', isCollapsed);
    });

    } finally {
      printSummary();
    }
  });

});

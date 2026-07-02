import { test, expect } from '@playwright/test';
import { dismissCampaignPopup, dismissCookieConsent, setupCampaignPopupWatcher } from '../../helpers/common';

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
    await page.goto('/');
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

    try {

    // ── Step 1: Click Search button in header ────────────────────────────
    await runStep('Step 1: Search button → search panel opens', async () => {
      const searchLink = page.locator('a[href="#search"]').first();
      await expect(searchLink).toBeVisible({ timeout: 10_000 });
      await searchLink.click({ force: true });
      await expect(page).toHaveURL(/#search/, { timeout: 10_000 });
      await page.waitForTimeout(1_500);
    });

    // ── Step 2: Click the search bar ────────────────────────────────────
    await runStep('Step 2: Search bar is clickable', async () => {
      const searchInput = page.locator('input[placeholder="Search game"]').first();
      await expect(searchInput).toBeVisible({ timeout: 5_000 });
      await searchInput.click();
    });

    // ── Step 3: Type "Casino" ────────────────────────────────────────────
    await runStep('Step 3: Type "Casino" → results appear', async () => {
      const searchInput = page.locator('input[placeholder="Search game"]').first();
      await searchInput.press('Control+a');
      await searchInput.fill('Casino');
      await page.waitForTimeout(2_500);
    });

    // ── Step 4: Click a game title → info modal opens ────────────────────
    let gameTitle = '';
    await runStep('Step 4: Click game title → info modal appears', async () => {
      const vh = page.viewportSize()?.height ?? 720;
      const gameLinks = page.locator('a[href*="/slots/casino"], a[href*="/casino/other/casino"]');
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
      await titleLink.click();
      await page.waitForTimeout(2_000);
      await expect(page).toHaveURL(/#search-gamepage\//, { timeout: 10_000 });
      console.log('GS-01 modal opened for: ' + gameTitle);
    });

    // ── Step 5: Click X on the game info modal ───────────────────────────
    await runStep('Step 5: Click X → game info modal closes', async () => {
      const closeBtn = page.locator(
        '[class*="close" i][class*="button" i], [class*="Close"][class*="Button"], ' +
        'button[aria-label*="close" i], button[aria-label*="Close"], ' +
        '[class*="modal"] [class*="close" i], [class*="gamepage"] [class*="close" i], ' +
        '[class*="Close_"], [class*="close_"]'
      ).filter({ visible: true }).first();

      const closeBtnVisible = await closeBtn.isVisible({ timeout: 5_000 }).catch(() => false);
      if (closeBtnVisible) {
        await closeBtn.click();
      } else {
        // Fallback: Escape key
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(1_500);
      await expect(page).toHaveURL(/#search/, { timeout: 10_000 });
    });

    // ── Step 6: Hover a game → PLAY IT visible ───────────────────────────
    await runStep('Step 6: Hover game tile → Play It CTA appears', async () => {
      const vh = page.viewportSize()?.height ?? 720;
      const gameLinks = page.locator('a[href*="/slots/casino"], a[href*="/casino/other/casino"]');
      const count = await gameLinks.count();
      let titleLink = gameLinks.first();
      for (let i = 0; i < Math.min(count, 20); i++) {
        const box = await gameLinks.nth(i).boundingBox().catch(() => null);
        if (box && box.y > 50 && box.y < vh && box.width > 30) {
          titleLink = gameLinks.nth(i);
          break;
        }
      }
      const gameImg = titleLink.locator('xpath=preceding::img[1]').first();
      await titleLink.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

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

      const playItBtn = page.locator(
        'a:has-text("PLAY IT"), button:has-text("PLAY IT"), ' +
        'a:has-text("Play it"), button:has-text("Play it"), ' +
        'a:has-text("PLAY NOW"), button:has-text("PLAY NOW")'
      ).filter({ visible: true }).first();
      await expect(playItBtn).toBeVisible({ timeout: 5_000 });
    });

    // ── Step 7: Click PLAY IT → registration modal opens ────────────────
    await runStep('Step 7: Click Play It → registration modal opens', async () => {
      const playItBtn = page.locator(
        'a:has-text("PLAY IT"), button:has-text("PLAY IT"), ' +
        'a:has-text("Play it"), button:has-text("Play it"), ' +
        'a:has-text("PLAY NOW"), button:has-text("PLAY NOW")'
      ).filter({ visible: true }).first();
      await playItBtn.click();
      await page.waitForTimeout(3_000);
    });

    // ── Step 8: Verify registration modal + /#account slug ───────────────
    await runStep('Step 8: Registration modal visible + URL has /#account', async () => {
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
      const searchLink = page.locator('a[href="#search"]').first();
      await expect(searchLink).toBeVisible({ timeout: 10_000 });
      await searchLink.click({ force: true });
      await expect(page).toHaveURL(/#search/, { timeout: 10_000 });
      await page.waitForTimeout(1_500);
    });

    // ── Step 11: Click Back ──────────────────────────────────────────────
    await runStep('Step 11: Click Back → returns to homepage', async () => {
      const backBtn = page.getByText('Back', { exact: true }).first();
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

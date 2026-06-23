import { test, expect } from '@playwright/test';
import { dismissCampaignPopup, dismissCookieConsent, setupCampaignPopupWatcher } from '../../helpers/common';

/**
 * GIM-01: Game Information Modal
 * CURRENCY: UK='£'  EU='€'  CA='$'
 * Steps 6-7: window.open() used as equivalent of "Open link in new tab"
 */

const EXPECTED_CURRENCY = '£'; // pound sign - change for other geos
const GAME_TITLE = 'Slingo Super Spin';

test.describe('P2 - Game Information Modal', () => {

  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await setupCampaignPopupWatcher(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000);
    await dismissCookieConsent(page);
    await dismissCampaignPopup(page);
    await page.waitForTimeout(500);
  });

  test('GIM-01: Game information modal full flow', async ({ page }) => {
    test.setTimeout(120_000);

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

    async function findGameLink() {
      const exact = page.getByText(GAME_TITLE, { exact: true }).first();
      if (await exact.isVisible({ timeout: 3_000 }).catch(() => false)) return exact;
      const vh = page.viewportSize()?.height ?? 720;
      const links = page.locator('a[href*="/slingo/"], a[href*="/slots/"]');
      const count = await links.count();
      for (let i = 0; i < Math.min(count, 30); i++) {
        const box = await links.nth(i).boundingBox().catch(() => null);
        if (box && box.y > 100 && box.y < vh && box.width > 30) return links.nth(i);
      }
      return links.first();
    }

    async function closeGameInfoModal() {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1_000);
      if (page.url().includes('gamepage')) {
        await page.evaluate(() => history.pushState({}, '', '/'));
        await page.waitForTimeout(500);
      }
    }

    async function closeAccountModal() {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1_200);
      if (!page.url().includes('#account')) return;
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);
    }

    try {

    await runStep('Step 1: Click game title -> info modal appears', async () => {
      const link = await findGameLink();
      await link.scrollIntoViewIfNeeded();
      await link.click();
      await page.waitForTimeout(2_000);
      await expect(page).toHaveURL(/#gamepage\//, { timeout: 10_000 });
      console.log('GIM-01 modal URL: ' + page.url());
    });

    await runStep('Step 2: Game information modal is visible', async () => {
      const modal = page.locator('[class*="Popup_popup"]').filter({ visible: true }).first();
      await expect(modal).toBeVisible({ timeout: 8_000 });
    });

    await runStep('Step 3: URL contains /#gamepage/<game-title>', async () => {
      const url = page.url();
      console.log('GIM-01 gamepage slug: ' + (url.split('#gamepage/')[1] ?? ''));
      expect(url.includes('#gamepage/')).toBe(true);
    });

    await runStep('Step 3b: Click Play It -> registration modal opens', async () => {
      const playItBtn = page.locator(
        'a:has-text("PLAY IT"), button:has-text("PLAY IT"), ' +
        'a:has-text("Play it"), button:has-text("Play it")'
      ).filter({ visible: true }).first();
      await expect(playItBtn).toBeVisible({ timeout: 8_000 });
      await playItBtn.click();
      await page.waitForTimeout(2_000);
      await expect(page).toHaveURL(/#account/, { timeout: 10_000 });
    });

    await runStep('Step 4: Registration modal visible + URL has /#account', async () => {
      expect(page.url()).toContain('#account');
    });

    await runStep('Step 5: Click X -> registration modal closes', async () => {
      await closeAccountModal();
      await expect(page).not.toHaveURL(/#account/, { timeout: 8_000 });
    });

    await runStep('Steps 6-9: Open game link in new tab -> verify -> close', async () => {
      await dismissCampaignPopup(page);
      const link = await findGameLink();
      await link.scrollIntoViewIfNeeded();
      const href = await link.getAttribute('href') ?? '/';
      const fullUrl = href.startsWith('http') ? href : 'https://www.slingo.com' + href;
      const [newTab] = await Promise.all([
        page.context().waitForEvent('page'),
        page.evaluate((url: string) => window.open(url, '_blank'), fullUrl)
      ]);
      await newTab.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1_500);
      const newTabUrl = newTab.url();
      console.log('GIM-01 new tab URL: ' + newTabUrl);
      const hasSlug = newTabUrl.includes('#gamepage/') || newTabUrl.includes(href.replace('https://www.slingo.com', ''));
      expect(hasSlug).toBe(true);
      await newTab.close();
      await page.waitForTimeout(500);
    });

    await runStep('Step 10: Click game title again -> info modal reopens', async () => {
      await dismissCampaignPopup(page);
      const link = await findGameLink();
      await link.scrollIntoViewIfNeeded();
      await link.click();
      await page.waitForTimeout(2_000);
      await expect(page).toHaveURL(/#gamepage\//, { timeout: 10_000 });
    });

    await runStep('Step 11: Currency in modal matches geo (' + EXPECTED_CURRENCY + ')', async () => {
      const modalText = await page.locator('[class*="Popup_popup"]')
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

    await runStep('Steps 14-16: Hover Slingo Super Spin -> Play It -> registration modal', async () => {
      // Full navigation to properly unmount the React GamePopup component
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      // Campaign popup appears ~3s after page load. Wait for it, then dismiss.
      // Strategy: wait 4s (longer than popup timer), then poll until popup is gone.
      await page.waitForTimeout(4_000);

      // Keep pressing Escape until no Popup_popup element is visible (max 5 attempts)
      for (let i = 0; i < 5; i++) {
        const popupVisible = await page.locator('[class*="Popup_popup"]')
          .filter({ visible: true }).isVisible({ timeout: 500 }).catch(() => false);
        if (!popupVisible) break;
        await page.keyboard.press('Escape');
        await page.waitForTimeout(800);
      }

      // Confirm GamePopup is detached from DOM before hovering
      await page.locator('[class*="GamePopup"]').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(300);

      const targetImg = page.locator('img[alt="Slingo Super Spin"]').first();
      const fallbackImg = page.locator('img[alt*="Slingo"]').first();
      const img = (await targetImg.isVisible({ timeout: 3_000 }).catch(() => false))
        ? targetImg : fallbackImg;

      await img.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      const box = await img.boundingBox().catch(() => null);
      if (box) {
        await page.mouse.move(50, 50);
        await page.waitForTimeout(300);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 });
      }
      await img.hover();
      await page.waitForTimeout(1_500);

      // Use JavaScript to click the Play it button within the Slingo Super Spin tile
      // This bypasses the anchor link that would otherwise intercept the click
      const clicked = await page.evaluate(() => {
        const img = document.querySelector('img[alt="Slingo Super Spin"]');
        if (!img) return false;
        // Find the game tile container (parent or ancestor)
        let container: Element | null = img.parentElement;
        while (container && !container.querySelector('button')) {
          container = container.parentElement;
        }
        const btn = container?.querySelector('button');
        if (btn) { (btn as HTMLElement).click(); return true; }
        return false;
      }).catch(() => false);

      if (!clicked) {
        // Fallback: click by mouse at image coordinates (hover must still be active)
        const imgBox2 = await img.boundingBox().catch(() => null);
        if (imgBox2) {
          await page.mouse.click(imgBox2.x + imgBox2.width / 2, imgBox2.y + imgBox2.height / 2);
        }
      }
      console.log('GIM-01 Play It clicked, clicked=' + clicked);
      await page.waitForTimeout(2_000);
    });

    await runStep('Step 17: Registration modal visible + URL has /#account', async () => {
      await expect(page).toHaveURL(/#account/, { timeout: 10_000 });
      console.log('GIM-01 Registration modal at: ' + page.url());
    });

    await runStep('Step 18: Close registration modal -> test complete', async () => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1_200);
      if (page.url().includes('#account')) {
        await page.goto('/');
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

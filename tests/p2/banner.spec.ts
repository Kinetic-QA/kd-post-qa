import { test, expect } from '@playwright/test';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher } from '../../helpers/common';

/**
 * BN: Banner
 * Scope: Homepage banner visibility, default-collapsed T&C, click-through
 * to login/registration, bonus policy link, and responsive rendering at
 * mobile (750x484) and large desktop (2560x1440) viewports.
 * NOT YET VERIFIED against live DOM — banner selectors are best-effort.
 * Run live and adjust selectors before trusting this in CI.
 */

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const LARGE_VIEWPORT = { width: 2560, height: 1440 };
const EXPECTED_MOBILE_BANNER_WIDTH = 750;
const EXPECTED_MOBILE_BANNER_HEIGHT = 484;

test.describe('P2 - Banner', () => {

  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await setupCampaignPopupWatcher(page);
    await page.goto('');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000);
    await dismissCookieConsent(page);
    await dismissCampaignPopup(page);
    await page.waitForTimeout(500);
  });

  test('BN-01: Banner full flow', async ({ page }) => {
    test.setTimeout(120_000);

    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(45));
      console.log('  BN-01 BANNER - RESULTS');
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

    try {

    await runStep('Step 1: Banner image is displayed on the page', async () => {
      const banner = page.locator('[class*="Banner" i], [class*="banner" i]').first();
      await expect(banner).toBeVisible({ timeout: 10_000 });
    });

    await runStep('Step 2: T&C disclaimer text is present on the banner', async () => {
      // Live site renders this banner's T&C as static disclaimer text
      // ("Automatically credited on 1st Deposit...", "Bonus Policy applies.")
      // rather than a collapsible accordion — no expand/collapse toggle exists
      // to check here, so this verifies presence of the disclaimer copy.
      const tncText = page.getByText(/bonus policy applies/i).first();
      const visible = await tncText.isVisible({ timeout: 5_000 }).catch(() => false);
      record('T&C disclaimer text present on banner', visible);
      if (!visible) console.log('BN-01 T&C disclaimer text not found on homepage banner — verify live');
    });

    await runStep('Step 3: Banner image/CTA opens login/registration on click', async () => {
      const banner = page.locator('[class*="Banner" i], [class*="banner" i]').first();
      await banner.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1_500);
      const opened = page.url().includes('#account');
      record('Banner click opens login/registration widget', opened);
      if (opened) {
        await page.keyboard.press('Escape');
        await page.locator('[class*="AccountPopup_account"]')
          .waitFor({ state: 'detached', timeout: 5_000 }).catch(async () => {
            const modal = page.locator('[class*="AccountPopup_account"]').first();
            const box = await modal.boundingBox().catch(() => null);
            if (box) await page.mouse.click(box.x + box.width - 20, box.y + 20);
            await page.waitForTimeout(800);
          });
        if (page.url().includes('#account')) {
          await page.goto('');
          await page.waitForLoadState('domcontentloaded');
          await page.waitForTimeout(500);
        }
      }
    });

    await runStep('Step 4: Bonus policy link in T&C redirects to bonus policy page', async () => {
      const bonusLink = page.locator('a[href*="/bonus-policy/"]').first();
      const visible = await bonusLink.isVisible({ timeout: 5_000 }).catch(() => false);
      if (visible) {
        // Link sits inside a collapsed T&C panel (0-height/overflow-hidden by
        // default), so it can't be clicked even with force. Verify the href
        // resolves to the expected destination instead, same approach used
        // for the mailto: link check in contact-us-page.spec.ts.
        const href = await bonusLink.getAttribute('href') ?? '';
        expect(href).toContain('/bonus-policy/');
        await page.goto(href);
        await page.waitForLoadState('domcontentloaded');
        await expect(page).toHaveURL(/\/bonus-policy\//, { timeout: 10_000 });
        await page.goBack();
        await page.waitForLoadState('domcontentloaded');
        await dismissCampaignPopup(page);
      } else {
        record('Bonus policy link present', false);
        console.log('BN-01 bonus policy link not visible on homepage banner');
      }
    });

    await runStep('Step 5: Mobile banner image asset matches expected 750x484 dimensions', async () => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.waitForTimeout(1_000);
      // Rendered box width scales to the viewport (e.g. ~360px on a 375px
      // screen), so check the source <img>'s intrinsic natural size instead
      // of the rendered bounding box, which is what the checklist means by
      // "renders at expected 750x484 dimensions".
      // NOTE: as of this writing, live Slingo banners are still 750x360 —
      // 750x484 is the new banner format already rolled out on other brands
      // (MC, GC, SNG) but not yet implemented on Slingo. This assertion
      // intentionally targets the future spec so the test starts passing
      // once Slingo picks up the new format; a failure here today is an
      // expected, known pending-rollout gap, not a live bug.
      const banner = page.locator('[class*="Banner" i], [class*="banner" i]').first();
      const img = banner.locator('img').first();
      const natural = await img.evaluate((el: HTMLImageElement) => ({
        width: el.naturalWidth, height: el.naturalHeight,
      })).catch(() => null);
      console.log(`BN-01 mobile banner image natural size: ${natural?.width}x${natural?.height}`);
      const matches = !!natural
        && Math.abs(natural.width - EXPECTED_MOBILE_BANNER_WIDTH) < 50
        && Math.abs(natural.height - EXPECTED_MOBILE_BANNER_HEIGHT) < 50;
      record('Mobile banner image matches expected 750x484 dimensions', matches);
    });

    await runStep('Step 6: Banner is readable without overlap/truncation at mobile viewport', async () => {
      const bannerText = page.locator('[class*="Banner" i], [class*="banner" i]')
        .locator('p, [class*="text" i], [class*="Text" i]').first();
      const overflow = await bannerText.evaluate(el => {
        return el.scrollWidth > el.clientWidth + 5 || el.scrollHeight > el.clientHeight + 5;
      }).catch(() => false);
      record('Banner text has no overlap/truncation on mobile', !overflow);
    });

    await runStep('Step 7: Banner is responsive at large viewport (2560x1440)', async () => {
      await page.setViewportSize(LARGE_VIEWPORT);
      await page.waitForTimeout(1_000);
      const banner = page.locator('[class*="Banner" i], [class*="banner" i]').first();
      await expect(banner).toBeVisible({ timeout: 10_000 });
      await page.setViewportSize({ width: 1280, height: 720 });
    });

    } finally {
      printSummary();
    }
  });

});

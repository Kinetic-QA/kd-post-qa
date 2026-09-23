import { test, expect } from '../../helpers/stealth-fixtures';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher, siteUrl } from '../../helpers/common';

/**
 * V1-WH-01: Website Header (Visual)
 * Scope: The brand logo image in the header must render without a broken
 * image, and its on-screen (rendered) size must preserve the image's own
 * natural aspect ratio — a mismatch means CSS is stretching, cropping, or
 * squashing it. Functional behavior of the same logo (click -> homepage) is
 * covered by tests/p1/website-header.spec.ts (WH-01 Step 6).
 * Verified against live SC UK DOM 2026-09-23: header logo is a single
 * <a href="https://www.slingo.com/"><img src="//cdn.slingo.com/img/logos/logo.png"
 * width="200" height="110"></a> inside the <header role="banner"> landmark;
 * naturalWidth/Height (200x110) matched the rendered box exactly on this run.
 * Homepage-only by design (header is a global element, identical on every
 * page).
 * Evidence: attaches a screenshot scoped to just the logo <img> (not a
 * full-page shot) so the HTML report visibly shows what was inspected.
 */

test.describe('Visual P1 - Website Header', () => {

  test.setTimeout(60_000);

  test('V1-WH-01: Header brand logo renders without breaking or distorting', async ({ page }) => {
    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(50));
      console.log('  V1-WH-01 WEBSITE HEADER (VISUAL) - RESULTS');
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

    try {
      await runStep('Navigate to homepage', async () => {
        await setupCampaignPopupWatcher(page);
        await page.goto('', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');
        // dismissCookieConsent/dismissCampaignPopup each poll internally on
        // their own realistic budget (see their doc comments in
        // helpers/common.ts) — no fixed settle delay needed before calling
        // them.
        await dismissCookieConsent(page);
        await dismissCampaignPopup(page);
      });

      // Same href-matching approach as website-header.spec.ts's Step 6 — the
      // logo anchor's href can be either the full absolute URL or a bare
      // root-relative "/" depending on brand.
      const rootPath = new URL(siteUrl('')).pathname;
      const logo = page.getByRole('banner')
        .locator(`a[href="${siteUrl('')}"] img, a[href="${rootPath}"] img`)
        .first();

      await runStep('Locate header logo', async () => {
        await expect(logo, 'Header brand logo <img> must exist inside the header landmark').toBeVisible({ timeout: 10_000 });
        // Element-scoped evidence — just the logo, not a full-page shot — so
        // the HTML report visibly proves which element was inspected.
        await test.info().attach('header-logo.png', {
          body: await logo.screenshot(),
          contentType: 'image/png',
        });
      });

      const info = await logo.evaluate((el: HTMLImageElement) => {
        const rect = el.getBoundingClientRect();
        return {
          complete: el.complete,
          naturalWidth: el.naturalWidth,
          naturalHeight: el.naturalHeight,
          renderedWidth: rect.width,
          renderedHeight: rect.height,
        };
      });

      await runStep('Verify logo loaded', async () => {
        expect(
          info.complete && info.naturalWidth > 0 && info.naturalHeight > 0,
          `Header logo failed to render (complete=${info.complete}, natural=${info.naturalWidth}x${info.naturalHeight})`
        ).toBe(true);

        expect(info.renderedWidth, 'Header logo has zero rendered width — not actually visible on screen').toBeGreaterThan(0);
        expect(info.renderedHeight, 'Header logo has zero rendered height — not actually visible on screen').toBeGreaterThan(0);
      });

      await runStep('Verify aspect ratio is not distorted', async () => {
        // Aspect-ratio drift catches stretch/crop/squash even when the image
        // itself loaded fine — a plain "is it visible" check would miss that.
        const naturalRatio = info.naturalWidth / info.naturalHeight;
        const renderedRatio = info.renderedWidth / info.renderedHeight;
        const ratioDeltaPct = Math.abs(renderedRatio - naturalRatio) / naturalRatio * 100;
        expect(
          ratioDeltaPct,
          `Header logo aspect ratio is distorted — natural ${naturalRatio.toFixed(3)} vs rendered ${renderedRatio.toFixed(3)} (${ratioDeltaPct.toFixed(1)}% off)`
        ).toBeLessThan(3);
      });
    } finally {
      printSummary();
    }
  });

});

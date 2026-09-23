import { test, expect } from '../../helpers/stealth-fixtures';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher, scrollToBottomTrusted } from '../../helpers/common';
import { currentGeoFeatures } from '../../helpers/geo-features';

/**
 * V1-FC-01: Footer Compliance (Visual)
 * Scope: Every regulator/licensing logo in the footer's <son-license-logos>
 * row must actually render — no broken image, no failed decode. This is a
 * rendering check only; link-destination correctness for the same logos is
 * covered functionally by tests/p2/footer-regulations.spec.ts (FR-01).
 * Pass/Fail: 1 broken or missing logo is an automatic fail — this is a
 * licensing/compliance surface, not cosmetic.
 * Verified against live SC UK DOM 2026-09-23: <son-license-logos> mounts
 * only after a real scroll to the bottom of the page (same lazy-mount
 * behavior documented for ZI UK in helpers/common.ts's scrollToBottomTrusted
 * docstring) — 8 logos found, all loaded cleanly on this run.
 * Homepage-only by design (footer is a global element, not per-page content —
 * confirmed present identically across pages via footer-navigation.spec.ts's
 * own "footer persists across all pages" note).
 * Evidence: attaches a screenshot scoped to just the <son-license-logos> row
 * (not a full-page shot) so the HTML report visibly shows what was inspected.
 */

test.describe('Visual P1 - Footer Compliance', () => {

  test.setTimeout(90_000);

  test('V1-FC-01: All footer regulator/licensing logos render without a broken image', async ({ page }) => {
    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(50));
      console.log('  V1-FC-01 FOOTER COMPLIANCE (VISUAL) - RESULTS');
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
      await runStep('Navigate and scroll to footer', async () => {
        await setupCampaignPopupWatcher(page);
        await page.goto('', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');
        // dismissCookieConsent/dismissCampaignPopup each poll internally on
        // their own realistic budget (see their doc comments in
        // helpers/common.ts) — no fixed settle delay needed before calling
        // them.
        await dismissCookieConsent(page);
        await dismissCampaignPopup(page);
        await scrollToBottomTrusted(page);
      });

      if (currentGeoFeatures().hasRegulationLogos === false) {
        test.skip(true, 'No <son-license-logos> regulation logo row exists for this GEO');
        return;
      }

      const logos = page.locator('son-license-logos img');
      const logoRow = page.locator('son-license-logos');

      let count = 0;
      await runStep('Locate regulator logo row', async () => {
        // <son-license-logos>'s shadow DOM can mount a beat after the scroll
        // settles — poll instead of a single check (same reasoning as
        // footer-regulations.spec.ts's Step 1).
        await expect.poll(() => logos.count(), {
          message: 'Regulator/licensing logo row must mount in the footer',
          timeout: 5_000,
        }).toBeGreaterThan(0);
        count = await logos.count();
        // Element-scoped evidence — just the logo row, not a full-page shot —
        // so the HTML report visibly proves which logos were inspected.
        await test.info().attach('footer-regulator-logos.png', {
          body: await logoRow.screenshot(),
          contentType: 'image/png',
        });
      });

      await runStep(`Verify all ${count} logo(s) rendered without a broken image`, async () => {
        const broken: string[] = [];
        for (let i = 0; i < count; i++) {
          const logo = logos.nth(i);
          // Confirmed live 2026-09-23 (same race also hit the banner spec):
          // a logo can still be mid-decode when checked immediately after
          // scroll — complete=false with the image otherwise fine. Poll for
          // a genuinely final state before reading it, instead of racing a
          // single snapshot against an in-flight load.
          await expect.poll(
            () => logo.evaluate((el: HTMLImageElement) => el.complete),
            { message: `logo #${i + 1} never finished loading`, timeout: 8_000 }
          ).toBe(true).catch(() => {}); // fall through to the real assertion below either way, so a genuinely-stuck logo still reports as broken with real src/dimensions rather than a bare timeout
          const info = await logo.evaluate((el: HTMLImageElement) => ({
            src: el.currentSrc || el.src,
            complete: el.complete,
            naturalWidth: el.naturalWidth,
            naturalHeight: el.naturalHeight,
          }));
          if (!info.complete || info.naturalWidth === 0 || info.naturalHeight === 0) {
            broken.push(`logo #${i + 1} (${info.src || 'no src'})`);
          }
        }
        expect(broken, `Broken/failed-to-render regulator logos: ${broken.join(', ')}`).toEqual([]);
      });
    } finally {
      printSummary();
    }
  });

});

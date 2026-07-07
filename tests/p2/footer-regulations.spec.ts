import { test, expect } from '@playwright/test';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher, assertNoSiteError } from '../../helpers/common';

/**
 * FR: Footer Regulations
 * Scope: The actual regulation/compliance logo row in the lower-right of
 * the footer — GamCare, Gamstop, UK Gambling Commission, GambleAware, Take
 * Time To Think, SkillOnNet/RNG cert — each is a clickable logo routing to
 * its regulator's site.
 *
 * Confirmed via live DOM inspection: these logos are NOT plain footer
 * <img>s — they render inside a <son-license-logos> custom element's
 * shadow DOM (same pattern as <son-cookie-consent>). Playwright auto-pierces
 * open shadow roots, so page.locator works directly without special
 * handling. None of these links have a target="_blank" attribute in the
 * static markup, but a JS click handler intercepts the click and opens the
 * regulator page in a new tab via window.open() anyway (confirmed live: the
 * original tab's URL never changes) — same pattern as the social icons in
 * footer-social-media-strip.spec.ts, so verify via the popup event, not the
 * current page's URL.
 */

const REGULATION_LOGO_LINKS = 'son-license-logos a[href]';

test.describe('P2 - Footer Regulations', () => {

  test.setTimeout(90_000);

  test('FR-01: Regulation icons redirect to expected regulation pages', async ({ page }) => {

    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(45));
      console.log('  FR-01 FOOTER REGULATIONS - RESULTS');
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

    await setupCampaignPopupWatcher(page);
    await page.goto('');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1_000);
    await dismissCookieConsent(page);
    await page.waitForTimeout(3_000);
    await dismissCampaignPopup(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    try {

    await test.step('Step 1: Regulation logo row is visible in footer', async () => {
      // <son-license-logos>'s shadow DOM can mount a beat after scroll/load
      // settles — poll briefly instead of a single check to avoid a false
      // "0 found" on a slow render (confirmed live: this flaked once).
      const regLogos = page.locator(REGULATION_LOGO_LINKS);
      let count = 0;
      for (let attempt = 0; attempt < 6; attempt++) {
        count = await regLogos.count();
        if (count > 0) break;
        await page.waitForTimeout(500);
      }
      record('Regulation logos present in footer', count > 0);
      console.log('FR-01 regulation logo links found: ' + count);
      expect(count).toBeGreaterThan(0);
    });

    await test.step('Step 2: Each regulation logo routes to its expected regulator page', async () => {
      const links = page.locator(REGULATION_LOGO_LINKS);
      const count = await links.count();
      const hrefs: string[] = [];
      for (let i = 0; i < count; i++) {
        hrefs.push(await links.nth(i).getAttribute('href') ?? '');
      }

      const currentOrigin = new URL(page.url()).origin;

      for (const href of hrefs) {
        if (!href) continue;
        // Some regulation-adjacent links (e.g. ES's self-exclusion deep
        // link) are relative and same-origin, unlike the cross-origin
        // regulator logos — resolve against the current page instead of
        // assuming an absolute URL, or new URL(href) throws.
        let resolved: URL;
        try {
          resolved = new URL(href, page.url());
        } catch {
          record(`Regulation logo -> ${href} (unparseable href)`, false);
          continue;
        }
        const isSameOrigin = resolved.origin === currentOrigin;
        const expectedHost = resolved.hostname;
        const label = `Regulation logo -> ${expectedHost}${isSameOrigin ? ' (same tab)' : ''}`;
        let popup: import('@playwright/test').Page | undefined;
        try {
          const link = page.locator(`${REGULATION_LOGO_LINKS}[href="${href}"]`).first();
          await expect(link).toBeVisible({ timeout: 10_000 });
          // The recurring offer/campaign popup can mount right as we're
          // about to click and swallow the click instead of opening the new
          // tab — dismiss it immediately beforehand, same fix applied in
          // footer-social-media-strip.spec.ts.
          await dismissCampaignPopup(page);

          if (isSameOrigin) {
            // Same-origin links (e.g. self-exclusion) navigate the current
            // tab via the SPA's own routing rather than opening a new tab —
            // verify via the query/hash fragment that actually identifies
            // the destination, since the path itself is unchanged (SPA
            // hash routing).
            await link.click();
            await page.waitForTimeout(1_500);
            const expectedFragment = resolved.hash || resolved.search;
            expect(page.url()).toContain(expectedFragment);
          } else {
            [popup] = await Promise.all([
              page.context().waitForEvent('page', { timeout: 10_000 }),
              link.click(),
            ]);
            await popup.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
            expect(popup.url()).toContain(expectedHost);
          }
          record(label, true);
        } catch (e) {
          record(label, false);
          throw e;
        } finally {
          await popup?.close().catch(() => {});
        }
      }
    });

    } finally {
      printSummary();
    }
  });

});

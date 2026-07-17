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
    await page.goto('', { waitUntil: 'domcontentloaded' });
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
            //
            // noWaitAfter — confirmed live on mobile: this click also
            // triggers ad-tracking iframe navigations (partytown sandbox),
            // and Playwright's default post-click wait hangs waiting for
            // ALL frame navigations to settle, not just the main one. The
            // actual page navigation itself completes within ~1s regardless
            // (confirmed via framenavigated events) — the explicit URL check
            // below is what actually verifies success, not this wait.
            await link.click({ noWaitAfter: true });
            await page.waitForTimeout(1_500);
            const expectedFragment = resolved.hash || resolved.search;
            expect(page.url()).toContain(expectedFragment);
          } else {
            // Confirmed live 2026-07-16: this click can silently miss on a
            // long-lived run (DE + SE both hit a 10s waitForEvent timeout
            // here during the 6-GEO baseline run, but 3 isolated re-runs
            // afterwards were all clean — a one-off click-swallow under
            // load, e.g. the campaign popup remounting right as we click,
            // not a per-GEO bug). One retry with a fresh dismiss absorbs
            // that without masking a real, persistent failure.
            //
            // Confirmed live on SNG AB mobile: NOT every cross-origin
            // regulation logo opens a new tab the way the header comment
            // above assumes — responsiblegambling.org specifically
            // navigates the CURRENT tab directly instead (no window.open()
            // interception for this one link). Race the popup event against
            // the current page navigating to the expected host, and accept
            // whichever actually happens rather than assuming cross-origin
            // always means "new tab."
            //
            // Strip "www." before comparing — confirmed live: this specific
            // link's href is www.responsiblegambling.org but the site
            // redirects to the bare responsiblegambling.org, so a plain
            // hostname.includes(expectedHost) check can never match (the
            // shorter post-redirect hostname doesn't contain the longer
            // www.-prefixed one). Comparing the bare domain both ways
            // handles either direction of www./non-www. redirect.
            const bareHost = expectedHost.replace(/^www\./, '');
            const matchesExpectedHost = (url: URL) => url.hostname.replace(/^www\./, '') === bareHost;
            // Confirmed live: this specific cross-origin same-tab navigation
            // can genuinely take longer than 10s (real third-party site,
            // VPN latency) — the first race can time out on BOTH branches
            // even though the navigation is still quietly in flight and
            // completes a moment later. Re-clicking on the retry then fails
            // outright, since the page has already navigated away and the
            // original selector no longer exists there. Check whether we've
            // already arrived before ever attempting a retry-click.
            const raceOnce = () => Promise.race([
              page.context().waitForEvent('page', { timeout: 20_000 }).then(p => ({ kind: 'popup' as const, popup: p })),
              page.waitForURL(matchesExpectedHost, { timeout: 20_000 }).then(() => ({ kind: 'sametab' as const })),
            ]);
            let outcome: { kind: 'popup'; popup: import('@playwright/test').Page } | { kind: 'sametab' };
            try {
              [outcome] = await Promise.all([raceOnce(), link.click()]);
            } catch {
              if (matchesExpectedHost(new URL(page.url()))) {
                outcome = { kind: 'sametab' };
              } else {
                await dismissCampaignPopup(page);
                [outcome] = await Promise.all([raceOnce(), link.click()]);
              }
            }
            if (outcome.kind === 'popup') {
              popup = outcome.popup;
              await popup.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
              // bareHost — confirmed live: connexontario.ca ALSO strips
              // "www." on redirect, same as responsiblegambling.org above.
              expect(popup.url()).toContain(bareHost);
            } else {
              // bareHost, not expectedHost — same www./non-www. redirect
              // this whole branch exists to handle in the first place.
              expect(page.url()).toContain(bareHost);
              // Full reload, not goBack() — confirmed live on SNG AB mobile:
              // after several same-tab regulator redirects in a row, the next
              // link in the loop (connexontario.ca) stopped resolving inside
              // <son-license-logos> at all, even though Step 1 counted it
              // successfully earlier in the same run. goBack() restores the
              // URL but doesn't reliably force this custom element's shadow
              // DOM to remount cleanly after repeated back-navigations. A
              // fresh navigation guarantees a clean remount every time.
              await page.goto('', { waitUntil: 'domcontentloaded' });
              await page.waitForLoadState('domcontentloaded');
              await page.waitForTimeout(1_000);
              await dismissCampaignPopup(page);
              await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
              await page.waitForTimeout(500);
            }
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

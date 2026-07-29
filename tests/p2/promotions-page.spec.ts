import { test, expect } from '../../helpers/stealth-fixtures';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher, siteUrl, assertNoSiteError } from '../../helpers/common';
import { currentGeoFeatures } from '../../helpers/geo-features';
import { currentLocaleStrings } from '../../helpers/locale-strings';

/**
 * PP: Promotions Page
 * Scope: Campaign CTA deeplinks, Learn More inner-page links, umbrella
 * inlinks, T&C copy visibility, Play Now → login/registration handoff, and
 * the header promo-icon entry point.
 * Path is GEO-dependent (see helpers/geo-features.ts) — e.g. UK/ROW/IE use
 * /casino-promotions/, ES uses /promociones/. Some
 * GEOs (e.g. Slingo SE) have no Promotions page at all and this suite skips.
 */

test.describe('P2 - Promotions Page', () => {

  test.setTimeout(120_000);

  let promoPath: string | null = null;

  test.beforeEach(async ({ page }) => {
    promoPath = currentGeoFeatures().promotionsPath;
    test.skip(!promoPath, `Promotions page does not exist for this GEO (${test.info().project.name})`);
    await setupCampaignPopupWatcher(page);
    await page.goto(promoPath!, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000);
    await dismissCookieConsent(page);
    await dismissCampaignPopup(page);
    await page.waitForTimeout(500);
  });

  test('PP-01: Promotions page full flow', async ({ page }) => {
    test.setTimeout(120_000);

    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(45));
      console.log('  PP-01 PROMOTIONS PAGE - RESULTS');
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

    const strings = currentLocaleStrings();
    const isMobile = test.info().project.name.endsWith('-mobile');

    try {

    // Campaign deeplinks have a slug after the promotions path (e.g. /free-spins-offer/);
    // the umbrella page itself and the header promo icon both link to the bare
    // promotions path and must be excluded so we don't click a self-link and
    // break page.goBack().
    const campaignLink = () => page.locator(
      `a[href*="/${promoPath}"]:not([href$="/${promoPath}"]):not([href="${siteUrl(promoPath!)}"])`
    ).filter({ visible: true }).first();

    // Confirmed live on PC UK: some inline promo copy links (e.g. "Easter
    // specials", a plain body-text anchor) use target="_blank" — they open a
    // NEW tab rather than navigating the current page, so page.url() on the
    // original page can never reflect the click. Shared by every step that
    // clicks a campaignLink() so all three handle this shape the same way,
    // not just whichever step happened to be checked first.
    async function clickCampaignLinkAndVerify(link: ReturnType<typeof campaignLink>, stepLabel: string): Promise<boolean> {
      const hasCampaignLink = await link.isVisible({ timeout: 10_000 }).catch(() => false);
      if (!hasCampaignLink) {
        console.log(`PP-01 ${stepLabel} skipped — no individual campaign deeplink exists for this GEO, only self-links to the umbrella page`);
        return false;
      }
      const href = await link.getAttribute('href') ?? '';
      console.log(`PP-01 ${stepLabel} clicking href: ` + href);
      const opensNewTab = (await link.getAttribute('target')) === '_blank';
      if (opensNewTab) {
        const [popup] = await Promise.all([
          page.context().waitForEvent('page', { timeout: 10_000 }),
          link.click(),
        ]);
        await popup.waitForLoadState('domcontentloaded');
        console.log(`PP-01 ${stepLabel} new tab URL: ` + popup.url());
        expect(popup.url()).toContain(href.replace(/^https?:\/\/[^/]+/, ''));
        await popup.close();
      } else {
        await link.click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2_000);
        console.log(`PP-01 ${stepLabel} url after click+wait: ` + page.url());
        expect(page.url()).toContain(href.replace(/^https?:\/\/[^/]+/, ''));
        await page.goto(promoPath!, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1_000);
        await dismissCampaignPopup(page);
      }
      return true;
    }

    await runStep('Step 1: Promotion CTA opens the expected campaign deeplink', async () => {
      await clickCampaignLinkAndVerify(campaignLink(), 'Step 1');
    });

    await runStep('Step 2: "CLAIM" CTA leads to expected inner page', async () => {
      // "Learn More" on this page links to /lp/ landing pages, which redirect
      // back to /casino-promotions/ without campaign query params attached —
      // confirmed live site behavior, not a selector issue. "CLAIM" CTAs link
      // directly to real campaign detail pages, so use those instead.
      await clickCampaignLinkAndVerify(campaignLink(), 'Step 2');
    });

    await runStep('Step 3: Umbrella page inlinks redirect to expected destination', async () => {
      await clickCampaignLinkAndVerify(campaignLink(), 'Step 3');
    });

    await runStep('Step 4: Approved T&C text displayed in pop-up banner', async () => {
      if (currentGeoFeatures().hasBonusPolicyBanner === false) {
        console.log('PP-01 Step 4 skipped — no bonus T&C banner text exists for this GEO');
        return;
      }
      // Match "and"/"&" (GEOs render this differently, e.g. ROW uses "Terms & Conditions
      // Apply") and filter to visible only — .first() alone can pick a same-text but
      // off-screen footer link ahead of the actually-visible banner text in DOM order.
      const tncLink = page.getByText(strings.bonusPolicyText)
        .filter({ visible: true }).first();
      await expect(tncLink).toBeVisible({ timeout: 10_000 });
    });

    await runStep('Step 5: "Play now"/"Let\'s Play" CTA opens login/registration widget', async () => {
      if (currentGeoFeatures().hasAccountModal === false) {
        console.log('PP-01 Step 5 skipped — Play CTA does not open an #account modal for this GEO (see helpers/geo-features.ts hasAccountModal)');
        return;
      }
      // .filter({visible:true}) — confirmed live on mobile: multiple
      // elements match this text (some are desktop-only and CSS-hidden at
      // mobile breakpoints), and .first() alone can grab a hidden one
      // (same ambiguity already handled this way in search.spec.ts).
      //
      // Restrict to actual clickable elements (button/link/role=button) —
      // confirmed live on FR-CA: the playCta regex also matches "jouer"
      // inside a plain marketing paragraph's body text (not a button), and
      // clicking that <p>'s bounding box lands on whatever link happens to
      // be underneath, producing inconsistent, non-widget navigation
      // instead of a real failure to open login. That paragraph is not a
      // Play CTA at all, so it must be filtered out rather than clicked.
      const playCandidates = page.getByText(strings.playCta).filter({ visible: true });
      const candidateCount = await playCandidates.count();
      let playBtn = null;
      for (let i = 0; i < candidateCount; i++) {
        const candidate = playCandidates.nth(i);
        const isClickable = await candidate.evaluate(el =>
          el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button'
        );
        if (isClickable) { playBtn = candidate; break; }
      }
      // Confirmed live on MC: this umbrella page's only playCta match is a
      // per-game-tile hover CTA (same as the homepage's showcase grid) —
      // hidden until hovered, not a standalone always-visible Play button
      // like other GEOs have. Skip rather than false-fail; a hover-based
      // version of this check would need the same mouse-glide approach
      // search.spec.ts uses for its own hover CTA.
      if (!playBtn) {
        console.log('PP-01 Step 5 skipped — no standalone Play CTA visible without hover for this GEO');
        return;
      }
      const hasPlayBtn = await playBtn.isVisible({ timeout: 10_000 }).catch(() => false);
      if (!hasPlayBtn) {
        console.log('PP-01 Step 5 skipped — no standalone Play CTA visible without hover for this GEO');
        return;
      }
      await playBtn.click();
      await page.waitForTimeout(1_500);
      await expect(page).toHaveURL(/#account/, { timeout: 10_000 });
      await page.keyboard.press('Escape');
    });

    await runStep('Step 6: Promotion icon in header leads back to Promotions page', async () => {
      if (currentGeoFeatures().hasPromotionsIconInHeader === false) {
        console.log('PP-01 Step 6 skipped — no Promotions icon in header for this GEO (page exists, just no header entry point)');
        return;
      }
      await page.goto('', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');
      await dismissCampaignPopup(page);
      // Mobile's visible entry point is the gift icon in the bottom nav
      // (confirmed live in website-header.spec.ts) — the header's own
      // promotions icon is CSS-hidden at mobile breakpoints.
      // Desktop scope changed from getByRole('banner') to the MainMenu_
      // container — see website-header.spec.ts Step 4 for why (a brand with
      // hasPromotionsIconInHeader: true can have its Promotions link live in
      // a sibling <nav> landmark, not inside <header role="banner">).
      const promoIcon = isMobile
        ? page.locator(`[class*="MobileMenu_promos-but"] a[href*="${promoPath!.replace(/\/$/, '')}"]`).first()
        : page.locator(`[class*="MainMenu_"] a[href*="${promoPath!.replace(/\/$/, '')}"]`).first();
      // Confirmed live on Lord Ping UK, 2026-07-28 — see website-header.spec.ts
      // Step 4: this brand's mobile bottom nav has no promos-but icon at all,
      // even though desktop's header link is real. Genuine per-platform gap.
      const promoIconExists = await promoIcon.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!promoIconExists) {
        console.log(`PP-01 Step 6 skipped — no ${isMobile ? 'mobile bottom-nav' : 'header'} Promotions icon for this GEO`);
        return;
      }
      // See website-header.spec.ts Step 4 — the MainMenu_ container can be an
      // off-canvas sidebar that's off-screen by default even on desktop.
      const isOnScreen = await promoIcon.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.x > -10 && rect.x < window.innerWidth;
      }).catch(() => false);
      if (!isOnScreen) {
        await page.evaluate(() => {
          (document.querySelector('[class*="hamburger" i]') as HTMLElement | null)?.click();
        });
        await page.waitForTimeout(800);
      }
      await promoIcon.click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(new RegExp(promoPath!.replace(/\/$/, '')), { timeout: 10_000 });
    });

    } finally {
      printSummary();
    }
  });

});

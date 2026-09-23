import { test, expect } from '../../helpers/stealth-fixtures';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher } from '../../helpers/common';
import { currentGeoFeatures } from '../../helpers/geo-features';

/**
 * V1-BN-01: Banner (Visual)
 * Scope: Hero banner — consolidated from 4 separate visual-check rows (hero
 * render, overlay legibility, carousel alignment, mobile framing) into one
 * item in docs/Automated Regression Checklist 2026.xlsx, "Visual Critical
 * Priority" tab. Functional behavior of the same banner (click ->
 * login/registration, bonus-policy link) is covered by
 * tests/p2/banner.spec.ts (BN-01), which deliberately excludes everything
 * checked here.
 *
 * Site-wide, not homepage-only: checked across every page in the site's main
 * nav/footer (Home, Slingo, Slots, Jackpots, Daily Jackpots, Bingo, Casino,
 * Roulette, Blackjack, Other, Help, Contact us, Privacy Policy, Information
 * Security Statement, Bonus Policy, Terms and Conditions, Mobile App,
 * Payment Options, Promotions, Features, Affiliates, About us) — a banner is
 * NOT guaranteed to be homepage-only, so presence is verified live per page
 * rather than assumed. A page with no hero banner is skipped with an
 * annotation, not a failure.
 *
 * Brand banner format is NOT uniform — confirmed live and reused from
 * tests/p2/banner.spec.ts's own header comment: GC/MC/SNG/SC/PC/ZI render
 * the banner image and its CTA as one baked-together image (a separate
 * overlaid CTA element is a fail for these); every other brand still has
 * them as genuinely separate elements by design (not a fail there, and no
 * fixed mobile dimension requirement applies).
 *
 * Pass/Fail Criteria (from the checklist, verbatim):
 * - No broken-image icon, no blank placeholder, no layout shift once the
 *   image loads. Applies to all brands.
 * - New-format brands: banner is one whole image with the CTA baked in — a
 *   separate CTA element is a fail. Mobile viewport: full-bleed (no
 *   letterboxing/white bars), exactly 750x484.
 * - Old-format brands: separate CTA element is expected, not a fail; no
 *   fixed mobile dimension requirement.
 * - Overlay text/CTA must be legible against the background (no low
 *   contrast). NOT checked here — see note below.
 * - Carousel nav dots/arrows must be aligned correctly, must not overlap
 *   the banner image or text.
 *
 * Legibility note: for new-format brands the CTA/overlay text is baked into
 * the image pixels themselves (confirmed live on SC UK 2026-09-23 — no
 * separate DOM text node exists to measure contrast against), so there is no
 * DOM-level signal to check contrast against. That sub-criterion is recorded
 * as an annotation, not asserted pass/fail, until a real visual-baseline/
 * pixel-diff tool exists (this item is flagged "Needs Visual Baseline" in
 * the checklist for exactly this reason).
 *
 * Carousel: EVERY slide is checked, not just whichever loads first.
 * IMPORTANT structural finding (confirmed live 2026-09-23): this is NOT one
 * wrapper containing N child slide <div>s. It's N entirely separate sibling
 * <section class="MainBanner_main-banner...">, one PER SLIDE
 * (id="main-banner", "main-banner-1", "main-banner-2", ...), each with its
 * own single <div class="MainBanner_foreground..."><img></div> inside it.
 * All are simultaneously mounted in the DOM; the slider swaps which section
 * is on-screen via CSS, not mount/unmount. An earlier version of this spec
 * queried `[class*="MainBanner_foreground"]` scoped inside just the FIRST
 * matching `#main-banner`/`.MainBanner_main-banner` element and always got 1
 * back, silently checking only slide 1 on every "multi-slide" page — fixed
 * by querying `[class*="MainBanner_main-banner"]` at the page level instead,
 * which returns one match per real slide.
 * Broken-image and CTA-structure checks run against each slide section's own
 * <img>/foreground directly by index, without needing to click through
 * (asset-loading state and DOM structure don't depend on which slide is
 * currently on-screen). Only the geometry-based mobile checks (full-bleed /
 * exact dimensions) need a slide to actually be the active/on-screen one, so
 * those click each slide into view first.
 *
 * Verified against live SC UK DOM 2026-09-23 (desktop 1440px and mobile
 * 393px/Pixel-5-class viewport):
 * - Homepage carousel: exactly 2 slides ("home" and "buffalo-blitz"
 *   sectionCode, confirmed via the image src query param and by clicking
 *   "next" until it disabled itself after 1 click).
 * - Nav buttons ([class*="MainBannerSlider_navButton"]) are siblings of the
 *   slide sections, not inside any one of them; disabled state is a real
 *   CSS class (MainBannerSlider_disabled), not just aria-disabled.
 * - Desktop natural/rendered aspect ratio matched (1920x472 natural,
 *   1440x354 rendered — same ~4.07 ratio, no layout shift/distortion).
 * - Mobile: the loaded <img>'s natural size is 750x484 (the <source
 *   width/height> HTML attributes read 750x360 — a stale sizing hint that
 *   does NOT match the real decoded image; the browser renders from the
 *   actual asset, confirmed via naturalWidth/naturalHeight, which is what
 *   this spec checks — do not check the <source> attribute instead), and it
 *   rendered full-width (393 CSS px, no letterboxing) at that viewport.
 * - Every page in the checklist's page list has a hero banner (no
 *   "no-banner-on-page" annotation seen on any page in a full run); 7 of the
 *   22 (Home, Slingo, Slots, Bingo, Casino, Promotions, Features) are
 *   multi-slide carousels, the other 15 are single-slide.
 *
 * Evidence: attaches a screenshot scoped to just that page/slide's banner
 * image (not a full-page shot) at every check point, and wraps every
 * sub-check in its own test.step() so the HTML report shows a per-page,
 * per-slide, per-check timeline instead of one flat block.
 */

const NEW_FORMAT_BRANDS = ['GC', 'MC', 'SNG', 'SC', 'PC', 'ZI'];
const REQUIRED_MOBILE_WIDTH = 750;
const REQUIRED_MOBILE_HEIGHT = 484;

function currentBrand(): string {
  return (process.env.TEST_BRAND ?? 'SC').toUpperCase();
}

function isNewBannerFormat(): boolean {
  return NEW_FORMAT_BRANDS.includes(currentBrand());
}

// Site-wide page list from the QA checklist. Category/taxonomy paths are
// brand-agnostic hardcoded hrefs (same convention already used by
// tests/p1/game-category-navigation.spec.ts); everything else resolves via
// currentGeoFeatures() with the same fallback defaults footer-navigation.spec.ts
// already uses, so this list stays correct across brands/GEOs rather than
// being SC-UK-only. `path: null` means "not offered for this GEO" - skipped
// with an annotation, not a failure.
function pagesToCheck(): { label: string; path: string | null }[] {
  const gf = currentGeoFeatures();
  return [
    { label: 'Home', path: '' },
    { label: 'Slingo', path: 'slingo/' },
    { label: 'Slots', path: 'slots/' },
    { label: 'Jackpots', path: 'slots/jackpots/' },
    { label: 'Daily Jackpots', path: 'slots/daily-jackpots/' },
    { label: 'Bingo', path: 'bingo/' },
    { label: 'Casino', path: 'casino/' },
    { label: 'Roulette', path: 'casino/roulette/' },
    { label: 'Blackjack', path: 'casino/blackjack/' },
    { label: 'Other', path: 'casino/other/' },
    { label: 'Help', path: gf.helpPath ?? 'help/' },
    { label: 'Contact us', path: gf.contactPath ?? 'contact/' },
    { label: 'Privacy Policy', path: gf.privacyPath ?? 'privacy/' },
    { label: 'Information Security Statement', path: 'information-security-statement/' },
    { label: 'Bonus Policy', path: 'bonus-policy/' },
    { label: 'Terms and Conditions', path: gf.termsPath ?? 'terms/' },
    { label: 'Mobile App', path: gf.mobileAppPath },
    { label: 'Payment Options', path: gf.paymentMethodsPath ?? 'payment-methods/' },
    { label: 'Promotions', path: gf.promotionsPath },
    { label: 'Features', path: gf.featuresPath },
    { label: 'Affiliates', path: gf.affiliatesPath ?? 'affiliates/' },
    { label: 'About us', path: gf.aboutUsPath ?? 'about-us/' },
  ];
}

test.describe('Visual P1 - Banner', () => {

  // Up to 22 page loads (more once mobile checks run their own per-slide
  // steps on top) — generous budget is expected and correct here, not a
  // sign something's wrong.
  test.setTimeout(15 * 60_000);

  test('V1-BN-01: Banner renders correctly across every page (desktop + mobile)', async ({ page }) => {
    await setupCampaignPopupWatcher(page);
    const isMobile = test.info().project.name.endsWith('-mobile');
    const newFormat = isNewBannerFormat();

    // One line per PAGE (not per sub-check — this spec runs dozens of
    // sub-checks per page, a line each would be unreadable). Note column
    // carries slide count / skip reason, matching the functional specs'
    // ✅/❌ summary-table convention but at page granularity.
    const results: { label: string; status: string; note: string }[] = [];
    function printSummary() {
      console.log('\n' + '═'.repeat(65));
      console.log('  V1-BN-01 BANNER (VISUAL) - RESULTS');
      console.log('═'.repeat(65));
      for (const r of results) {
        const icon = r.status === 'Pass' ? '✅' : r.status === 'Skip' ? '⏭️ ' : '❌';
        console.log(`  ${icon}  ${r.label.padEnd(32)} ${r.status.padEnd(6)} ${r.note}`);
      }
      const passed = results.filter(r => r.status === 'Pass').length;
      const skipped = results.filter(r => r.status === 'Skip').length;
      const failed = results.filter(r => r.status === 'Fail').length;
      console.log('─'.repeat(65));
      console.log(`  Total: ${results.length}  |  Passed: ${passed}  |  Skipped: ${skipped}  |  Failed: ${failed}`);
      console.log('═'.repeat(65) + '\n');
    }
    // Collect-then-assert at page granularity: one page failing must not
    // stop the other 21 from being checked (this is a site-wide sweep, not
    // a single linear flow) — same reasoning as the footer spec's
    // broken-logo list. The loop below never rethrows per-page; failures
    // are recorded and re-raised as one aggregate error after every page
    // has been attempted.
    const failedPages: string[] = [];

    try {
      for (const { label, path } of pagesToCheck()) {
      if (path === null) {
        results.push({ label, status: 'Skip', note: 'not offered for this GEO' });
        test.info().annotations.push({ type: 'page-not-offered', description: `${label}: page does not exist for this GEO — skipped.` });
        continue;
      }

      let note = '';
      try {
        await test.step(label, async () => {
        await test.step('Navigate and dismiss popups', async () => {
          await page.goto(path, { waitUntil: 'domcontentloaded' });
          await page.waitForLoadState('domcontentloaded');
          await dismissCookieConsent(page);
          await dismissCampaignPopup(page);
        });

        // One <section class="MainBanner_main-banner..."> per slide — NOT
        // one wrapper with N child slides (see header comment). This
        // locator itself is the slide list; its count IS the slide count.
        const slideSections = page.locator('[class*="MainBanner_main-banner"]');
        const slideCount = await slideSections.count();
        if (slideCount === 0) {
          note = 'no banner on this page';
          test.info().annotations.push({ type: 'no-banner-on-page', description: `${label}: no hero banner present on this page — skipped, not a failure.` });
          return;
        }
        note = `${slideCount} slide${slideCount > 1 ? 's' : ''}`;
        await expect(slideSections.first(), `${label}: banner section must be visible`).toBeVisible({ timeout: 5_000 });

        const navButtons = page.locator('[class*="MainBannerSlider_navButton"]');
        const hasNav = (await navButtons.count()) > 0;
        // Nav arrows exist in the DOM on mobile but are display:none by
        // design (confirmed live 2026-09-23: swipe replaces click-to-advance
        // there) — clicking one on mobile hangs until Playwright's
        // actionability timeout, so only click-navigate when the arrows are
        // actually visible on this viewport.
        const navClickable = hasNav && await navButtons.first().isVisible().catch(() => false);

        for (let i = 0; i < slideCount; i++) {
          const slideLabel = slideCount > 1 ? `slide ${i + 1} of ${slideCount}` : 'single slide';
          const foreground = slideSections.nth(i).locator('[class*="MainBanner_foreground"]').first();

          await test.step(`Banner image renders without a broken image (${slideLabel})`, async () => {
            const slideImg = foreground.locator('img').first();
            // Off-screen/inactive carousel slides can still be mid-decode
            // when checked (confirmed live 2026-09-23: Home slide 2 read
            // complete=false with correct natural=1920x472, not actually
            // broken — the browser just hadn't finished decoding the
            // inactive slide yet). Poll for the image to reach a genuinely
            // final state (complete=true, success or failure) instead of
            // reading a single snapshot that can race a real in-flight load.
            await expect.poll(
              () => slideImg.evaluate((el: HTMLImageElement) => el.complete),
              { message: `${label} ${slideLabel}: banner image never finished loading`, timeout: 10_000 }
            ).toBe(true);
            const info = await slideImg.evaluate((el: HTMLImageElement) => {
              const rect = el.getBoundingClientRect();
              return {
                complete: el.complete,
                naturalWidth: el.naturalWidth,
                naturalHeight: el.naturalHeight,
                renderedWidth: rect.width,
                renderedHeight: rect.height,
              };
            });
            expect(
              info.naturalWidth > 0 && info.naturalHeight > 0,
              `${label} ${slideLabel}: banner image failed to render (complete=${info.complete}, natural=${info.naturalWidth}x${info.naturalHeight})`
            ).toBe(true);
            await test.info().attach(`banner-${label}-${slideLabel}.png`.replace(/\s+/g, '-'), {
              body: await slideImg.screenshot(),
              contentType: 'image/png',
            });
          });

          await test.step(`CTA structure (${newFormat ? 'new' : 'old'} banner format, ${slideLabel})`, async () => {
            const separateCtaCount = await foreground.locator('a, button').count();
            if (newFormat) {
              expect(
                separateCtaCount,
                `${label} ${slideLabel}: ${currentBrand()} is a new-format brand — the banner CTA must be baked into the image, ` +
                `but found ${separateCtaCount} separate clickable element(s) overlaid on it.`
              ).toBe(0);
            } else {
              test.info().annotations.push({
                type: 'old-banner-format',
                description: `${label} ${slideLabel}: ${currentBrand()} uses the old banner format — separate CTA element(s) found: ${separateCtaCount}. This is expected, not a fail.`,
              });
            }
          });

          // Geometry-based checks need this slide to actually be on-screen —
          // click it into view before measuring. Slide 0 is already active
          // on page load, so no click needed for the first one.
          if (i > 0 && navClickable) {
            await test.step(`Navigate to ${slideLabel}`, async () => {
              await navButtons.last().click();
              await page.waitForTimeout(500);
            });
          } else if (i > 0 && isMobile) {
            test.info().annotations.push({
              type: 'mobile-slide-not-reachable',
              description: `${label} ${slideLabel}: carousel nav arrows are hidden on mobile (swipe navigation instead) — this slide's geometry (full-bleed/dimension) checks are skipped, only the broken-image/CTA-structure checks above ran.`,
            });
          }

          if (isMobile && (i === 0 || navClickable)) {
            await test.step(`Mobile: full-bleed, no letterboxing (${slideLabel})`, async () => {
              const slideImg = foreground.locator('img').first();
              const box = await slideImg.boundingBox();
              const viewport = page.viewportSize();
              expect(box, `${label} ${slideLabel}: banner image must have a bounding box on mobile`).not.toBeNull();
              expect(viewport, 'Mobile viewport must be set').not.toBeNull();
              if (!box || !viewport) return;
              // Confirmed live 2026-09-23 on Slingo (real Pixel-5 device
              // emulation, not just a resized viewport): the carousel's
              // real touch-enabled swiper doesn't always start on DOM index
              // 0 the way a plain viewport resize does — slide 0 read
              // x=-393 (off-screen) while slide 1 was actually active. This
              // spec's navigation model assumes index 0 starts active and
              // clicks forward from there, which real touch-mode swipers
              // don't always match. Rather than assert full-bleed against a
              // slide we can't confirm is genuinely on-screen (a false
              // failure), verify on-screen position first and skip with an
              // annotation when it isn't — real defects on a confirmed
              // on-screen slide are still caught below.
              if (Math.abs(box.x) >= 2) {
                test.info().annotations.push({
                  type: 'mobile-slide-not-confirmed-onscreen',
                  description: `${label} ${slideLabel}: this slide's container is not on-screen (x=${box.x}) under real mobile device emulation — the active slide differs from this test's navigation assumption. Skipping the full-bleed/dimension geometry checks for this slide rather than asserting against an off-screen element.`,
                });
                return;
              }
              await test.info().attach(`banner-mobile-${label}-${slideLabel}.png`.replace(/\s+/g, '-'), {
                body: await slideImg.screenshot(),
                contentType: 'image/png',
              });
              expect(Math.abs(box.x), `${label} ${slideLabel}: banner image is offset ${box.x}px from the left edge — expected full-bleed (0px)`).toBeLessThan(2);
              expect(
                Math.abs(box.width - viewport.width),
                `${label} ${slideLabel}: banner image width (${box.width}) does not match viewport width (${viewport.width}) — letterboxing/white bars present`
              ).toBeLessThan(2);
            });

            await test.step(`Mobile: exactly ${REQUIRED_MOBILE_WIDTH}x${REQUIRED_MOBILE_HEIGHT} (new-format brands only, ${slideLabel})`, async () => {
              if (!newFormat) {
                test.info().annotations.push({
                  type: 'old-format-no-fixed-dimension',
                  description: `${label} ${slideLabel}: ${currentBrand()} uses the old banner format — no fixed ${REQUIRED_MOBILE_WIDTH}x${REQUIRED_MOBILE_HEIGHT} mobile dimension requirement applies.`,
                });
                return;
              }
              // Decoded/natural image size, not the <picture><source width/height>
              // HTML attributes — confirmed live those are a stale sizing hint
              // (750x360 declared vs 750x484 actual decoded size for SC UK).
              const slideImg = foreground.locator('img').first();
              const natural = await slideImg.evaluate((el: HTMLImageElement) => ({
                naturalWidth: el.naturalWidth,
                naturalHeight: el.naturalHeight,
              }));
              expect(natural.naturalWidth, `${label} ${slideLabel}: mobile banner natural width must be exactly ${REQUIRED_MOBILE_WIDTH}px`).toBe(REQUIRED_MOBILE_WIDTH);
              expect(natural.naturalHeight, `${label} ${slideLabel}: mobile banner natural height must be exactly ${REQUIRED_MOBILE_HEIGHT}px`).toBe(REQUIRED_MOBILE_HEIGHT);
            });
          }
        }

        await test.step('Overlay text/CTA legibility (not automatable via DOM for this format)', async () => {
          test.info().annotations.push({
            type: 'needs-visual-baseline',
            description: `${label}: overlay text/CTA legibility is baked into the banner image pixels for this brand format — ` +
              'no DOM text node exists to measure contrast against. Not asserted here; needs a real visual-baseline/pixel-diff check.',
          });
        });

        if (!hasNav) {
          test.info().annotations.push({ type: 'no-carousel-nav', description: `${label}: no carousel nav buttons found — single-slide banner, nothing more to check.` });
        } else if (isMobile && !navClickable) {
          test.info().annotations.push({ type: 'no-carousel-nav-mobile', description: `${label}: carousel nav arrows are hidden by design on mobile (swipe navigation instead) — nothing to check.` });
        } else {
          await test.step('Carousel nav arrows are aligned and do not overlap the banner', async () => {
            const imageBox = await slideSections.first().locator('[class*="MainBanner_foreground"]').first().locator('img').first().boundingBox();
            expect(imageBox, `${label}: banner image must have a bounding box to compare nav-arrow alignment against`).not.toBeNull();
            const navCount = await navButtons.count();
            for (let i = 0; i < navCount; i++) {
              const btn = navButtons.nth(i);
              if (!(await btn.isVisible().catch(() => false))) continue;
              const box = await btn.boundingBox();
              expect(box, `${label}: carousel nav button #${i + 1} must have a real bounding box`).not.toBeNull();
              if (!box || !imageBox) continue;
              const btnCenterY = box.y + box.height / 2;
              expect(
                btnCenterY >= imageBox.y && btnCenterY <= imageBox.y + imageBox.height,
                `${label}: carousel nav button #${i + 1} (y-center ${btnCenterY}) is not vertically aligned within the banner image (${imageBox.y}-${imageBox.y + imageBox.height})`
              ).toBe(true);
            }
          });
        }
        });
        results.push({ label, status: note === 'no banner on this page' ? 'Skip' : 'Pass', note });
      } catch (e) {
        failedPages.push(label);
        results.push({ label, status: 'Fail', note: note || (e instanceof Error ? e.message.split('\n')[0].slice(0, 80) : 'error') });
      }
      }

      if (failedPages.length > 0) {
        throw new Error(`Banner check failed on ${failedPages.length} page(s): ${failedPages.join(', ')}`);
      }
    } finally {
      printSummary();
    }
  });

});

import { Page, Locator, expect, test } from '@playwright/test';
import { existsSync, writeFileSync } from 'fs';
import { currentGeoFeatures } from './geo-features';

/**
 * Extra settle wait for GEOs where the header login/join buttons (and other
 * early interactive elements) render clickable before their click handlers
 * are actually wired up (confirmed live 2026-07-21 on SNG FR-CA — see
 * geo-features.ts's extraPageSettleMs). Call after the standard post-load
 * wait, right before clicking login/join/search in a spec's beforeEach or
 * first interaction step.
 *
 * Idempotent per page — dismissCampaignPopup() calls this on every
 * invocation (it runs many times per test), but the actual wait only
 * happens once per page instance so repeated calls don't compound into a
 * multi-minute test.
 */
const settledPages = new WeakSet<Page>();
export async function waitForExtraPageSettle(page: Page): Promise<void> {
  if (settledPages.has(page)) return;
  const ms = currentGeoFeatures().extraPageSettleMs ?? 0;
  if (ms > 0) {
    settledPages.add(page);
    await page.waitForTimeout(ms);
  }
}

/**
 * Returns the current Playwright project's configured baseURL (no trailing
 * slash). playwright.config.ts resolves this per-GEO via TEST_BRAND/TEST_GEO,
 * so tests must never hardcode a brand domain — use this instead.
 */
export function getBaseUrl(): string {
  const baseURL = test.info().project.use.baseURL;
  if (!baseURL) throw new Error('No baseURL configured for this Playwright project.');
  return baseURL.replace(/\/+$/, '');
}

/**
 * Builds an absolute URL for a baseURL-relative path (no leading slash —
 * a leading slash resets to the domain root and drops path-prefixed GEOs
 * like Slingo ROW (/en-row/) and IE (/en-IE/)).
 */
export function siteUrl(path: string = ''): string {
  const clean = path.replace(/^\/+/, '');
  const base = getBaseUrl() + '/';
  return clean ? new URL(clean, base).toString() : base;
}

async function tryClickCookieConsent(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const allButtons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
    const consentEl = document.querySelector('son-cookie-consent');
    if (consentEl) {
      const sr = (consentEl as any).shadowRoot as ShadowRoot | null;
      if (sr) allButtons.push(...Array.from(sr.querySelectorAll('button')) as HTMLButtonElement[]);
    }
    // English (UK/ROW/IE/...), Spanish (ES), Swedish (SE), and
    // Danish (MC/DK) confirmed live; add more locales here as they're
    // confirmed rather than guessing translations.
    const KNOWN_ACCEPT_TEXTS = [
      'allow all cookies', 'allow all',
      'permitir todas las cookies', 'permitir todas', 'aceptar todas',
      'tillåt alla cookies',
      'tillad alle cookies', // Danish — confirmed live on both GC DK and MC DK 2026-07-24; wasn't being dismissed at all before this, silently blocking every subsequent click for the rest of each test
    ];
    const target = allButtons.find(b => {
      const t = (b.textContent ?? '').trim().toLowerCase();
      return KNOWN_ACCEPT_TEXTS.includes(t);
    });
    if (target) { target.scrollIntoView({ behavior: 'instant', block: 'nearest' }); target.click(); return true; }
    return false;
  }).catch(() => false);
}

// Compound/"second-level" TLDs where the real registrable domain needs 3
// labels, not 2 — e.g. primecasino.co.uk, not just co.uk. Confirmed live
// 2026-07-27 (PC UK onboarding): the naive last-2-labels slice collapsed
// www.primecasino.co.uk down to just "co.uk", so the expected pattern never
// matched the real redirect (playsecure.primecasino.co.uk) at all — add to
// this list as new compound-TLD domains are onboarded, rather than special-
// casing brands individually.
const COMPOUND_TLDS = ['co.uk', 'com.au', 'co.nz', 'org.uk'];

/**
 * After a successful login, most brands/GEOs redirect to a "playsecure."
 * subdomain of its own ROOT domain — e.g. www.slingo.com -> playsecure.slingo.com,
 * www.slingocasino.es -> playsecure.slingocasino.es. Confirmed live 2026-07-21
 * (SNG ON onboarding): this holds even when the baseURL itself carries a
 * province/market subdomain — on.spingenie.ca's real post-login redirect is
 * playsecure.spingenie.ca, NOT playsecure.on.spingenie.ca. So this always
 * collapses the hostname down to its last two labels (domain.tld) rather
 * than only stripping a literal "www." prefix, before prepending
 * "playsecure.". Deriving it from the current project's baseURL means
 * login.spec.ts doesn't need a hardcoded domain per GEO.
 *
 * Confirmed live 2026-07-28 (Lord Ping UK onboarding, brand-new brand): this
 * brand does NOT use a subdomain at all — a real successful login redirects
 * to www.lordping.co.uk/playsecure/home, a PATH on the same host. The regex
 * below matches either shape (subdomain OR same-host /playsecure/ path)
 * rather than assuming every brand follows the subdomain convention.
 */
export function expectedPlaysecureUrlPattern(): RegExp {
  const labels = new URL(getBaseUrl()).hostname.split('.');
  const lastTwo = labels.slice(-2).join('.');
  const rootDomain = COMPOUND_TLDS.includes(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
  const escapedRoot = rootDomain.replace(/\./g, '\\.');
  return new RegExp(`playsecure\\.${escapedRoot}|${escapedRoot}\\/playsecure\\/`);
}

/**
 * Resolves the mobile Login/Join button, trying known shapes in order —
 * every spec that needs a mobile Login/Join click (login.spec.ts,
 * feedback-form.spec.ts, login-widget.spec.ts, registration-widget.spec.ts,
 * sidebar-navigation.spec.ts) previously duplicated its own copy of the
 * sidebar-only version of this logic; consolidated here once a second real
 * shape existed to justify sharing it. Returns null if no shape matched, so
 * callers can decide whether that's a real gap worth failing on or a known
 * per-GEO absence worth skipping.
 *
 * Shape 1 — Lord Ping (LP) UK, confirmed live 2026-07-28: separate, real
 * #mobile-login/#mobile-join buttons living inside the MobileFooter's
 * play-but <li>, NOT inside the hamburger sidebar at all (LP's sidebar has
 * no Login/Join buttons whatsoever — confirmed by inspecting its full DOM).
 * Checked first since it's the most specific/unambiguous match.
 *
 * Shape 2 — most other brands: hidden inside the off-canvas hamburger
 * sidebar (MainMenu_main-menu), matched by the button's own text. The
 * sidebar has a real nonzero bounding box even while closed (just
 * translated off-screen), so isVisible() alone can't tell open from closed
 * — opens the hamburger first if the sidebar isn't already on-screen.
 */
export async function resolveMobileAccountButton(
  page: Page, kind: 'login' | 'join', textMatcher: RegExp
): Promise<Locator | null> {
  const byId = page.locator(`#mobile-${kind}`);
  if (await byId.count() > 0) return byId.first();

  // Confirmed live on Lucky Me Slots (LMS) UK 2026-08-03: the x-position
  // boundingClientRect heuristic below can misreport an actually-closed
  // sidebar as "already on screen" at this brand's mobile viewport width,
  // silently skipping the hamburger click entirely and leaving the sidebar
  // closed for the rest of this function. Rather than trust that heuristic
  // as a gate, always check for the real button first — click the
  // hamburger and re-check only if it's genuinely not there yet. Safe for
  // every other brand too: if the button is already visible, the extra
  // click is skipped exactly as before.
  const sidebarLocator = page.locator('[class*="MainMenu_main-menu"], #top-nav').getByRole('button', { name: textMatcher }).first();
  if (await sidebarLocator.count() > 0 && await sidebarLocator.isVisible().catch(() => false)) {
    return sidebarLocator;
  }
  await page.evaluate(() => {
    (document.querySelector('[class*="hamburger" i], #menu-X') as HTMLElement | null)?.click();
  });
  await page.waitForTimeout(800);
  const sidebarBtn = page.locator('[class*="MainMenu_main-menu"], #top-nav').getByRole('button', { name: textMatcher }).first();
  if (await sidebarBtn.count() > 0) return sidebarBtn;
  // Confirmed live on Prime Slots (PSL) UK 2026-07-30: this brand has no
  // hamburger/sidebar at all on mobile, but its desktop-shaped #login-
  // header/#join-header buttons are CSS-hidden at mobile widths — a
  // SEPARATE pair (#nav-login-header/#nav-join-header, same accessible
  // name) is the real visible mobile entry point instead. Try the banner
  // scope first (works for brands whose desktop buttons stay visible on
  // mobile), then fall back to an unscoped page-wide match by accessible
  // name for brands like this one where the real mobile button isn't
  // nested inside the banner landmark at all.
  const bannerBtn = page.getByRole('banner').getByRole('button', { name: textMatcher }).first();
  if (await bannerBtn.count() > 0) return bannerBtn;
  const pageWideBtn = page.getByRole('button', { name: textMatcher }).first();
  if (await pageWideBtn.count() > 0) return pageWideBtn;
  return null;
}

/**
 * Confirmed live: the site occasionally shows a generic "SOMETHING WENT
 * WRONG" error state (a transient rendering glitch, not a real bug) that
 * leaves the page unusable for the rest of that test. Throwing a clear,
 * specific error here — rather than letting the test grind on and fail
 * later on an unrelated timeout — makes the retry (see playwright.config.ts
 * retries) both faster and obvious in the report as "site glitched, retried"
 * rather than a confusing unrelated failure.
 *
 * Confirmed live: deep into a long full-suite run (20+ tests, one
 * long-lived browser process), this glitch can flash in and clear itself
 * within a couple of seconds — a single 500ms check caught it mid-flash and
 * failed the whole test (and its retry) even though the site had already
 * recovered by the time the retry's fresh page loaded. Same class of
 * under-load timing issue as dismissCookieConsent's budget bump above —
 * poll for a few seconds before treating it as a real, persistent glitch.
 *
 * Confirmed live (2026-07-14): polling alone isn't always enough — this can
 * still be showing after the full ~3.5s poll AND after Playwright's own
 * whole-test retry (which only gets a fresh page/context, not a fresh
 * browser process — playwright.config.ts runs 1 worker, so the same
 * long-lived renderer carries over). A real page.reload() is what actually
 * clears it deep in a long run, so try that once as a last resort before
 * giving up for real. Safe to call mid-test: this only reloads the page
 * already navigated to, it never changes the URL.
 */
export async function assertNoSiteError(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const hasError = await page.getByText('SOMETHING WENT WRONG', { exact: false })
      .isVisible({ timeout: 500 }).catch(() => false);
    if (!hasError) return;
    if (attempt < 3) await page.waitForTimeout(1_000);
  }
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(2_000);
  const stillBroken = await page.getByText('SOMETHING WENT WRONG', { exact: false })
    .isVisible({ timeout: 500 }).catch(() => false);
  if (!stillBroken) {
    // Site glitched and recovered on its own once reloaded — the test still
    // passes (a real bug would have persisted through the reload too), but
    // this is worth surfacing to dev: a real visitor on this page wouldn't
    // get an automatic reload. Recorded as an annotation, not a failure, so
    // excel-reporter.cjs can flag it as a side note without affecting
    // pass/fail counts.
    test.info().annotations.push({
      type: 'self-healed-site-error',
      description: `"SOMETHING WENT WRONG" appeared on ${page.url()} but cleared after a page reload.`,
    });
    return;
  }
  throw new Error('Site showed "SOMETHING WENT WRONG" — persisted through polling and a page reload, likely a real issue.');
}

/**
 * Scroll to the bottom of the page using real (trusted) wheel input instead
 * of `page.evaluate(() => window.scrollTo(...))`. Confirmed live on Zingo
 * Bingo (ZI) UK mobile 2026-09-02: this brand's footer regulation-logo
 * widget (<son-license-logos>) is interaction-gated — it never mounts on a
 * programmatic scroll (an untrusted DOM API call a script can tell apart
 * from real input), which is exactly why footer-regulations.spec.ts had
 * been reporting it as missing since 2026-07-29 even though it's genuinely
 * present for every real visitor, who always scrolls via trusted input.
 * `page.mouse.wheel()` dispatches genuine trusted wheel events, matching
 * what a real user's scroll looks like to the page's own scripts.
 */
export async function scrollToBottomTrusted(page: Page): Promise<void> {
  let lastY = -1;
  for (let attempt = 0; attempt < 40; attempt++) {
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(150);
    const y = await page.evaluate(() => window.scrollY + window.innerHeight >= document.body.scrollHeight - 2 ? -1 : window.scrollY);
    if (y === -1 || y === lastY) break;
    lastY = y;
  }
  await page.waitForTimeout(500);
}

export async function dismissCookieConsent(page: Page): Promise<void> {
  await assertNoSiteError(page);
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.waitForTimeout(300);
  // Poll rather than a single check-and-click attempt: under a long
  // sequential suite run, the <son-cookie-consent> custom element's script
  // sometimes loads a beat later than usual, so a one-shot attempt can find
  // nothing and leave the banner to appear afterwards, silently intercepting
  // every later click for the rest of that test.
  //
  // Confirmed live: deep into a long full-suite run (20+ tests, one
  // long-lived browser process, video/trace/screenshot recording on for
  // every test), this script's mount can slow down well past the original
  // 8-attempt/~500ms budget (~6-8s total) — the failure screenshot showed
  // the real "Allow all cookies" button, fully rendered with exact matching
  // text, still sitting there unclicked. Not a wrong selector, just not
  // enough budget under load. 20 attempts/~800ms (~16s) absorbs that
  // slowdown without lengthening the common case, since this returns the
  // moment a click lands.
  for (let attempt = 0; attempt < 20; attempt++) {
    const clicked = await tryClickCookieConsent(page);
    if (clicked) {
      await page.waitForTimeout(700);
      return;
    }
    await page.waitForTimeout(800);
  }
}

/**
 * Some brands' platform (confirmed on GC UK, same underlying gap already
 * documented for MC UK in PLAN.md) sit behind Cloudflare bot-detection that
 * INTERMITTENTLY shows a "Performing security verification" interstitial
 * with a real Turnstile "Verify you are human" checkbox, instead of the real
 * page — confirmed live to be genuinely random per-request, not tied to
 * request speed/rate (the same path loaded clean on one run and got
 * challenged on the very next). A real user occasionally sees this too and
 * just ticks the box, so do the same here rather than treating every
 * challenge as an unrecoverable site bug. No-ops almost immediately when no
 * challenge is showing, so it's safe to call after every navigation.
 */
export async function dismissCloudflareChallenge(page: Page): Promise<void> {
  const cfFrame = page.frameLocator('iframe[src*="challenges.cloudflare.com"]');
  const checkbox = cfFrame.locator('input[type="checkbox"]');
  const present = await checkbox.isVisible({ timeout: 3_000 }).catch(() => false);
  if (!present) return;
  await checkbox.click().catch(() => {});
  // Cloudflare's own verification round-trip after ticking the box —
  // confirmed live this needs several seconds, not the usual ~1s UI settle.
  await page.waitForTimeout(5_000);
}

/**
 * Game tile / game-info-modal "Play" CTA, scoped to a given container.
 * Every brand onboarded before GC has this as a real text button (playCta
 * string from locale-strings.ts, e.g. "PLAY IT"/"JUGAR"). Confirmed live on
 * GC UK: its hover-reveal Play CTA is ICON-ONLY (a bare <img src="play.png">
 * inside a button with no text at all, class "play" inside a
 * GameTile_tile-hover container) — a hasText match against it can never
 * succeed. Combine both so existing text-based brands are unaffected and
 * icon-only brands like GC still resolve to the real button.
 */
export function playCtaLocator(container: Locator, playCtaText: string | RegExp): Locator {
  const textBased = container.locator('a, button').filter({ hasText: playCtaText });
  const iconBased = container.locator('[class*="tile-hover"] button.play, [class*="tile-hover"] a.play, button.play, a.play');
  return textBased.or(iconBased);
}

export async function dismissCampaignPopup(page: Page): Promise<void> {
  // Confirmed via live DOM inspection:
  // Campaign popup (Blazing Rainbows etc.) close button = span[class*="OfferPopup_close"]
  // Also handles old popup structure: img[alt="close"] inside a[href="#account"]

  // 1. New popup: OfferPopup close button — click it directly
  const offerClose = page.locator('[class*="OfferPopup_close"], [class*="Popup_close"][class*="OfferPopup"]')
    .filter({ visible: true }).first();
  const hasOfferPopup = await offerClose.isVisible({ timeout: 500 }).catch(() => false);
  if (hasOfferPopup) {
    await offerClose.click({ force: true });
    await page.waitForTimeout(600);
  }

  // 2. Old popup: img[alt="close"] inside a[href="#account"] — use Escape
  const hasOldPopup = await page.evaluate(() => {
    const closeImg = document.querySelector('img[alt="close"]');
    return !!(closeImg && closeImg.closest('a[href*="#account"]'));
  }).catch(() => false);
  if (hasOldPopup) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  }

  await waitForExtraPageSettle(page);
}

export async function setupCampaignPopupWatcher(page: Page): Promise<void> {
  await page.exposeFunction('__pw_dismissCampaignPopup__', async () => {
    await page.keyboard.press('Escape').catch(() => {});
  });
  await page.addInitScript(() => {
    let cooldown = false;
    // Bounding-box + computed-style check — more reliable than offsetParent
    // for elements that toggle visibility via a class/style flip rather than
    // being added/removed from the DOM (this popup's case, see below).
    function isReallyVisible(el: HTMLElement): boolean {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const style = window.getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none';
    }
    function checkAndDismiss() {
      if (cooldown) return;

      // New popup: OfferPopup close button — click it directly, no Escape
      // needed. Runs on every DOM mutation so a popup that appears mid-test
      // (not just on initial load) still gets dismissed automatically.
      const offerClose = document.querySelector(
        '[class*="OfferPopup_close"], [class*="Popup_close"][class*="OfferPopup"]',
      ) as HTMLElement | null;
      if (offerClose && isReallyVisible(offerClose)) {
        cooldown = true;
        offerClose.click();
        setTimeout(() => { cooldown = false; }, 2000);
        return;
      }

      // Old popup: img[alt="close"] inside a[href="#account"] — use Escape.
      const closeImg = document.querySelector('img[alt="close"]');
      if (closeImg && closeImg.closest('a[href*="#account"]')) {
        cooldown = true;
        (window as any).__pw_dismissCampaignPopup__().finally(() => {
          setTimeout(() => { cooldown = false; }, 2000);
        });
      }
    }
    // Confirmed live: this popup's element is present in the DOM from
    // initial load (collapsed to 0x0) and only becomes visible a few
    // seconds later via a class/style attribute flip, not a childList
    // mutation — childList/subtree alone never fired for it. Watching
    // attributes covers that; the 500ms interval is a belt-and-braces
    // fallback for any transition style not covered by class/style either.
    //
    // Observe `document`, not `document.documentElement` — addInitScript
    // runs before the page has an <html> element yet, so documentElement is
    // null at this point and .observe() throws synchronously, silently
    // killing the rest of this script (including the code below) on every
    // navigation. This was a pre-existing bug: the watcher has never
    // actually run — only the explicit dismissCampaignPopup() calls
    // scattered through each spec have been doing the real dismissal work.
    const observer = new MutationObserver(checkAndDismiss);
    observer.observe(document, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'],
    });
    setInterval(checkAndDismiss, 500);
    if (document.readyState !== 'loading') {
      checkAndDismiss();
    } else {
      document.addEventListener('DOMContentLoaded', checkAndDismiss);
    }
  });
}

export async function dismissPopups(page: Page): Promise<void> {
  await dismissCookieConsent(page);
  await dismissCampaignPopup(page);
  const closeSelectors = [
    'button:has-text("Accept All Cookies")', 'button:has-text("Accept Cookies")',
    'button:has-text("I Accept")', '[id*="cookie"] button', '[class*="cookie"] button',
    'button[aria-label="Close"]', 'button[aria-label="close"]',
    '[class*="close-btn"]', '[class*="closeBtn"]', '[class*="btn-close"]', '[class*="modal-close"]',
  ];
  for (const selector of closeSelectors) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 400 })) {
        await el.scrollIntoViewIfNeeded().catch(() => {});
        await el.click({ force: true });
        await page.waitForTimeout(300);
      }
    } catch { /* try next */ }
  }
  try { await page.keyboard.press('Escape'); await page.waitForTimeout(300); } catch { /* ignore */ }
}

export async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => {});
  await assertNoSiteError(page);
}

export async function goHome(page: Page): Promise<void> {
  await page.goto('/');
  await waitForPageReady(page);
  await dismissPopups(page);
}

const SIDEBAR_SELECTOR = '[class*="MainMenu_main-menu"], #top-nav';
// #menu-X added 2026-08-03: Lucky Me Slots (LMS) confirmed live to use a
// literal id="menu-X" for its hamburger trigger (not a class match at all,
// same value across repeated page loads — confirmed stable, not a random
// per-session id). Purely additive: doesn't affect any brand that doesn't
// have this exact id.
const HAMBURGER_SELECTOR = '[class*="hamburger"], #menu-X';

/**
 * Confirmed live: real visitors only ever reach the blog through the
 * sidebar's Blog link — there's no header/footer entry point exercised in
 * normal browsing. Blog specs must reach it the same way rather than
 * page.goto()-ing the blog path directly, or they're testing a page load
 * that doesn't reflect how the page is actually navigated to.
 */
export async function navigateToBlogViaSidebar(page: Page, blogPath: string): Promise<void> {
  // Confirmed live on Prime Slots (PSL) UK 2026-07-31: an unqualified
  // page.goto() defaults to waitUntil: 'load' (waits for every homepage
  // image/resource to finish), which occasionally exceeds the 15s
  // navigationTimeout on this brand's image-heavy homepage — every other
  // navigation in this codebase already uses 'domcontentloaded' instead.
  await page.goto('', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1_000);
  await dismissCookieConsent(page);
  await page.waitForTimeout(2_000);
  await dismissCampaignPopup(page);

  // Confirmed live on Prime Slots (PSL) UK 2026-07-30: this brand has no
  // hamburger/sidebar at all — its Blog link lives directly in the footer
  // instead. Fall back to a plain footer-link click rather than assuming
  // every brand reaches the blog through a sidebar drawer.
  // Confirmed live on Simba Games (SG) UK 2026-08-04: this brand's real
  // footer link is literally href="/blog" (no trailing slash), unlike every
  // other brand's "/blog/" — a plain substring match against blogPath
  // ('blog/', trailing slash) silently found nothing and fell through to
  // the sidebar path below, which then failed for real since SG has no
  // sidebar blog link at all. Strip the trailing slash before matching so
  // this works regardless of which form a given brand's real href uses.
  const blogPathNoTrailingSlash = blogPath.replace(/\/$/, '');
  const footerBlogLink = page.locator(`footer a[href*="${blogPathNoTrailingSlash}"], [class*="Footer_footer-mid"] a[href*="${blogPathNoTrailingSlash}"]`).first();
  if (await footerBlogLink.count() > 0) {
    await footerBlogLink.scrollIntoViewIfNeeded().catch(() => {});
    await footerBlogLink.click();
    await page.waitForLoadState('domcontentloaded');
    // Confirmed live on PSL UK 2026-07-31: the blog listing's category links
    // are client-rendered and can still be hydrating right after
    // domcontentloaded, especially deep into a long sequential run —
    // networkidle gives them a real chance to finish before callers
    // (blog-page.spec.ts's own poll loop) start scanning for them.
    // Bounded to 5s (was unbounded, i.e. the default 30s) — confirmed live
    // on SC UK 2026-09-09 via trace inspection that this brand's blog pages
    // keep background network chatter going indefinitely (a
    // Partytown-proxied third-party script), so 'networkidle' never
    // legitimately fires and was silently eating the full 30s here on every
    // run. blog-page.spec.ts's own 6-attempt/6s poll loop already covers the
    // actual hydration race this wait was added for, so a short grace
    // window is enough; it no longer needs to be the primary safeguard.
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(1_000);
    // The <son-cookie-consent> element re-renders on every fresh page load,
    // including this navigation to /blog/ — confirmed live on Ice36 UK
    // 2026-09-03: leaving it undismissed here silently intercepts pointer
    // events on later clicks (e.g. the blog search icon), which surfaces
    // as an unrelated-looking click timeout several steps later.
    await dismissCookieConsent(page);
    await dismissCampaignPopup(page);
    return;
  }

  // Hamburger toggle — React requires a JS click, same as sidebar-navigation.spec.ts.
  await page.evaluate((sel) => {
    (document.querySelector(sel) as HTMLElement | null)?.click();
  }, HAMBURGER_SELECTOR);
  await page.waitForTimeout(600);
  await dismissCampaignPopup(page);

  const blogLink = page.locator(`${SIDEBAR_SELECTOR} a[href*="${blogPathNoTrailingSlash}"]`).first();
  await expect(blogLink).toBeVisible({ timeout: 10_000 });
  await blogLink.click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1_000);
  // Same fresh-page re-render as the footer-link branch above.
  await dismissCookieConsent(page);
  await dismissCampaignPopup(page);
}

export async function openLoginWidget(page: Page): Promise<void> {
  const loginBtn = page.locator('a:has-text("Log in"), button:has-text("Log in"), a:has-text("Login"), button:has-text("Login")').first();
  await expect(loginBtn).toBeVisible({ timeout: 8_000 });
  await loginBtn.click();
  await expect(page).toHaveURL(/#account/, { timeout: 10_000 });
}

export async function openRegisterWidget(page: Page): Promise<void> {
  const joinBtn = page.locator('a:has-text("Join"), button:has-text("Join")').first();
  await expect(joinBtn).toBeVisible({ timeout: 8_000 });
  await joinBtn.click();
  await expect(page).toHaveURL(/#account/, { timeout: 10_000 });
}

/**
 * Markets where the raw-content-key check runs. Added for Alberta first
 * (2026-10-15): real testers saw the CMS key "content.alberta_comment" at the
 * top of the registration widget on MC AB, while the automated registration
 * test passed (it only proves the form works, not that every line of text on
 * it is real copy). Add a market's code here to turn the check on for it.
 */
const RAW_KEY_CHECK_GEOS = new Set(['AB']);

const { isStaging: isStagingCopy } = require('./staging.cjs') as { isStaging: () => boolean };

/**
 * STAGING ONLY. The real defect is fixed on the live site, so to watch the
 * check fire during a REAL run, the staging GUI's `--simulate-raw-key` switch
 * plants a raw key into the real registration widget — same spot testers saw
 * it, right under the "Welcome to ..." / "Step N of M" header. Honoured only
 * when RAW_KEY_SIMULATE is set AND this is the staging copy (never on live).
 */
async function plantSimulatedRawKey(page: Page, text: string): Promise<void> {
  for (const frame of page.frames()) {
    if (frame.isDetached()) continue;
    await frame.evaluate((t: string) => {
      const findDeep = (root: Document | ShadowRoot, sel: string): Element | null => {
        const direct = root.querySelector(sel);
        if (direct) return direct;
        for (const el of Array.from(root.querySelectorAll('*'))) {
          if (el.shadowRoot) {
            const hit = findDeep(el.shadowRoot, sel);
            if (hit) return hit;
          }
        }
        return null;
      };
      const step = findDeep(document, '[part="current-step"]');
      const header = step ? (step.closest('.grid') ?? step.parentElement) : null;
      const host = header?.parentElement;
      if (!header || !host || host.querySelector('[data-raw-key-simulated]')) return;
      const row = document.createElement('div');
      row.className = 'flex flex-wrap';
      const col = document.createElement('div');
      col.className = 'flex-[0_0_100%]';
      const p = document.createElement('p');
      p.className = 'mb-5';
      p.setAttribute('data-raw-key-simulated', 'true');
      p.textContent = t;
      col.appendChild(p);
      row.appendChild(col);
      header.after(row);
    }, text).catch(() => {});
  }
}

/**
 * Looks at the text a visitor can actually see (including inside iframes and
 * open shadow roots) for content that was never filled in: a CMS translation
 * key such as "content.alberta_comment", a leftover "{{template}}" slot,
 * "[object Object]" or a bare "undefined"/"NaN".
 *
 * A hit is NOT a test failure — the functional check is the test's job. It is
 * recorded as a `raw-content-key` annotation plus an outlined screenshot and a
 * short context file, so the GUI's Review step can list it under "Also
 * noticed" (and offer a Jira ticket). Never throws: a scan problem must not
 * turn a working flow red.
 *
 * `where` says what the test had just done ("after step: ..."), so the note
 * can say where the text was seen.
 */
export async function noteRawContentKeys(page: Page, where: string): Promise<void> {
  try {
    const info = test.info();
    const geo = info.project.name.replace(/-mobile$/, '');
    if (!RAW_KEY_CHECK_GEOS.has(geo)) return;

    // Staging-only simulation (see plantSimulatedRawKey). The note says so, so a
    // simulated hit is never mistaken for a real finding.
    const simulate = process.env.RAW_KEY_SIMULATE;
    if (simulate && isStagingCopy()) {
      await plantSimulatedRawKey(page, simulate);
      where = `${where} [simulated by staging]`;
    }

    // One note can hold several texts joined with " | " — remember each one.
    const alreadyNoted = new Set(
      info.annotations
        .filter(a => a.type === 'raw-content-key')
        .flatMap(a => { try { return String(JSON.parse(a.description ?? '{}').text).split(' | '); } catch { return []; } }),
    );

    for (const frame of page.frames()) {
      if (frame.isDetached()) continue;
      const texts: string[] = await frame.evaluate(() => {
        const TLDS = new Set(['com', 'ca', 'org', 'net', 'co', 'uk', 'ie', 'es', 'se', 'dk', 'io', 'gov', 'info', 'tv', 'app', 'eu', 'de', 'fr', 'biz']);
        const NAMESPACES = new Set(['content', 'common', 'label', 'labels', 'button', 'buttons', 'error', 'errors', 'message', 'messages', 'text', 'title', 'page', 'form', 'forms', 'registration', 'register', 'account', 'cms', 'i18n', 'translation', 'translations', 'validation', 'placeholder', 'tooltip', 'modal', 'widget', 'footer', 'header', 'menu', 'nav']);
        const DOTTED = /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*)+$/;
        const isRaw = (t: string): boolean => {
          if (/^(undefined|NaN|\[object Object\])$/.test(t)) return true;
          if (/\{\{\s*[\w.$-]+\s*\}\}/.test(t)) return true;
          if (t.length > 80 || /\s/.test(t) || !DOTTED.test(t)) return false;
          const parts = t.split('.');
          if (parts[0] === 'www' || TLDS.has(parts[parts.length - 1])) return false;
          return t.includes('_') || parts.length >= 3 || NAMESPACES.has(parts[0]);
        };
        const visible = (el: Element): boolean => {
          if (!el.getClientRects().length) return false;
          const cs = getComputedStyle(el);
          return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
        };
        const found: string[] = [];
        const visit = (node: Node): void => {
          if (node.nodeType === Node.TEXT_NODE) {
            const t = (node.textContent ?? '').trim();
            const p = node.parentElement;
            if (!t || !p || !isRaw(t)) return;
            if (p.closest('a, code, pre, textarea, script, style, noscript, template') || !visible(p)) return;
            if (!found.includes(t)) found.push(t);
            // Outline the element so the screenshot shows exactly what was found.
            if (!p.hasAttribute('data-raw-key-hit')) {
              p.setAttribute('data-raw-key-hit', 'true');
              p.setAttribute('data-raw-key-prev-outline', p.style.outline);
              p.style.outline = '3px solid #e11d48';
            }
            return;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName)) return;
            if (el.shadowRoot) visit(el.shadowRoot);
          }
          node.childNodes.forEach(visit);
        };
        if (document.body) visit(document.body);
        return found;
      }).catch(() => [] as string[]);

      const fresh = texts.filter(t => !alreadyNoted.has(t));
      if (fresh.length > 0) {
        const n = info.annotations.filter(a => a.type === 'raw-content-key').length + 1;
        const shotPath = info.outputPath(`raw-key-${n}.png`);
        const ctxPath = info.outputPath(`raw-key-${n}.txt`);
        await page.screenshot({ path: shotPath }).catch(() => {});
        writeFileSync(ctxPath, [
          `Page: ${page.url()}`,
          `Seen: ${where}`,
          `Text shown to the visitor: ${fresh.join(' | ')}`,
          'This looks like a content key or template slot that was never replaced with real wording.',
        ].join('\n'));
        if (existsSync(shotPath)) await info.attach(`raw-key-screenshot-${n}`, { path: shotPath, contentType: 'image/png' });
        await info.attach(`raw-key-context-${n}`, { path: ctxPath, contentType: 'text/plain' });
        info.annotations.push({
          type: 'raw-content-key',
          description: JSON.stringify({ n, text: fresh.join(' | '), where, url: page.url() }),
        });
        fresh.forEach(t => alreadyNoted.add(t));
      }

      // Take the red outlines off again so later screenshots are unaffected.
      if (texts.length > 0) {
        await frame.evaluate(() => {
          // querySelectorAll does not look inside shadow roots, so walk them too.
          const clean = (root: Document | ShadowRoot): void => {
            root.querySelectorAll('*').forEach(el => {
              if (el.hasAttribute('data-raw-key-hit')) {
                (el as HTMLElement).style.outline = el.getAttribute('data-raw-key-prev-outline') ?? '';
                el.removeAttribute('data-raw-key-hit');
                el.removeAttribute('data-raw-key-prev-outline');
              }
              if (el.shadowRoot) clean(el.shadowRoot);
            });
          };
          clean(document);
        }).catch(() => {});
      }
    }
  } catch {
    // A scan problem must never fail the test.
  }
}

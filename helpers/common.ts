import { Page, expect, test } from '@playwright/test';

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
    // English (UK/ROW/IE/...), Spanish (ES), German (DE), and Swedish (SE)
    // confirmed live; add more locales here as they're confirmed rather than
    // guessing translations.
    const KNOWN_ACCEPT_TEXTS = [
      'allow all cookies', 'allow all',
      'permitir todas las cookies', 'permitir todas', 'aceptar todas',
      'alle cookies zulassen',
      'tillåt alla cookies',
    ];
    const target = allButtons.find(b => {
      const t = (b.textContent ?? '').trim().toLowerCase();
      return KNOWN_ACCEPT_TEXTS.includes(t);
    });
    if (target) { target.scrollIntoView({ behavior: 'instant', block: 'nearest' }); target.click(); return true; }
    return false;
  }).catch(() => false);
}

/**
 * After a successful login, every brand/GEO redirects to a "playsecure."
 * subdomain of its own root domain — e.g. www.slingo.com -> playsecure.slingo.com,
 * www.slingocasino.es -> playsecure.slingocasino.es. Deriving it from the
 * current project's baseURL means login.spec.ts doesn't need a hardcoded
 * domain per GEO.
 */
export function expectedPlaysecureUrlPattern(): RegExp {
  const hostname = new URL(getBaseUrl()).hostname.replace(/^www\./, '');
  return new RegExp(`playsecure\\.${hostname.replace(/\./g, '\\.')}`);
}

/**
 * Confirmed live: the site occasionally shows a generic "SOMETHING WENT
 * WRONG" error state (a transient rendering glitch, not a real bug) that
 * leaves the page unusable for the rest of that test. Throwing a clear,
 * specific error here — rather than letting the test grind on and fail
 * later on an unrelated timeout — makes the retry (see playwright.config.ts
 * retries) both faster and obvious in the report as "site glitched, retried"
 * rather than a confusing unrelated failure.
 */
export async function assertNoSiteError(page: Page): Promise<void> {
  const hasError = await page.getByText('SOMETHING WENT WRONG', { exact: false })
    .isVisible({ timeout: 500 }).catch(() => false);
  if (hasError) {
    throw new Error('Site showed "SOMETHING WENT WRONG" — transient glitch, will retry this test with a fresh page.');
  }
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
    return;
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

const SIDEBAR_SELECTOR = '[class*="MainMenu_main-menu"]';
const HAMBURGER_SELECTOR = '[class*="hamburger"]';

/**
 * Confirmed live: real visitors only ever reach the blog through the
 * sidebar's Blog link — there's no header/footer entry point exercised in
 * normal browsing. Blog specs must reach it the same way rather than
 * page.goto()-ing the blog path directly, or they're testing a page load
 * that doesn't reflect how the page is actually navigated to.
 */
export async function navigateToBlogViaSidebar(page: Page, blogPath: string): Promise<void> {
  await page.goto('');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1_000);
  await dismissCookieConsent(page);
  await page.waitForTimeout(2_000);
  await dismissCampaignPopup(page);

  // Hamburger toggle — React requires a JS click, same as sidebar-navigation.spec.ts.
  await page.evaluate((sel) => {
    (document.querySelector(sel) as HTMLElement | null)?.click();
  }, HAMBURGER_SELECTOR);
  await page.waitForTimeout(600);
  await dismissCampaignPopup(page);

  const blogLink = page.locator(`${SIDEBAR_SELECTOR} a[href*="${blogPath}"]`).first();
  await expect(blogLink).toBeVisible({ timeout: 10_000 });
  await blogLink.click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1_000);
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

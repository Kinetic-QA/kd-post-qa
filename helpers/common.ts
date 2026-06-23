import { Page, expect } from '@playwright/test';

export async function dismissCookieConsent(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.waitForTimeout(300);
  const clicked = await page.evaluate(() => {
    const allButtons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
    const consentEl = document.querySelector('son-cookie-consent');
    if (consentEl) {
      const sr = (consentEl as any).shadowRoot as ShadowRoot | null;
      if (sr) allButtons.push(...Array.from(sr.querySelectorAll('button')) as HTMLButtonElement[]);
    }
    const target = allButtons.find(b => {
      const t = (b.textContent ?? '').trim().toLowerCase();
      return t === 'allow all cookies' || t === 'allow all';
    });
    if (target) { target.scrollIntoView({ behavior: 'instant', block: 'nearest' }); target.click(); return true; }
    return false;
  }).catch(() => false);
  if (clicked) await page.waitForTimeout(700);
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
    function checkAndDismiss() {
      if (cooldown) return;
      const closeImg = document.querySelector('img[alt="close"]');
      if (closeImg && closeImg.closest('a[href*="#account"]')) {
        cooldown = true;
        (window as any).__pw_dismissCampaignPopup__().finally(() => {
          setTimeout(() => { cooldown = false; }, 2000);
        });
      }
    }
    const observer = new MutationObserver(checkAndDismiss);
    observer.observe(document.documentElement, { childList: true, subtree: true });
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
}

export async function goHome(page: Page): Promise<void> {
  await page.goto('/');
  await waitForPageReady(page);
  await dismissPopups(page);
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

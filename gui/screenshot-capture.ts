// Bare Playwright screenshot capture for the Visual Check tab — deliberately
// outside the test-runner/fixtures stack (no stealth, no cookie-consent
// dismissal, no brand-specific geo logic). A visual comparison against
// whatever a real visitor sees (cookie banner included) is fine for v1;
// stealth-mode capture can be added later the same way playwright.config.ts
// already gates it per-GEO (needsStealthLaunch) if a brand ever blocks a
// plain headless Chromium here.
import { chromium } from '@playwright/test';
import sharp from 'sharp';

export async function captureFullPageScreenshot(url: string): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1_500);
    return await page.screenshot({ fullPage: true, type: 'png' });
  } finally {
    await browser.close();
  }
}

// A single screenshot only catches whichever slide a rotating hero
// banner/carousel happens to be showing at that instant — confirmed live:
// a real promo banner reported as "not displayed" turned out to just be a
// different carousel slide at capture time, not actually missing. Loads the
// page once, then takes several screenshots spaced far enough apart for a
// typical auto-rotating carousel (commonly ~4-6s per slide) to cycle at
// least once, so Asset vs Site can check every frame before concluding
// something is absent instead of judging off a single lucky/unlucky moment.
export async function captureMultipleFrames(
  url: string,
  frameCount = 4,
  intervalMs = 3_000
): Promise<Buffer[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1_500);
    const frames: Buffer[] = [];
    for (let i = 0; i < frameCount; i++) {
      frames.push(await page.screenshot({ fullPage: true, type: 'png' }));
      if (i < frameCount - 1) await page.waitForTimeout(intervalMs);
    }
    return frames;
  } finally {
    await browser.close();
  }
}

// Crops a normalized (0-1) region out of a full-page screenshot so the UI
// can show a readable close-up of just the matched area instead of shrinking
// an entire tall page down to an unreadable sliver. Adds a little padding
// around the requested box for visual context, and returns null (rather
// than throwing) on any failure — callers fall back to showing the full
// frame, which is always a safe default.
export async function cropRegion(
  buffer: Buffer,
  box: { x: number; y: number; width: number; height: number }
): Promise<Buffer | null> {
  try {
    const image = sharp(buffer);
    const meta = await image.metadata();
    const imgW = meta.width ?? 0;
    const imgH = meta.height ?? 0;
    if (imgW < 2 || imgH < 2) return null;

    const padFrac = 0.04; // ~4% padding on each side, clamped to image bounds
    const rawLeft = (box.x - padFrac) * imgW;
    const rawTop = (box.y - padFrac) * imgH;
    const rawRight = (box.x + box.width + padFrac) * imgW;
    const rawBottom = (box.y + box.height + padFrac) * imgH;

    const left = Math.max(0, Math.floor(rawLeft));
    const top = Math.max(0, Math.floor(rawTop));
    const right = Math.min(imgW, Math.ceil(rawRight));
    const bottom = Math.min(imgH, Math.ceil(rawBottom));
    const width = right - left;
    const height = bottom - top;
    if (width < 2 || height < 2) return null;

    return await image.extract({ left, top, width, height }).png().toBuffer();
  } catch (err) {
    console.warn('      [WARN] Visual Check crop failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// Popup-visible selector confirmed live and already trusted by
// helpers/common.ts's dismissCampaignPopup() for the real Playwright test
// suite. Deliberately does NOT reuse that file's setupCampaignPopupWatcher —
// that helper auto-DISMISSES the popup the instant it's detected (built for
// tests that need it out of the way), the opposite of what Campaign
// Materials vs Site needs: catch it on-screen and screenshot it before it's
// gone.
const POPUP_VISIBLE_SELECTOR = '[class*="OfferPopup_close"], [class*="Popup_close"][class*="OfferPopup"]';

// Polls for a campaign pop-up to actually appear (not every site shows one
// immediately, or at all, on a plain page load) and screenshots the instant
// it does, rather than guessing a fixed wait. If it never appears within
// the timeout, returns popupDetected:false with whatever the page looked
// like at that point — the caller treats that as "no pop-up appeared"
// rather than spending a Claude call comparing an empty page against the
// pop-up asset.
export async function captureWithPopupWait(
  url: string,
  timeoutMs = 10_000
): Promise<{ buffer: Buffer; popupDetected: boolean }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const deadline = Date.now() + timeoutMs;
    let popupDetected = false;

    const checkVisible = () => page.locator(POPUP_VISIBLE_SELECTOR).first().isVisible().catch(() => false);

    if (await checkVisible()) {
      popupDetected = true;
    } else {
      // Some campaign pop-ups are scroll-triggered (appear once the visitor
      // scrolls partway down the page, or scrolls back up — a common
      // "exit intent" proxy) rather than firing immediately on load or on a
      // plain timer — confirmed live: a pure idle wait never caught one of
      // these. Scroll through the page in steps while polling, rather than
      // just sitting still and hoping a timer fires.
      const scrollHeight = await page.evaluate(() => document.body.scrollHeight).catch(() => 0);
      const steps = 6;
      for (let i = 1; i <= steps && Date.now() < deadline && !popupDetected; i++) {
        await page.evaluate(y => window.scrollTo(0, y), Math.round((scrollHeight * i) / steps)).catch(() => {});
        await page.waitForTimeout(500);
        if (await checkVisible()) popupDetected = true;
      }

      if (!popupDetected && Date.now() < deadline) {
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
        await page.waitForTimeout(500);
        if (await checkVisible()) popupDetected = true;
      }

      // Spend whatever's left of the time budget on plain idle polling, in
      // case it's a timer-based pop-up rather than a scroll-triggered one.
      while (!popupDetected && Date.now() < deadline) {
        await page.waitForTimeout(500);
        if (await checkVisible()) popupDetected = true;
      }
    }

    // Viewport-only, not fullPage: a pop-up is a fixed/overlay element that
    // renders within the current viewport regardless of scroll position, so
    // a full-page shot is unnecessary for it — and the scroll-to-trigger
    // steps above can lazy-load additional page content, occasionally
    // pushing a fullPage screenshot's height past Claude's 8000px per-
    // dimension limit (confirmed live: "image dimensions exceed max allowed
    // size: 8000 pixels").
    const buffer = await page.screenshot({ type: 'png' });
    return { buffer, popupDetected };
  } finally {
    await browser.close();
  }
}

// Extracts the page's actual rendered text (not a screenshot) — for
// comparing T&C copy, exact wording/values matter far more than they would
// for a visual layout check, and reading legal text off a vision-model
// screenshot is far less reliable than just pulling the real text out of
// the DOM. Capped to a generous length so the Claude call downstream doesn't
// balloon on an unrelated, unusually text-heavy page — but NOT so tight that
// a promotions page listing many games' T&Cs gets truncated before reaching
// the one campaign actually being checked. A prior, much smaller cap
// (20,000 chars) confirmed-live silently cut off the real matching block on
// longer pages, leaving the model nothing to compare against but a
// different, unrelated campaign's T&C — which it then wrongly reported
// values from.
export async function captureSiteText(url: string, maxLength = 60_000): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1_500);
    const text = await page.evaluate(() => document.body.innerText);
    return text.slice(0, maxLength);
  } finally {
    await browser.close();
  }
}

// Claude's vision input only accepts raster formats (PNG/JPEG/GIF/WEBP) — an
// uploaded SVG asset (common for banners/logos) needs converting first.
// Reuses the same headless Chromium already a dependency here rather than
// pulling in a dedicated SVG-rasterizing library: navigating straight to a
// data: URL renders the SVG exactly like an <img> would, then a plain
// screenshot captures the rendered raster.
export async function rasterizeSvgToPng(svgBuffer: Buffer): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const dataUrl = `data:image/svg+xml;base64,${svgBuffer.toString('base64')}`;
    await page.goto(dataUrl);
    await page.waitForTimeout(300);
    return await page.screenshot({ type: 'png' });
  } finally {
    await browser.close();
  }
}

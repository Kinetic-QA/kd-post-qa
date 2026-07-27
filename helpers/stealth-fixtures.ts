/**
 * stealth-fixtures.ts — drop-in replacement for `@playwright/test`'s
 * `test`/`expect` that launches via playwright-extra + puppeteer-extra-
 * plugin-stealth instead of Playwright's default Chromium launcher, but
 * ONLY for GEOs where helpers/geo-features.ts sets `needsStealthLaunch: true`
 * (confirmed live 2026-07-26/2026-07-27 on GC UK, and previously on MC UK —
 * both sit behind Cloudflare bot-detection that blocks/challenges a plain
 * automated browser; the stealth-patched launch clears it).
 *
 * Every other GEO's launch is completely unchanged — this only branches on
 * the flag, read straight from geo-features.ts, so onboarding a NEW GEO onto
 * the same fix is just setting that one flag, no further wiring needed.
 *
 * tests/p1|p2|p3 specs import `test`/`expect` from here instead of directly
 * from '@playwright/test'. Browser launch is a worker-scoped fixture in
 * Playwright's architecture — there is no config-only way to swap the
 * launcher, every spec file that wants the conditional launch must get its
 * `test` object from here.
 */
import { test as base, chromium as playwrightChromium } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { chromium as stealthChromium } from 'playwright-extra';
// @ts-ignore — no bundled types for this package
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getGeoFeatures } from './geo-features';

stealthChromium.use(StealthPlugin());

export const test = base.extend<{}, {}>({
  browser: [async ({}, use, workerInfo) => {
    const brand = process.env.TEST_BRAND ?? 'SC';
    // Mobile projects are named "<geo>-mobile" (see playwright.config.ts) —
    // strip the suffix so GEO resolution matches currentGeoFeatures()'s.
    const geo = workerInfo.project.name.replace(/-mobile$/, '');
    const stealth = getGeoFeatures(brand, geo).needsStealthLaunch === true;
    const headless = workerInfo.project.use.headless ?? false;

    const browser = stealth
      ? await stealthChromium.launch({
          headless,
          args: ['--disable-blink-features=AutomationControlled'],
        }) as unknown as Browser
      : await playwrightChromium.launch({ headless });

    await use(browser);
    await browser.close();
  }, { scope: 'worker' }],
});

export { expect } from '@playwright/test';

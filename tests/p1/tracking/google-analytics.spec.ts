import { test, expect } from '@playwright/test';
import { discoverPages } from '../../../helpers/tracking';

const tagId = process.env.QA_TAG_ID;
const qaBaseUrl = process.env.QA_QA_BASE_URL;

if (!tagId || !qaBaseUrl) {
  throw new Error(
    'Missing required env vars: QA_TAG_ID and QA_QA_BASE_URL must be set.\n' +
    'These are injected automatically by the agent — do not set them manually.'
  );
}

// Extract hostname from the full QA base URL (e.g. "https://qa-ab.spingenie.ca/" → "qa-ab.spingenie.ca")
const targetDomain = new URL(qaBaseUrl).hostname;

let discoveredUrls: string[] = [];

test.describe(`GA Tag — ${tagId} on ${targetDomain}`, () => {

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    discoveredUrls = await discoverPages(p, targetDomain);
    await ctx.close();
    test.info().annotations.push({
      type: 'crawl',
      description: `Discovered ${discoveredUrls.length} page(s) on ${targetDomain}`,
    });
  });

  test('GA tag verified on all discovered pages', async ({ page }, testInfo) => {
    for (const url of discoveredUrls) {
      await test.step(`Checking ${url}`, async () => {
        await page.goto(url);
        await page.waitForLoadState('domcontentloaded');

        // Check 1 — script tag present with correct tag ID
        const scriptLocator = page.locator('script[src*="googletagmanager.com/gtag/js"]');
        await expect.soft(scriptLocator, `GA script tag on ${url}`).toHaveAttribute('src', new RegExp(tagId!));

        // Check 2 — window.dataLayer is an Array
        const hasDataLayer = await page.evaluate(() => Array.isArray((window as any).dataLayer));
        expect.soft(hasDataLayer, `window.dataLayer initialized on ${url}`).toBe(true);

        // Check 3 — gtag is a function
        const hasGtag = await page.evaluate(() => typeof (window as any).gtag === 'function');
        expect.soft(hasGtag, `gtag() function defined on ${url}`).toBe(true);

        // Attach screenshot on any soft assertion failure
        const failed = testInfo.errors.length > 0;
        if (failed) {
          await testInfo.attach(`screenshot-${encodeURIComponent(url)}`, {
            body: await page.screenshot(),
            contentType: 'image/png',
          });
        }
      });
    }
  });

});

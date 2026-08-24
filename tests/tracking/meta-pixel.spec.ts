import { test, expect } from '@playwright/test';
import { discoverPages } from '../../helpers/tracking';

const pixelId = process.env.QA_TAG_ID;
const qaBaseUrl = process.env.QA_BASE_URL;

// QA_TAG_ID/QA_BASE_URL are only ever injected by the ticket-driven agent
// flow (src/agent.ts) — a standalone `npx playwright test` or the GUI's
// "All Tests" run has no ticket context to supply them. A module-level
// throw here used to crash the whole file (and any run that swept it in)
// instead of skipping cleanly, so this is now a real, gated test.skip
// instead — same pattern as the GEO-feature-gated specs use.
const targetDomain = qaBaseUrl ? new URL(qaBaseUrl).hostname : null;

let discoveredUrls: string[] = [];

test.describe(pixelId && targetDomain ? `Meta Pixel — ${pixelId} on ${targetDomain}` : 'Meta Pixel', () => {
  test.skip(
    !pixelId || !qaBaseUrl,
    'QA_TAG_ID/QA_BASE_URL not set — this spec only runs via the ticket-driven agent flow, not standalone.'
  );

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    discoveredUrls = await discoverPages(p, targetDomain!);
    await ctx.close();
    test.info().annotations.push({
      type: 'crawl',
      description: `Discovered ${discoveredUrls.length} page(s) on ${targetDomain}`,
    });
  });

  test('Meta Pixel verified on all discovered pages', async ({ page }, testInfo) => {
    for (const url of discoveredUrls) {
      await test.step(`Checking ${url}`, async () => {
        await page.goto(url);
        await page.waitForLoadState('domcontentloaded');

        // Check 1 — pixel base script is present
        const scriptLocator = page.locator('script[src*="connect.facebook.net"]');
        await expect.soft(scriptLocator, `Meta Pixel base script on ${url}`).toBeAttached();

        // Check 2 — fbq function is initialised
        const hasFbq = await page.evaluate(() => typeof (window as any).fbq === 'function');
        expect.soft(hasFbq, `fbq() function defined on ${url}`).toBe(true);

        // Check 3 — _fbq object present (set before fbq loads)
        const hasFbqInternal = await page.evaluate(() => (window as any)._fbq != null);
        expect.soft(hasFbqInternal, `window._fbq present on ${url}`).toBe(true);

        // Check 4 — pixel ID is initialised with the expected ID
        const pixelInitialised = await page.evaluate((id) => {
          const fbq = (window as any).fbq;
          if (typeof fbq !== 'function') return false;
          const queue: any[] = fbq.queue ?? [];
          return queue.some(
            (call: any[]) =>
              Array.isArray(call) &&
              call[0] === 'init' &&
              String(call[1]) === id
          );
        }, pixelId);
        expect.soft(pixelInitialised, `Pixel ID ${pixelId} initialised on ${url}`).toBe(true);

        // Attach screenshot on any soft assertion failure
        if (testInfo.errors.length > 0) {
          await testInfo.attach(`screenshot-${encodeURIComponent(url)}`, {
            body: await page.screenshot(),
            contentType: 'image/png',
          });
        }
      });
    }
  });

});

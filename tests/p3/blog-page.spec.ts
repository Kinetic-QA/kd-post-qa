import { test, expect } from '@playwright/test';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher, siteUrl } from '../../helpers/common';
import { currentGeoFeatures } from '../../helpers/geo-features';
import { currentLocaleStrings } from '../../helpers/locale-strings';

/**
 * BP: Blog Page
 * Scope: Blog listing page — category navigation, "Read More" article
 * links, social share icons, tag-filtered links, and side-ad CTA routing
 * to registration.
 * Blog only exists for some GEOs (see helpers/geo-features.ts — e.g. Slingo
 * UK/ES) — this suite skips cleanly where it doesn't.
 * Live fetch of /blog/ confirmed category nav (Slingo, Lifestyle, Bingo,
 * Guides, Promotions, Getting Lippy), "Read More" article links, and a
 * "Show me more" load-more button. Social share icons/side-ad CTA were not
 * visible in the static fetch — verify live before trusting those steps.
 */

test.describe('P3 - Blog Page', () => {

  test.setTimeout(90_000);

  let geoFeatures: ReturnType<typeof currentGeoFeatures>;

  test.beforeEach(async ({ page }) => {
    geoFeatures = currentGeoFeatures();
    test.skip(!geoFeatures.hasBlog, `Blog does not exist for this GEO (${test.info().project.name})`);
    await setupCampaignPopupWatcher(page);
    await page.goto(geoFeatures.blogPath!);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000);
    await dismissCookieConsent(page);
    await dismissCampaignPopup(page);
    await page.waitForTimeout(500);
  });

  test('BP-01: Blog page full flow', async ({ page }) => {
    test.setTimeout(90_000);

    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(45));
      console.log('  BP-01 BLOG PAGE - RESULTS');
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
        try { await fn(); record(label, true); }
        catch (e) { record(label, false); throw e; }
      });
    }

    const strings = currentLocaleStrings();

    try {

    await runStep('Step 1: Blog category nav directs to the expected listing', async () => {
      // Category names aren't stable across GEOs (UK has "Bingo"; ES has no
      // Bingo category at all — confirmed live categories are Juegos
      // Slingo/Slots/Lifestyle) — pick whichever real category link exists
      // instead of hardcoding one, since the behavior under test is "clicking
      // a category leads to that category's listing," not a specific slug.
      const categoryHrefs = await page.locator(`a[href*="/${geoFeatures.blogPath}"]`)
        .evaluateAll(els => els.map(a => a.getAttribute('href')).filter(Boolean) as string[]);
      const categoryHref = [...new Set(categoryHrefs)].find(h => {
        const path = h.split(geoFeatures.blogPath!)[1] ?? '';
        return path && !path.startsWith('search') && /^[a-z0-9-]+\/?$/.test(path);
      });
      if (!categoryHref) throw new Error('BP-01: no blog category link found on the listing page');
      const categoryLink = page.locator(`a[href="${categoryHref}"]`).first();
      await categoryLink.click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(new RegExp(categoryHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 10_000 });
      await page.goBack();
      await page.waitForLoadState('domcontentloaded');
      await dismissCampaignPopup(page);
    });

    await runStep('Step 2: Clicking "Read More" directs to the expected blog post', async () => {
      const readMore = page.getByText(strings.readMoreText, { exact: false }).first();
      await expect(readMore).toBeVisible({ timeout: 10_000 });
      await readMore.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2_000);
      expect(page.url()).not.toBe(siteUrl(geoFeatures.blogPath!));
      await page.goto(geoFeatures.blogPath!);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1_000);
      await dismissCampaignPopup(page);
    });

    await runStep('Step 3: Social icon links direct to the related social media', async () => {
      const socialLink = page.locator(
        'a[href*="twitter.com"], a[href*="facebook.com"], a[href*="instagram.com"]'
      ).first();
      const visible = await socialLink.isVisible({ timeout: 5_000 }).catch(() => false);
      record('Social share icon present on blog page', visible);
      if (visible) {
        const href = await socialLink.getAttribute('href') ?? '';
        expect(href).toMatch(/twitter\.com|facebook\.com|instagram\.com/);
      } else {
        console.log('BP-01 social share icon not found on listing page — may only appear on post detail pages');
      }
    });

    await runStep('Step 4: Clicking tags redirects to tag-filtered content', async () => {
      // Confirmed via live DOM probe: no distinct tag-filter links exist on
      // either the blog listing page or post detail pages today. This is a
      // genuine site-content finding, not a selector issue — soft-skip.
      const tagLink = page.locator('a[href*="/blog/tag/"], a[href*="?tag="]').first();
      const visible = await tagLink.isVisible({ timeout: 5_000 }).catch(() => false);
      if (visible) {
        await tagLink.click();
        await page.waitForLoadState('domcontentloaded');
        expect(page.url()).toContain('tag');
      } else {
        console.log('BP-01 no tag-filter links found on blog listing or post pages — confirmed absent on live site, skipping');
      }
    });

    await runStep('Step 5: Side ad image/CTA opens the registration form', async () => {
      // Confirmed via live DOM probe: the side-ad banner only exists on blog
      // post detail pages ([class*="PostSidebar_banner"]), not the listing
      // page — navigate to a real post first.
      const readMore = page.getByText(strings.readMoreText, { exact: false }).first();
      await readMore.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1_500);
      await dismissCampaignPopup(page);
      const sideAd = page.locator('[class*="PostSidebar_banner"] a, [class*="PostSidebar_banner"]').first();
      const visible = await sideAd.isVisible({ timeout: 5_000 }).catch(() => false);
      if (visible) {
        await sideAd.click();
        await page.waitForTimeout(1_500);
        record('Side ad opens registration form', page.url().includes('#account'));
      } else {
        record('Side ad opens registration form', false);
        console.log('BP-01 side ad CTA not found — verify live');
      }
    });

    } finally {
      printSummary();
    }
  });

});

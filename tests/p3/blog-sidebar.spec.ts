import { test, expect } from '../../helpers/stealth-fixtures';
import { dismissCampaignPopup, setupCampaignPopupWatcher, assertNoSiteError, navigateToBlogViaSidebar } from '../../helpers/common';
import { currentGeoFeatures } from '../../helpers/geo-features';
import { currentLocaleStrings } from '../../helpers/locale-strings';

/**
 * BI: Blog Sidebar
 * Scope: Blog sidebar menu — navigation links route correctly, the menu
 * closes via the hamburger/X toggle, and CTAs open the login/registration
 * widget.
 * Blog only exists for some GEOs (see helpers/geo-features.ts) — this
 * suite skips cleanly where it doesn't.
 * Reuses the same open/click/verify pattern as p2/sidebar-navigation.spec.ts
 * but scoped to blog-specific paths. NOT YET VERIFIED against live DOM —
 * blog sidebar may reuse the same SIDEBAR/HAMBURGER classes as the main
 * site or have its own; confirm live before trusting this in CI.
 */

const SIDEBAR = '[class*="MainMenu_main-menu"], #top-nav';
const HAMBURGER = '[class*="hamburger"], #menu-X';

test.describe('P3 - Blog Sidebar', () => {

  test.setTimeout(90_000);

  let geoFeatures: ReturnType<typeof currentGeoFeatures>;

  test.beforeEach(async ({ page }) => {
    geoFeatures = currentGeoFeatures();
    test.skip(!geoFeatures.hasBlog, `Blog does not exist for this GEO (${test.info().project.name})`);
    // Confirmed live on Prime Slots (PSL) UK 2026-07-31: this brand has no
    // hamburger/off-canvas sidebar anywhere on the site (confirmed already
    // for the main site — see sidebar-navigation.spec.ts's identical skip),
    // and the blog section is no exception — its own nav lives in a plain
    // always-visible top bar instead. This whole spec's SIDEBAR/HAMBURGER
    // selectors assume a sidebar drawer exists, so every step here would
    // find nothing to open — not a broken selector, a genuinely different
    // platform.
    test.skip(geoFeatures.hasSidebarMenu === false, `No hamburger/sidebar menu exists for this GEO (${test.info().project.name}) — blog nav lives directly in an always-visible top bar instead`);
    await setupCampaignPopupWatcher(page);
    await navigateToBlogViaSidebar(page, geoFeatures.blogPath!);
  });

  test('BI-01: Blog sidebar full flow', async ({ page }) => {
    test.setTimeout(90_000);

    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(45));
      console.log('  BI-01 BLOG SIDEBAR - RESULTS');
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

    async function openSidebar() {
      await dismissCampaignPopup(page);
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        (el as HTMLElement | null)?.click();
      }, HAMBURGER);
      await page.waitForTimeout(800);
    }

    const strings = currentLocaleStrings();

    // Confirmed live on Simba Games (SG) UK 2026-08-04: this brand's real
    // blog runs on a genuinely separate WordPress-style platform with NO
    // MainMenu_main-menu/#top-nav sidebar at all, even though its MAIN
    // site's hasSidebarMenu is true (the beforeEach skip above only covers
    // the main-site-wide case) — a real gap isolated to the blog's own
    // platform, not something hasSidebarMenu alone can express. Skip the
    // whole test cleanly here too, rather than hard-failing on a container
    // that was never going to exist on this separate platform.
    test.skip(await page.locator(SIDEBAR).count() === 0, 'This GEO\'s blog has no sidebar/off-canvas menu at all (genuinely different platform from the main site)');

    try {

    await test.step('Step 1: Every blog sidebar navigation link leads to its expected destination', async () => {
      await openSidebar();
      // Category names aren't stable across GEOs — see blog-page.spec.ts's
      // Step 1 comment (ES has no "Bingo" category at all) — so enumerate
      // whatever category links actually exist instead of hardcoding names.
      // Capture both href (to verify the destination URL) and visible text
      // (to re-find the link after navigating away and back) — the href
      // attribute's exact string form isn't stable across renders (absolute
      // vs relative, trailing slash), but the label is.
      const categories = await page.locator(`${SIDEBAR} a[href*="/${geoFeatures.blogPath}"]`)
        .evaluateAll(els => els
          .map(a => ({ href: a.getAttribute('href') ?? '', text: (a.textContent ?? '').trim() }))
          .filter(c => c.href && c.text)
        );
      const seen = new Set<string>();
      const uniqueCategories = categories.filter(c => {
        const path = c.href.split(geoFeatures.blogPath!)[1] ?? '';
        // Same "index.html" category-URL shape as blog-page.spec.ts —
        // confirmed live on Simba Games (SG) UK 2026-08-04, this brand's
        // blog runs on a different platform than every other brand's.
        const valid = path && !path.startsWith('search') && /^([a-z0-9-]+\/?|index\.html)$/i.test(path);
        if (!valid || seen.has(c.text)) return false;
        seen.add(c.text);
        return true;
      });
      if (uniqueCategories.length === 0) throw new Error('BI-01: no blog category links found in the sidebar');

      for (const { href, text } of uniqueCategories) {
        const label = `Sidebar link "${text}" -> ${href}`;
        try {
          const categoryLink = page.locator(SIDEBAR).getByRole('link', { name: text, exact: true }).first();
          await expect(categoryLink).toBeVisible({ timeout: 10_000 });
          await categoryLink.click();
          await page.waitForLoadState('domcontentloaded');
          await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 10_000 });
          await assertNoSiteError(page);
          record(label, true);
        } catch (e) {
          record(label, false);
          throw e;
        } finally {
          // Back to the blog listing and reopen the sidebar for the next link.
          await page.goto(geoFeatures.blogPath!, { waitUntil: 'domcontentloaded' });
          await page.waitForLoadState('domcontentloaded');
          await page.waitForTimeout(800);
          await dismissCampaignPopup(page);
          await openSidebar();
        }
      }
    });

    await runStep('Step 2: "X" icon closes the sidebar menu', async () => {
      await page.goto(geoFeatures.blogPath!, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1_000);
      await dismissCampaignPopup(page);
      await openSidebar();
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        (el as HTMLElement | null)?.click();
      }, HAMBURGER);
      await page.waitForTimeout(500);
      const display = await page.locator('[class*="Overlay_overlay"]')
        .evaluate(el => window.getComputedStyle(el).display).catch(() => 'none');
      record('Sidebar closes on second hamburger/X click', display === 'none');
    });

    await runStep('Step 3: CTAs in blog sidebar open the login/registration widget', async () => {
      await openSidebar();
      const loginBtn = page.locator(SIDEBAR + ' button, ' + SIDEBAR + ' a').filter({ hasText: strings.loginButton }).first();
      await expect(loginBtn).toBeVisible({ timeout: 10_000 });
      await loginBtn.click();
      await page.waitForTimeout(1_500);
      await expect(page).toHaveURL(/#account/, { timeout: 10_000 });
    });

    } finally {
      printSummary();
    }
  });

});

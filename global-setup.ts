import * as fs from 'fs';
import * as path from 'path';
import { chromium, type Browser, type FullConfig } from '@playwright/test';
import { assertNoSiteError } from './helpers/common';
import { detectRealCountry, writeDetectedGeo } from './helpers/ip-detect';

/**
 * Pre-flight check, run once before any spec starts. Visits each unique
 * baseURL in this invocation's projects and reuses assertNoSiteError's
 * poll-then-reload logic (same one every spec already calls mid-test) to
 * tell a real, persistent "SOMETHING WENT WRONG" / unreachable site apart
 * from a one-off transient glitch.
 *
 * Added 2026-08-07: confirmed live that when the ES site was fully down,
 * every single spec ran to its own timeout/failure independently — burning
 * ~30+ minutes to learn the same fact 30+ times, with no way to tell from
 * the results alone whether it was one broken page or the whole site. This
 * check answers that question upfront: if the homepage itself won't load,
 * abort the whole run immediately (globalSetup throwing is fatal to the
 * run) instead of letting it grind through specs that can't possibly pass.
 *
 * Deliberately narrow in scope — this does NOT change the standing "don't
 * cut a run on error, record and continue" rule for mid-run failures. A
 * single spec hitting a real, isolated bug after this check passes still
 * runs to completion and gets recorded normally; this only guards against
 * the specific case where the entire site is down before testing starts.
 */
async function checkSiteIsUp(browser: Browser, url: string): Promise<void> {
  const page = await browser.newPage();
  try {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    } catch (err) {
      throw new Error(
        `[Pre-flight] "${url}" did not load at all (${(err as Error).message}). ` +
        `Aborting the run before any specs execute — check the site/VPN before retrying.`
      );
    }
    try {
      await assertNoSiteError(page);
    } catch {
      throw new Error(
        `[Pre-flight] "${url}" showed "SOMETHING WENT WRONG" on first visit and it persisted ` +
        `through polling and a reload — this looks like the whole site is down, not one page. ` +
        `Aborting the run before any specs execute.`
      );
    }
  } finally {
    await page.close();
  }
}

async function globalSetup(config: FullConfig) {
  const resultsPath = path.join(__dirname, 'test-results', 'results.json');
  if (fs.existsSync(resultsPath)) {
    fs.unlinkSync(resultsPath);
    console.log('[Setup] Cleared previous results.json');
  }

  const baseURLs = [...new Set(
    config.projects.map(p => p.use?.baseURL).filter((u): u is string => Boolean(u))
  )];

  const browser = await chromium.launch();
  try {
    for (const url of baseURLs) {
      console.log(`[Pre-flight] Checking ${url} is up...`);
      await checkSiteIsUp(browser, url);
      console.log(`[Pre-flight] ${url} OK.`);
    }

    const geo = await detectRealCountry(browser);
    if (geo) {
      writeDetectedGeo(geo);
      console.log(`[Pre-flight] Detected real IP country: ${geo.countryCode} (${geo.city ?? '?'}, ${geo.region ?? '?'}) — auto-detect-from-IP registration branches will use this.`);
    } else {
      console.log('[Pre-flight] Could not detect real IP country (network issue reaching ipinfo.io) — auto-detect-from-IP registration branches will fall back to their hardcoded default.');
    }
  } finally {
    await browser.close();
  }
}

export default globalSetup;

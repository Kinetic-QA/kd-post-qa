/**
 * Strapi "Insert Template" scanner
 * ─────────────────────────────────
 * Usage:
 *   npx ts-node src/strapi-template-scan.ts GC
 *
 * Logs into a brand's Strapi admin panel, opens a Promotions entry, opens the
 * Content field's "Insert Template" menu, and extracts the listed template
 * names — for diffing against a Jira spec (e.g. GSP-2).
 *
 * Caches the logged-in session to .strapi-sessions/<BRAND>.json (gitignored)
 * so repeated runs don't re-hit the admin login endpoint and trip its rate
 * limiter. Delete that file to force a fresh login.
 *
 * Exploratory build: screenshots are saved at each stage to the path printed
 * on stdout so selectors can be verified/adjusted against the real UI.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { STRAPI_BRANDS, StrapiBrand } from './strapi-client';

const SCREENSHOT_DIR = process.env.STRAPI_SCAN_SCREENSHOT_DIR
  || path.join(process.cwd(), 'test-results', 'strapi-scan');
const SESSION_DIR = path.join(process.cwd(), '.strapi-sessions');

async function main() {
  const brandArg = process.argv[2]?.toUpperCase();
  if (!brandArg || !STRAPI_BRANDS.includes(brandArg as StrapiBrand)) {
    console.error(`Usage: npx ts-node src/strapi-template-scan.ts <BRAND>`);
    console.error(`Supported brands: ${STRAPI_BRANDS.join(', ')}`);
    process.exit(1);
  }
  const brand = brandArg as StrapiBrand;
  const prefix = `STRAPI_${brand}`;
  const baseUrl = process.env[`${prefix}_BASE_URL`];
  const username = process.env[`${prefix}_USERNAME`];
  const password = process.env[`${prefix}_PASSWORD`];

  if (!baseUrl || !username || !password) {
    console.error(`Missing ${prefix}_BASE_URL / _USERNAME / _PASSWORD in .env`);
    process.exit(1);
  }

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  const sessionFile = path.join(SESSION_DIR, `${brand}.json`);

  let shotIndex = 0;
  const shot = async (page: import('@playwright/test').Page, label: string) => {
    shotIndex += 1;
    const file = path.join(SCREENSHOT_DIR, `${String(shotIndex).padStart(2, '0')}-${label}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`  [screenshot] ${file}`);
    return file;
  };

  const browser = await chromium.launch({ headless: true });
  const hasSession = fs.existsSync(sessionFile);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: hasSession ? sessionFile : undefined,
  });
  const page = await context.newPage();

  try {
    console.log(`\n[1] Opening ${baseUrl}/admin ${hasSession ? '(reusing cached session)' : '(fresh login required)'}...`);
    await page.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2_000);

    const onLoginPage = await page.getByLabel('Email*').isVisible({ timeout: 3_000 }).catch(() => false);

    if (onLoginPage) {
      console.log('  Session missing/expired — logging in...');
      await shot(page, 'login-page');
      await page.getByLabel('Email*').fill(username);
      await page.getByLabel('Password*').fill(password);
      await page.getByRole('button', { name: 'Login' }).click();
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(2_000);

      const rateLimited = await page.getByText('Too many requests').isVisible({ timeout: 1_000 }).catch(() => false);
      if (rateLimited) {
        throw new Error('Rate limited by Strapi admin login — wait before retrying');
      }

      await shot(page, 'after-login');
      await context.storageState({ path: sessionFile });
      console.log(`  Session cached to ${sessionFile}`);
    } else {
      console.log('  Already logged in.');
      await shot(page, 'dashboard');
    }

    console.log('[2] Navigating to Promotions collection via sidebar...');
    await page.getByRole('link', { name: 'Content Manager' }).click();
    await page.waitForTimeout(1_000);
    await page.getByRole('link', { name: 'Promotions', exact: true }).click();
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2_000);
    await shot(page, 'promotions-list');

    console.log('[3] Opening a test entry...');
    await page.getByRole('row', { name: /Test 0/ }).click();
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2_000);
    await shot(page, 'entry-open');

    console.log('[4] Scrolling down to find the Content field...');
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(1_000);
    await shot(page, 'entry-scrolled');

    console.log('[5] Opening the TinyMCE "Insert" menu...');
    await page.getByText('Insert', { exact: true }).first().click();
    await page.waitForTimeout(1_000);
    await shot(page, 'insert-menu-open');

    console.log('[6] Clicking "Insert template..."...');
    await page.getByText('Insert template...', { exact: true }).click();
    await page.waitForTimeout(1_000);
    await shot(page, 'template-dialog');

    console.log('[7] Extracting template list from the dropdown...');
    const templates = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      const target = selects.find(s =>
        Array.from(s.options).some(o => o.textContent?.includes('FAQ placeholder'))
      );
      if (!target) return null;
      return Array.from(target.options).map(o => o.textContent?.trim());
    });

    if (!templates) {
      console.error('[FAIL] Could not find the templates <select> element.');
    } else {
      console.log(`\nFound ${templates.length} templates in CMS:\n`);
      templates.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
    }

    console.log('\n[DONE] Stopping here for inspection.');
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch(e => {
  console.error('[FAIL]', e instanceof Error ? e.message : e);
  process.exit(1);
});

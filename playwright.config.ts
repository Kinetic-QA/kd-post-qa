import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import { getLiveUrl, getQAUrl } from './helpers/brand-urls';

// Loads .env (gitignored) so credentials/config set there — e.g.
// TEST_CREDENTIALS_<GEO>_USERNAME/PASSWORD in helpers/test-credentials.ts —
// are available both here at config-load time and in every test.
dotenv.config();

// TEST_BRAND / TEST_GEO select which brand+market the suite runs against;
// TEST_ENV picks live vs QA. Defaults match the previous hardcoded baseURL
// (Slingo UK, live) so `npx playwright test` with no env vars is unchanged.
const TEST_BRAND = process.env.TEST_BRAND ?? 'SC';
const TEST_GEO = process.env.TEST_GEO ?? 'UK';
const TEST_ENV = process.env.TEST_ENV ?? 'live';

// TEST_GEOS (comma-separated, e.g. "UK,IE") switches the run into multi-geo
// mode: one Playwright project per GEO, all sharing a single process/reporter
// so excel-reporter.cjs can emit one workbook with one tab per GEO. Without
// it, behaviour is unchanged — a single "chromium" project driven by
// TEST_BRAND/TEST_GEO, which is what agent.ts's per-ticket runs rely on.
const TEST_GEOS = process.env.TEST_GEOS
  ?.split(',')
  .map(g => g.trim())
  .filter(Boolean);

function resolveUrl(brand: string, geo: string): string {
  const url = TEST_ENV === 'qa' ? getQAUrl(brand, geo) : getLiveUrl(brand, geo);
  if (!url) {
    throw new Error(
      `No ${TEST_ENV} URL found for brand "${brand}" GEO "${geo}". ` +
      `Check helpers/brand-urls.ts, or that this market has gone live if TEST_ENV=live.`
    );
  }
  return url;
}

const projects = TEST_GEOS && TEST_GEOS.length > 0
  ? TEST_GEOS.map(geo => ({
      name: geo,
      use: { ...devices['Desktop Chrome'], baseURL: resolveUrl(TEST_BRAND, geo) },
    }))
  : [{
      // Named after the GEO (not "chromium") so helpers/geo-features.ts can
      // resolve the active GEO from test.info().project.name in both modes.
      name: TEST_GEO,
      use: { ...devices['Desktop Chrome'], baseURL: resolveUrl(TEST_BRAND, TEST_GEO) },
    }];

export default defineConfig({
  globalSetup: './global-setup',
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  // Confirmed live: the site occasionally shows a transient "SOMETHING WENT
  // WRONG" glitch mid-test (see helpers/common.ts assertNoSiteError) — one
  // retry gives that test a completely fresh page and another attempt
  // without affecting any other spec in the suite.
  retries: 1,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'on-failure' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
    ['./excel-reporter.cjs'],
  ],

  use: {
    headless: false,
    viewport: { width: 1280, height: 720 },
    screenshot: 'on',
    video: 'on',
    trace: 'on',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects,

  outputDir: 'test-results/',
});

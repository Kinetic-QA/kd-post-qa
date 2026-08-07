import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import { getLiveUrl, getQAUrl } from './helpers/brand-urls';

// Playwright's own HTML reporter checks process.env.CLAUDECODE and, if set,
// silently skips starting the report server at all (not just the browser
// popup) — confirmed live 2026-08-06: a real test run inside a VS Code
// terminal (which inherits CLAUDECODE from the Claude Code extension being
// active in that window, even for a terminal the user opened manually, not
// one Claude Code itself spawned) produced a built report with nothing
// serving it, hence ERR_CONNECTION_REFUSED on the auto-opened tab. Deleting
// it here (before Playwright's own runner reads it) only affects this one
// child process's env, not VS Code's — so `open: 'always'` actually opens
// the browser regardless of which terminal a real interactive run happens
// in. Automated/non-interactive invocations (agent.ts's spawned runs, CI)
// are unaffected either way since they lack a TTY, which the same check
// also requires.
delete process.env.CLAUDECODE;
delete process.env.COPILOT_CLI;
// require(), not import — TS's module resolution doesn't match an explicit
// .cjs extension against a .d.ts declaration file of the same base name.
const { portForKey } = require('./helpers/report-port.cjs') as { portForKey: (key: string) => number };

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

// TEST_MOBILE=true adds a single "<geo>-mobile" project (Pixel 5 / Chrome,
// same engine as the desktop projects to keep selector behaviour
// comparable) alongside the desktop one(s). Opt-in only — default runs are
// desktop-only and unaffected.
const TEST_MOBILE = process.env.TEST_MOBILE === 'true';

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

// One GEO per entry in TEST_GEOS (multi-GEO mode) or just TEST_GEO otherwise.
const geosToRun = TEST_GEOS && TEST_GEOS.length > 0 ? TEST_GEOS : [TEST_GEO];

// All generated output lives under Test Reports/<BRAND>/<GEO>/ (see
// helpers/brand-urls.ts for the brand -> GEO folders already scaffolded
// there) instead of a shared top-level test-results/ that Playwright clears
// at the start of every invocation — that used to silently destroy the
// previous GEO's traces when GEOs are run one at a time as separate
// `npx playwright test` calls, the pattern forced by real VPN switching
// between GEOs (see feedback_multi_geo_vpn_switch). Each project below gets
// its own outputDir pointing at its own GEO's folder, so even a single
// combined TEST_GEOS="UK,ES" run correctly splits traces/videos/screenshots
// by GEO rather than lumping them together.
// Every run additionally nests under today's date (YYYY-MM-DD) so repeated
// runs for the same brand+GEO don't scatter loose report-<port>/test-results/
// *.xlsx siblings directly inside the GEO folder — same-day reruns share
// that date folder (latest overwrites, same as before), different days get
// their own.
const dateStr = new Date().toISOString().slice(0, 10);
const reportRoot = geosToRun.length === 1
  ? `Test Reports/${TEST_BRAND}/${geosToRun[0]}/${dateStr}`
  : `Test Reports/${TEST_BRAND}/_combined-${geosToRun.join('-')}/${dateStr}`;
const outputDir = `${reportRoot}/test-results`;

// Deterministic port per brand+GEO(s)+date combo (same key every time ->
// same port every time), baked into both the HTML reporter's own port
// option and the report folder's name — so `Test Reports/SC/UK/2026-08-06/
// report-9518` tells you exactly which URL to open it on, without needing
// to check logs or ask what port a previous run used. Date is part of the
// key (not just the folder path) so two different days' reports for the
// same brand+GEO get distinct ports and can be open in the browser at the
// same time without one colliding on the other's port. Range 9323-9522 (200
// slots) keeps it clear of Playwright's own 9323 default while making
// collisions across brand/GEO/date combos unlikely.
const reportKey = `${TEST_BRAND}-${geosToRun.join('-')}-${dateStr}`;
const reportPort = portForKey(reportKey);

// Blob reports feed Playwright's own `merge-reports` command (see
// merge-reports.cjs) so a VPN-switch run — one `npx playwright test`
// invocation per GEO, since only one GEO's VPN/IP can be active at a time —
// can still produce a single Playwright-native HTML report with one real
// combined duration across every GEO, instead of each invocation only ever
// showing its own GEO's duration.
//
// BUG FIXED 2026-08-07: this used to point every invocation at the SAME
// shared `_blob-reports/<date>/` folder. Playwright's blob reporter clears
// its entire output folder at the start of every run (same wipe behaviour
// as outputDir/test-results) — confirmed live when a UK run followed by an
// ES run left only ES's zip behind, silently destroying UK's blob before
// merge-reports.cjs ever got to read it back. Each invocation now gets its
// own subfolder keyed by its own GEO(s), so starting the next GEO's run
// only wipes that GEO's (empty, first-time) subfolder and can never touch
// a previous GEO's already-written zip. merge-reports.cjs was updated to
// search recursively for zips under the date folder to match.
const blobDir = `Test Reports/${TEST_BRAND}/_blob-reports/${dateStr}/${geosToRun.join('-')}${TEST_MOBILE ? '-mobile' : ''}`;
const blobFileName = `${geosToRun.join('-')}${TEST_MOBILE ? '-mobile' : ''}.zip`;

// Each GEO contributes a desktop project and, when TEST_MOBILE is set, its
// own "<geo>-mobile" project immediately after it — interleaved (UK,
// UK-mobile, ES, ES-mobile, ...) rather than all desktop projects followed
// by all mobile ones, so excel-reporter.cjs's tabs land in that same order.
// BUG FIXED 2026-07-13: previously the TEST_MOBILE block only ever pushed a
// single `${TEST_GEO}-mobile` project (the scalar env var, not the
// TEST_GEOS list), so a multi-GEO + TEST_MOBILE run silently produced only
// one mobile project total instead of one per GEO.
const projects = geosToRun.flatMap(geo => {
  // Own outputDir per GEO (not just per invocation) — this is what makes a
  // combined TEST_GEOS="UK,ES" run still save UK's traces/videos under
  // Test Reports/<BRAND>/UK/ and ES's under Test Reports/<BRAND>/ES/,
  // matching each GEO's own pre-scaffolded folder regardless of how many
  // GEOs run together. Mobile shares the same folder as its desktop
  // sibling — the project name ("<geo>-mobile") already keeps each test's
  // own subfolder distinct.
  const geoOutputDir = `Test Reports/${TEST_BRAND}/${geo}/${dateStr}/test-results`;
  const geoProjects = [{
    // Named after the GEO (not "chromium") so helpers/geo-features.ts can
    // resolve the active GEO from test.info().project.name in both modes.
    name: geo,
    outputDir: geoOutputDir,
    use: { ...devices['Desktop Chrome'], baseURL: resolveUrl(TEST_BRAND, geo) },
  }];
  if (TEST_MOBILE) {
    geoProjects.push({
      name: `${geo}-mobile`,
      outputDir: geoOutputDir,
      use: { ...devices['Pixel 5'], baseURL: resolveUrl(TEST_BRAND, geo) },
      // Playwright's mobile emulation (isMobile/hasTouch/deviceScaleFactor)
      // relies on a CDP device-metrics override that's incompatible with
      // resizing the actual OS browser window to match (viewport: null
      // errors on all three) — confirmed live, not fixable via config. The
      // headed window will show gray space around the emulated content;
      // that's cosmetic only and doesn't affect selectors or test results.
    });
  }
  return geoProjects;
});

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
    // open: 'never' — excel-reporter.cjs opens the report's index.html
    // directly instead (confirmed live: it's fully self-contained, works
    // with no server at all), which is reliable regardless of CLAUDECODE/
    // TTY state. Leaving this on 'always' too would double-open a second,
    // server-based tab whenever a real TTY run doesn't hit those checks.
    ['html', { outputFolder: `${reportRoot}/report-${reportPort}`, open: 'never', port: reportPort }],
    ['json', { outputFile: `${outputDir}/results.json` }],
    ['list'],
    ['./excel-reporter.cjs'],
    // Additive alongside the reporters above — see blobDir/blobFileName
    // comment. Consumed by `npm run merge-reports`, not opened directly.
    ['blob', { outputDir: blobDir, fileName: blobFileName }],
  ],

  use: {
    headless: false,
    viewport: { width: 1280, height: 720 },
    // Pins the headed Chromium window to DISPLAY3, the right monitor
    // (bounds: 1920,11 - 1920x1080). Without this, Chromium's default
    // window placement sometimes lands on one of the other two monitors.
    launchOptions: {
      args: ['--window-position=2020,111'],
    },
    screenshot: 'on',
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    trace: 'on',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  projects,

  outputDir,
});

// Scans Test Reports/<brand>/<geo>/<date>/*.xlsx and combined-reports/<BRAND>-<date>.xlsx
// (same fixed-row layout excel-reporter.cjs writes, same walk gui/server.ts's
// scanRunReports()/scanCombinedReports() do for the live GUI dashboard) and
// bakes the result into dashboard/public/data.json — a static snapshot the
// deployed Netlify site reads instead of hitting a live server, since a
// static site has no access to this machine's local Test Reports/ folder.
//
// Usage: node dashboard/build-data.cjs
//   PINNED_RUN_FILE=SC-2026-09-29-14-53-00 node dashboard/build-data.cjs
// PINNED_RUN_FILE (set by the GUI's "Upload to Netlify") makes that one combined
// workbook the ONLY source for its brand+date, so a later, different run of the
// same day on disk can't replace the run that was just reviewed.
// Re-run before every deploy-dashboard.cjs to refresh the snapshot.

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const ROOT = path.join(__dirname, '..');

function normalizeStatus(raw) {
  const upper = String(raw || '').toUpperCase();
  if (upper === 'PASSED') return 'passed';
  if (upper === 'FLAKY') return 'flaky';
  if (upper === 'SKIPPED') return 'skipped';
  return 'failed';
}

function humanizeSpecName(base) {
  return base.replace(/\.spec\.ts$/, '').replace(/-/g, ' ');
}

// Recovers which run this xlsx belongs to — mirrors gui/server.ts's
// parseXlsxRunInfo(). New files are named
// "<base>_<local-timestamp-with-dashes>_<port>.xlsx" (excel-reporter.cjs) —
// no trailing Z: the digits are this machine's own local wall clock, not
// UTC (see helpers/run-token.cjs), so re-parsing without a timezone
// designator lands back on that same local instant. Older files (written
// before that suffix existed) fall back to the file's own mtime so every
// run still gets a distinguishable runTime to group/sort same-day reruns by.
function parseXlsxRunInfo(filePath, fileName) {
  const m = fileName.match(/_(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})(?:_(\d+))?\.xlsx$/);
  if (m) {
    const [, datePart, hh, mm, ss, ms] = m;
    return { runTime: `${datePart}T${hh}:${mm}:${ss}.${ms}` };
  }
  return { runTime: fs.statSync(filePath).mtime.toISOString() };
}

// Detail table starts at row 12 (Test File/Test Name/Status in cols 1-3) —
// see excel-reporter.cjs's _writeSheet: summary block is 9 rows, header at
// summary.length + 2 = row 11.
function extractTestRows(sheet) {
  const rows = [];
  for (let row = 12; ; row++) {
    const fileCell = sheet.getRow(row).getCell(1).value;
    if (!fileCell) break;
    const file = String(fileCell);
    const base = file.split('/').pop() || file;
    const statusCell = sheet.getRow(row).getCell(3).value;
    rows.push({
      spec: humanizeSpecName(base),
      testName: String(sheet.getRow(row).getCell(2).value || ''),
      status: normalizeStatus(statusCell),
    });
  }
  return rows;
}

// deploy-dashboard.cjs stages each brand/date/geo's Playwright HTML report
// into dashboard/public/reports/<brand>/<date>/<geo>/index.html and deploys
// it alongside this same data.json, so a drilldown row can link straight to
// it with a site-relative URL.
function reportUrlFor(brand, date, geo) {
  return `/reports/${brand}/${date}/${geo}/index.html`;
}

const PINNED_RUN_FILE = process.env.PINNED_RUN_FILE || null;
const PINNED_MATCH = PINNED_RUN_FILE ? PINNED_RUN_FILE.match(/^([A-Za-z0-9]+)-(\d{4}-\d{2}-\d{2})-\d{2}-\d{2}-\d{2}$/) : null;
if (PINNED_RUN_FILE && !PINNED_MATCH) {
  console.error(`PINNED_RUN_FILE "${PINNED_RUN_FILE}" is not a <BRAND>-<date>-<HH-MM-SS> workbook name.`);
  process.exit(1);
}
// True for any run of the pinned brand+date other than the pinned workbook itself.
const isOtherRunOfPinnedDay = (brand, date, file) =>
  Boolean(PINNED_MATCH) && brand === PINNED_MATCH[1] && date === PINNED_MATCH[2] && file !== `${PINNED_RUN_FILE}.xlsx`;

async function scanRunReports() {
  const rootDir = path.join(ROOT, 'Test Reports');
  const reports = [];
  const tests = [];

  // Scan combined-reports/ FIRST so its (brand, geo, date) combos are known
  // before the loose per-GEO xlsx walk below — a brand/GEO/date run into
  // combined-reports/<BRAND>-<date>.xlsx (the normal multi-GEO flow) also
  // leaves its own loose Test Reports/<brand>/<geo>/<date>/*.xlsx behind,
  // and counting both double-counted that GEO's totals (confirmed live:
  // SC ES 2026-09-09 appeared twice — once from its own es_*.xlsx, once
  // from the combined workbook's ES sheet). The combined workbook is
  // treated as canonical since that's the one deploy-dashboard.cjs's
  // Excel-link backfill actually points at.
  const combined = await scanCombinedReports();
  const combinedKeys = new Set(combined.reports.map(r => `${r.brand}|${r.geo}|${r.date}`));

  if (!fs.existsSync(rootDir)) {
    return { reports: combined.reports, tests: combined.tests };
  }

  for (const brand of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!brand.isDirectory()) continue;
    const brandDir = path.join(rootDir, brand.name);

    for (const geo of fs.readdirSync(brandDir, { withFileTypes: true })) {
      if (!geo.isDirectory() || geo.name.startsWith('_')) continue;
      const geoDir = path.join(brandDir, geo.name);

      for (const dateEntry of fs.readdirSync(geoDir, { withFileTypes: true })) {
        if (!dateEntry.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(dateEntry.name)) continue;
        if (combinedKeys.has(`${brand.name}|${geo.name}|${dateEntry.name}`)) continue;
        // Loose per-GEO workbooks have no run token to match against the pin, so
        // for the pinned brand+date only the pinned combined workbook counts.
        if (PINNED_MATCH && brand.name === PINNED_MATCH[1] && dateEntry.name === PINNED_MATCH[2]) continue;
        const dateDir = path.join(geoDir, dateEntry.name);

        const xlsxFiles = fs.readdirSync(dateDir).filter(f => f.endsWith('.xlsx'));

        for (const file of xlsxFiles) {
          try {
            const filePath = path.join(dateDir, file);
            const { runTime } = parseXlsxRunInfo(filePath, file);
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.readFile(filePath);

            let total = 0, passed = 0, failed = 0, skipped = 0, flaky = 0;
            const specSet = new Set();
            wb.eachSheet(sheet => {
              if (sheet.name === 'Summary') return;
              total += Number(sheet.getRow(2).getCell(2).value) || 0;
              passed += Number(sheet.getRow(3).getCell(2).value) || 0;
              failed += Number(sheet.getRow(4).getCell(2).value) || 0;
              skipped += Number(sheet.getRow(5).getCell(2).value) || 0;
              flaky += Number(sheet.getRow(9).getCell(2).value) || 0;

              for (const row of extractTestRows(sheet)) {
                specSet.add(row.spec);
                tests.push({
                  date: dateEntry.name,
                  brand: brand.name,
                  geo: geo.name,
                  spec: row.spec,
                  testName: row.testName,
                  status: row.status,
                  reportUrl: reportUrlFor(brand.name, dateEntry.name, geo.name),
                  runTime,
                });
              }
            });

            reports.push({
              brand: brand.name,
              geo: geo.name,
              date: dateEntry.name,
              runTime,
              total, passed, failed, skipped, flaky,
              specs: [...specSet].sort((a, b) => a.localeCompare(b)),
              reportUrl: reportUrlFor(brand.name, dateEntry.name, geo.name),
            });
          } catch {
            // Skip a corrupt/partially-written workbook rather than failing
            // the whole build over one bad file.
          }
        }
      }
    }
  }

  reports.push(...combined.reports);
  tests.push(...combined.tests);

  return keepFullRunPerGeoDay(reports, tests);
}

// Several runs of the same brand+GEO on the same day (e.g. a one-spec re-run
// after the full run) were all being added together, inflating the totals and
// the pass rate (confirmed live: SNG AB 2026-09-28 = full 54-test run + a
// 1-test "feedback form" re-run, shown as 55). Only the fullest run of each
// brand+GEO+day counts — most tests executed, newest wins a tie — and its
// tests are kept with it; the smaller re-runs are dropped from the snapshot.
function keepFullRunPerGeoDay(reports, tests) {
  const keyOf = r => `${r.brand}|${r.geo}|${r.date}`;
  const winners = new Map();
  for (const r of reports) {
    const cur = winners.get(keyOf(r));
    if (!cur || r.total > cur.total || (r.total === cur.total && r.runTime > cur.runTime)) winners.set(keyOf(r), r);
  }
  const keptReports = reports.filter(r => winners.get(keyOf(r)) === r);
  const keptTests = tests
    .filter(t => winners.get(keyOf(t)).runTime === t.runTime)
    .map(({ runTime, ...rest }) => rest);
  return {
    reports: keptReports.sort((a, b) => b.date.localeCompare(a.date)),
    tests: keptTests.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

async function scanCombinedReports() {
  const combinedDir = path.join(ROOT, 'combined-reports');
  const reports = [];
  const tests = [];
  if (!fs.existsSync(combinedDir)) return { reports, tests };

  for (const file of fs.readdirSync(combinedDir)) {
    // The trailing -<HH-mm-ss> run token (added when the GUI's /run creates
    // the session — see gui/server.ts's excelReportFile) tells us exactly
    // which session this workbook belongs to; older files written before
    // that token existed still match via the optional group and fall back
    // to file mtime below. No trailing Z: the token is this machine's local
    // wall clock, not UTC (see helpers/run-token.cjs).
    const match = file.match(/^([A-Za-z0-9]+)-(\d{4}-\d{2}-\d{2})(?:-(\d{2}-\d{2}-\d{2}))?\.xlsx$/);
    if (!match) continue;
    const [, brand, date, token] = match;
    if (isOtherRunOfPinnedDay(brand, date, file)) continue;
    const runTime = token
      ? `${date}T${token.replace(/-/g, ':')}.000`
      : fs.statSync(path.join(combinedDir, file)).mtime.toISOString();

    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(path.join(combinedDir, file));

      const byGeo = new Map();

      wb.eachSheet(sheet => {
        if (sheet.name === 'Summary') return;
        const geo = sheet.name.replace(/-mobile$/, '');
        if (!byGeo.has(geo)) {
          byGeo.set(geo, { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0, specs: new Set() });
        }
        const agg = byGeo.get(geo);
        agg.total += Number(sheet.getRow(2).getCell(2).value) || 0;
        agg.passed += Number(sheet.getRow(3).getCell(2).value) || 0;
        agg.failed += Number(sheet.getRow(4).getCell(2).value) || 0;
        agg.skipped += Number(sheet.getRow(5).getCell(2).value) || 0;
        agg.flaky += Number(sheet.getRow(9).getCell(2).value) || 0;

        for (const row of extractTestRows(sheet)) {
          agg.specs.add(row.spec);
          tests.push({ date, brand, geo, spec: row.spec, testName: row.testName, status: row.status, reportUrl: reportUrlFor(brand, date, geo), runTime });
        }
      });

      for (const [geo, agg] of byGeo) {
        reports.push({
          brand, geo, date, runTime,
          total: agg.total, passed: agg.passed, failed: agg.failed, skipped: agg.skipped, flaky: agg.flaky,
          specs: [...agg.specs].sort((a, b) => a.localeCompare(b)),
          reportUrl: reportUrlFor(brand, date, geo),
        });
      }
    } catch {
      // Skip a corrupt/partially-written workbook.
    }
  }

  return { reports, tests };
}

// What a human decided about each failing/flaky test in the GUI's Triage table
// ("a Jira ticket was created" / "this is a script problem"), saved per brand +
// run date under Test Reports/<brand>/_triage/<date>.json (written by
// gui/server.ts). Keyed `${geo}|${testName}`. A new run date never inherits an
// old decision, same scoping as known-issues.json. Only these two outcomes are
// shown publicly; "ignored" stays internal.
function readTriageOutcomes(brand, date) {
  const file = path.join(ROOT, 'Test Reports', brand, '_triage', `${date}.json`);
  try {
    const found = JSON.parse(fs.readFileSync(file, 'utf8')).findings || {};
    const out = new Map();
    for (const [id, f] of Object.entries(found)) {
      if (f.outcome === 'ticket_created' && f.ticketKey) out.set(id, { outcome: f.outcome, ticketKey: f.ticketKey, ticketUrl: f.ticketUrl || null });
      else if (f.outcome === 'script_issue') out.set(id, { outcome: 'script_issue' });
    }
    return out;
  } catch {
    return new Map();
  }
}

// Adds `triage` to each failed/flaky test that has a saved outcome.
function attachTriage(tests) {
  const cache = new Map();
  return tests.map(t => {
    if (t.status !== 'failed' && t.status !== 'flaky') return t;
    const k = `${t.brand}|${t.date}`;
    if (!cache.has(k)) cache.set(k, readTriageOutcomes(t.brand, t.date));
    // The workbook appends " (failed even after retry)" / " (passed after retry)"
    // to a retried test's name; the Triage store keys on the plain test title.
    const plainName = String(t.testName).replace(/ \((?:passed after retry|failed even after retry)\)$/, '');
    const hit = cache.get(k).get(`${t.geo}|${plainName}`);
    return hit ? { ...t, triage: hit } : t;
  });
}

const KNOWN_ISSUES = JSON.parse(fs.readFileSync(path.join(__dirname, 'known-issues.json'), 'utf8')).brands || {};

function buildBrandSummary(runs, tests = []) {
  const byBrand = new Map();
  for (const r of runs) {
    if (!byBrand.has(r.brand)) {
      byBrand.set(r.brand, { brand: r.brand, total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0, geos: new Set(), lastRunDate: null });
    }
    const agg = byBrand.get(r.brand);
    agg.total += r.total;
    agg.passed += r.passed;
    agg.failed += r.failed;
    agg.skipped += r.skipped;
    agg.flaky += r.flaky;
    agg.geos.add(r.geo);
    if (!agg.lastRunDate || r.date > agg.lastRunDate) agg.lastRunDate = r.date;
  }
  // Failing tests of this brand's latest run, and whether each has a saved outcome.
  const triageOfBrand = b => {
    const failing = tests.filter(t => t.brand === b.brand && t.date === b.lastRunDate && t.status === 'failed');
    const tickets = [...new Map(failing.filter(t => t.triage && t.triage.outcome === 'ticket_created')
      .map(t => [t.triage.ticketKey, { key: t.triage.ticketKey, url: t.triage.ticketUrl }])).values()];
    return { allTriaged: failing.length > 0 && failing.every(t => t.triage), tickets };
  };

  return [...byBrand.values()]
    .map(b => ({
      brand: b.brand,
      total: b.total,
      passed: b.passed,
      failed: b.failed,
      skipped: b.skipped,
      flaky: b.flaky,
      geoCount: b.geos.size,
      geos: [...b.geos].sort((a, b2) => a.localeCompare(b2)),
      lastRunDate: b.lastRunDate,
      passRatePct: (b.passed + b.failed) > 0
        ? Math.round(((b.passed + b.skipped) / b.total) * 1000) / 10
        : 0,
      // Plain status for a non-technical reader, so nobody has to compare
      // Passed/Failed/Flaky columns themselves to know if a brand is OK:
      // any real failure means "issue" regardless of how small; flaky-only
      // (no hard failures, just an inconsistent result) is a lesser "watch"
      // state, not lumped in with a real failure. A failure gets calmed down
      // to "known-issue" ONLY when known-issues.json names this exact brand
      // AND its appliesToDate matches this brand's actual latest run date —
      // otherwise a stale note could quietly hide a genuinely new failure
      // that happens to land on the same brand later.
      // Beyond the manual known-issues.json list, a brand's failures also calm
      // down on their own once EVERY failing test in its latest run has a saved
      // Triage outcome: all script problems -> 'known-issue'; otherwise (some
      // have a Jira ticket) -> 'ticketed', which is still a real open bug, so it
      // is shown as such rather than hidden.
      status: (() => {
        if (b.failed > 0) {
          const known = KNOWN_ISSUES[b.brand];
          if (known && known.appliesToDate === b.lastRunDate) return 'known-issue';
          const t = triageOfBrand(b);
          if (t.allTriaged) return t.tickets.length > 0 ? 'ticketed' : 'known-issue';
          return 'issue';
        }
        return b.flaky > 0 ? 'watch' : 'healthy';
      })(),
      knownIssueNote: (() => {
        const known = KNOWN_ISSUES[b.brand];
        if (b.failed > 0 && known && known.appliesToDate === b.lastRunDate) return known.note;
        const t = b.failed > 0 ? triageOfBrand(b) : null;
        if (t && t.allTriaged && t.tickets.length === 0) return 'Marked as a test-script problem, not a real bug.';
        return null;
      })(),
      tickets: (() => {
        const t = b.failed > 0 ? triageOfBrand(b) : null;
        return t && t.allTriaged ? t.tickets : [];
      })(),
    }))
    .sort((a, b) => (b.lastRunDate || '').localeCompare(a.lastRunDate || ''));
}

// Two different scopes, on purpose:
//  - "brands" / the top stat cards are each brand's CURRENT state — its own
//    most-recent date, not summed across every date it's ever run — so the
//    overview reads as "how are we doing right now", not a growing pile of
//    stale numbers. A brand that isn't run today still shows its last real
//    result instead of vanishing.
//  - "days" (Run History) is the actual history: every run-day across every
//    brand, most recent first, so a past run stays visible and comparable
//    once a brand is re-tested later (capped to the last 30 days, same cap
//    the internal GUI's own /dashboard endpoint uses, so this doesn't grow
//    unbounded either).
// TARGET_DATE is no longer a hard filter — it's kept only so a caller can
// still ask "what did TODAY look like" via the CLI/env var if ever needed,
// but the snapshot itself always covers full history for Run History.
const TARGET_DATE = process.env.TARGET_DATE || new Date().toISOString().slice(0, 10);

function latestRunsPerBrand(allRuns) {
  const latestDateByBrand = new Map();
  for (const r of allRuns) {
    const cur = latestDateByBrand.get(r.brand);
    if (!cur || r.date > cur) latestDateByBrand.set(r.brand, r.date);
  }
  return allRuns.filter(r => r.date === latestDateByBrand.get(r.brand));
}

// The public overview only ever shows brands someone has explicitly put in
// dashboard/release-scope.json (this month's real release cycle) — Test
// Reports/ on disk also holds ad hoc dev/investigation/bug-repro runs for
// brands that were never meant to appear on the public site, so scanning
// everything found there isn't safe to do unfiltered.
const RELEASE_SCOPE = JSON.parse(fs.readFileSync(path.join(__dirname, 'release-scope.json'), 'utf8'));
const SCOPED_BRANDS = new Set(RELEASE_SCOPE.brands);
const SINCE_DATE = RELEASE_SCOPE.sinceDate || '0000-00-00';
const inScope = r => SCOPED_BRANDS.has(r.brand) && r.date >= SINCE_DATE;

async function main() {
  const { reports: scannedRuns, tests: scannedTests } = await scanRunReports();
  const allRuns = scannedRuns.filter(inScope);
  const allTests = scannedTests.filter(inScope);

  if (allRuns.length === 0) {
    console.log(`No runs found for release-scope brands (${[...SCOPED_BRANDS].join(', ')}) — writing an empty snapshot.`);
  }

  const currentRuns = latestRunsPerBrand(allRuns);
  const currentDates = new Set(currentRuns.map(r => r.date));
  const currentTests = attachTriage(allTests.filter(t => currentDates.has(t.date)));

  const stats = currentRuns.reduce(
    (acc, r) => {
      acc.totalRuns += 1;
      acc.totalPassed += r.passed;
      acc.totalFailed += r.failed;
      acc.totalFlaky += r.flaky;
      if (!acc.lastRunDate || r.date > acc.lastRunDate) acc.lastRunDate = r.date;
      return acc;
    },
    { totalRuns: 0, totalPassed: 0, totalFailed: 0, totalFlaky: 0, lastRunDate: null }
  );
  // Plain-language headline for a non-technical viewer: "of what we actually
  // ran, what fraction came back clean" — skipped tests aren't part of the
  // denominator since they were never executed, so they can't count for or
  // against health.
  const totalExecuted = stats.totalPassed + stats.totalFailed + stats.totalFlaky;
  stats.totalTests = totalExecuted;
  stats.passRatePct = totalExecuted > 0 ? Math.round((stats.totalPassed / totalExecuted) * 1000) / 10 : null;

  const byDate = new Map();
  for (const r of allRuns) {
    if (!byDate.has(r.date)) byDate.set(r.date, { date: r.date, passed: 0, failed: 0, flaky: 0, entries: [] });
    const day = byDate.get(r.date);
    day.passed += r.passed;
    day.failed += r.failed;
    day.flaky += r.flaky;
    day.entries.push({
      brand: r.brand, geo: r.geo, runTime: r.runTime, specs: r.specs,
      passed: r.passed, failed: r.failed, flaky: r.flaky, reportUrl: r.reportUrl,
    });
  }
  const days = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);

  const brands = buildBrandSummary(currentRuns, currentTests);

  const generatedAt = new Date().toISOString();
  const data = { generatedAt, targetDate: TARGET_DATE, stats, days, tests: currentTests.slice(0, 500), brands };

  const outDir = path.join(__dirname, 'public');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'data.json'), JSON.stringify(data));

  console.log(`Wrote ${path.join(outDir, 'data.json')} (brands scoped to each one's latest run; history covers up to 30 days)`);
  console.log(`  ${currentRuns.length} current run(s) across ${brands.length} brand(s); ${days.length} day(s) of history.`);
  console.log(`  Brands: ${brands.map(b => `${b.brand} (${b.lastRunDate})`).join(', ')}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

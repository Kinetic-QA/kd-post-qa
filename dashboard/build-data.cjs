// Scans Test Reports/<brand>/<geo>/<date>/*.xlsx and combined-reports/<BRAND>-<date>.xlsx
// (same fixed-row layout excel-reporter.cjs writes, same walk gui/server.ts's
// scanRunReports()/scanCombinedReports() do for the live GUI dashboard) and
// bakes the result into dashboard/public/data.json — a static snapshot the
// deployed Netlify site reads instead of hitting a live server, since a
// static site has no access to this machine's local Test Reports/ folder.
//
// Usage: node dashboard/build-data.cjs
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

// Finds a report-* folder's index.html so a drilldown row can link back to
// the real Playwright HTML report — mirrors gui/server.ts's findReportFolder,
// but this static site has no /reports/* route of its own, so these links
// are left null; the day/brand tables just render "No report" for now.
// (Wiring live report links into this static site is a separate follow-up —
// it would need each report folder deployed alongside this dashboard.)

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
        const dateDir = path.join(geoDir, dateEntry.name);

        const xlsxFiles = fs.readdirSync(dateDir).filter(f => f.endsWith('.xlsx'));

        for (const file of xlsxFiles) {
          try {
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.readFile(path.join(dateDir, file));

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
                  reportUrl: null,
                });
              }
            });

            reports.push({
              brand: brand.name,
              geo: geo.name,
              date: dateEntry.name,
              total, passed, failed, skipped, flaky,
              specs: [...specSet].sort((a, b) => a.localeCompare(b)),
              reportUrl: null,
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

  return {
    reports: reports.sort((a, b) => b.date.localeCompare(a.date)),
    tests: tests.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

async function scanCombinedReports() {
  const combinedDir = path.join(ROOT, 'combined-reports');
  const reports = [];
  const tests = [];
  if (!fs.existsSync(combinedDir)) return { reports, tests };

  for (const file of fs.readdirSync(combinedDir)) {
    const match = file.match(/^([A-Za-z0-9]+)-(\d{4}-\d{2}-\d{2})\.xlsx$/);
    if (!match) continue;
    const [, brand, date] = match;

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
          tests.push({ date, brand, geo, spec: row.spec, testName: row.testName, status: row.status, reportUrl: null });
        }
      });

      for (const [geo, agg] of byGeo) {
        reports.push({
          brand, geo, date,
          total: agg.total, passed: agg.passed, failed: agg.failed, skipped: agg.skipped, flaky: agg.flaky,
          specs: [...agg.specs].sort((a, b) => a.localeCompare(b)),
          reportUrl: null,
        });
      }
    } catch {
      // Skip a corrupt/partially-written workbook.
    }
  }

  return { reports, tests };
}

function buildBrandSummary(runs) {
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
    }))
    .sort((a, b) => (b.lastRunDate || '').localeCompare(a.lastRunDate || ''));
}

// This project is meant to show "today's regression run", not the whole
// history under Test Reports/ (that full history is what made the first
// version of this page look cluttered with months of unrelated runs) — so
// scope every scan down to one date, defaulting to today. Pass an explicit
// TARGET_DATE to rebuild the snapshot for a different day (e.g. re-running
// this after midnight for a run that started the day before).
const TARGET_DATE = process.env.TARGET_DATE || new Date().toISOString().slice(0, 10);

async function main() {
  const { reports: allRuns, tests: allTests } = await scanRunReports();
  const runs = allRuns.filter(r => r.date === TARGET_DATE);
  const tests = allTests.filter(t => t.date === TARGET_DATE);

  if (runs.length === 0) {
    console.log(`No runs found for ${TARGET_DATE} — writing an empty snapshot.`);
  }

  const stats = runs.reduce(
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

  const byDate = new Map();
  for (const r of runs) {
    if (!byDate.has(r.date)) byDate.set(r.date, { date: r.date, passed: 0, failed: 0, flaky: 0, entries: [] });
    const day = byDate.get(r.date);
    day.passed += r.passed;
    day.failed += r.failed;
    day.flaky += r.flaky;
    day.entries.push({
      brand: r.brand, geo: r.geo, specs: r.specs,
      passed: r.passed, failed: r.failed, flaky: r.flaky, reportUrl: r.reportUrl,
    });
  }
  const days = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);

  const brands = buildBrandSummary(runs);

  const generatedAt = new Date().toISOString();
  const data = { generatedAt, targetDate: TARGET_DATE, stats, days, tests: tests.slice(0, 500), brands };

  const outDir = path.join(__dirname, 'public');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'data.json'), JSON.stringify(data));

  console.log(`Wrote ${path.join(outDir, 'data.json')} (scoped to ${TARGET_DATE})`);
  console.log(`  ${runs.length} run(s) across ${brands.length} brand(s), ${tests.length} individual test result(s).`);
  console.log(`  Brands: ${brands.map(b => b.brand).join(', ')}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

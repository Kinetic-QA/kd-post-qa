// One-off (but reusable) backfill for Excel workbooks written BEFORE
// excel-reporter.cjs started emitting a "Shareable Report Link" column
// (added 2026-08-13) and/or before it fixed the "Test File" column (which
// used to hold the GEO instead of the actual spec file — also fixed
// 2026-08-13). Fixes both using each GEO's own Playwright JSON reporter
// output (Test Reports/<BRAND>/<GEO>/<date>/test-results/results.json):
// spec.id is the exact same hash Playwright's HTML report uses for its
// "#?testId=<id>" deep links (see the testId comment in excel-reporter.
// cjs's onTestEnd), and spec.file is the real file path the "Test File"
// column should have held all along. Link values are written with the
// same NETLIFY_BASE_URL/... placeholder scheme deploy-reports.cjs already
// knows how to resolve once the report is actually deployed.
//
// Usage: TEST_BRAND=SC TEST_DATE=2026-08-12 node backfill-report-links.cjs "combined-reports/sc-combined-2026-08-12.xlsx"

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const brand = process.env.TEST_BRAND;
const dateStr = process.env.TEST_DATE;
const xlsxPath = process.argv[2];
// Optional — if the report is already deployed, pass its real base URL to
// write final links directly in one pass instead of the NETLIFY_BASE_URL
// placeholder deploy-reports.cjs would otherwise resolve in a second pass.
const resolvedBaseUrl = process.env.RESOLVED_BASE_URL;

if (!brand || !dateStr || !xlsxPath) {
  console.error('Usage: TEST_BRAND=SC TEST_DATE=2026-08-12 node backfill-report-links.cjs <path-to-xlsx>');
  process.exit(1);
}
if (!fs.existsSync(xlsxPath)) {
  console.error(`Workbook not found: ${xlsxPath}`);
  process.exit(1);
}

// A TEST_MOBILE run's results.json holds TWO separate spec entries per
// (file, title) — one per project (e.g. "UK" and "UK-mobile") — each with
// its own distinct spec.id, confirmed live: they are NOT the same id, so
// the map must be keyed by project name too or a mobile lookup silently
// returns the desktop project's id (or vice versa) instead of missing
// outright.
// Keyed by title only (not file) since the lookup key comes from the
// workbook's existing "Test File"/"Test Name" columns, and (pre-fix) "Test
// File" only ever held the GEO, not the spec's file path — so file isn't
// usable as the match key. Every spec title in this suite is unique per
// project, so title alone is a safe key. spec.file itself IS carried
// through as the value, though, so it can be used to fix that column.
function collectSpecIds(suite, map) {
  for (const spec of suite.specs || []) {
    const projectName = spec.tests?.[0]?.projectName;
    if (projectName) map.set(`${projectName}::${spec.title}`, { id: spec.id, file: spec.file.replace(/\\/g, '/') });
  }
  for (const child of suite.suites || []) collectSpecIds(child, map);
}

// One results.json per BASE geo folder (e.g. "ES") holds both that geo's
// desktop and "-mobile" project — see playwright.config.ts's geoOutputDir,
// which doesn't split by mobile — so the file lives under the base geo's
// folder even when looking up a "<geo>-mobile" sheet.
function loadResultsMap(geo) {
  const baseGeo = geo.replace(/-mobile$/, '');
  const resultsPath = path.join('Test Reports', brand, baseGeo, dateStr, 'test-results', 'results.json');
  if (!fs.existsSync(resultsPath)) return null;
  const json = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const map = new Map();
  for (const suite of json.suites || []) collectSpecIds(suite, map);
  return map;
}

// Test names get a retry suffix appended when written (see excel-reporter.
// cjs's testLabel) — strip it back off before looking the row up in the
// results.json title map, which has no knowledge of retries.
function stripRetrySuffix(testName) {
  return testName.replace(/ \((passed after retry|failed even after retry)\)$/, '');
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);

  let totalFilled = 0;
  let totalMissed = 0;

  wb.eachSheet(ws => {
    if (ws.name === 'Summary') return;
    const geo = ws.name;
    const linkMap = loadResultsMap(geo);
    if (!linkMap) {
      console.log(`Skipping sheet "${geo}" — no results.json found for ${brand}/${geo}/${dateStr}.`);
      return;
    }

    // Find the header row (labeled rows above it vary in count across
    // excel-reporter.cjs versions, so locate it by content instead of a
    // fixed row number).
    let headerRowNum = null;
    let fileCol = null, testCol = null, linkCol = null;
    ws.eachRow((row, rowNum) => {
      if (headerRowNum) return;
      row.eachCell((cell, colNum) => {
        if (cell.value === 'Test File') fileCol = colNum;
        if (cell.value === 'Test Name') testCol = colNum;
        if (cell.value === 'Shareable Report Link') linkCol = colNum;
      });
      if (fileCol && testCol) headerRowNum = rowNum;
    });
    if (!headerRowNum) {
      console.log(`Skipping sheet "${geo}" — couldn't find its header row.`);
      return;
    }

    const headerRow = ws.getRow(headerRowNum);
    if (!linkCol) {
      linkCol = headerRow.cellCount + 1;
      const hc = headerRow.getCell(linkCol);
      hc.value = 'Shareable Report Link';
      hc.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      hc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
      hc.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      headerRow.commit();
      ws.getColumn(linkCol).width = 16;
    }

    let filled = 0, missed = 0;
    for (let r = headerRowNum + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const rawTestName = row.getCell(testCol).value;
      if (!rawTestName) continue;
      const testName = stripRetrySuffix(String(rawTestName));
      const match = linkMap.get(`${geo}::${testName}`);
      const linkCell = row.getCell(linkCol);
      if (match) {
        // Deployed folder is per BASE geo, not per project — desktop and
        // "-mobile" share one Playwright HTML report (same reportRoot in
        // playwright.config.ts), so deploy-reports.cjs never creates a
        // separate "<geo>-mobile/" folder. Linking to it 404s even though
        // the testId itself is valid — it just lives under the base geo's
        // folder instead.
        const baseGeoPath = geo.replace(/-mobile$/, '');
        const base = resolvedBaseUrl || 'NETLIFY_BASE_URL';
        linkCell.value = { text: 'View Result', hyperlink: `${base}/${baseGeoPath}/index.html#?testId=${match.id}` };
        linkCell.font = { name: 'Arial', size: 10, underline: true, color: { argb: 'FF0563C1' } };
        linkCell.alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(fileCol).value = match.file;
        filled++;
      } else {
        missed++;
      }
      row.commit();
    }
    console.log(`${geo}: filled ${filled} link(s) + file path(s)${missed ? `, ${missed} row(s) had no match` : ''}.`);
    totalFilled += filled;
    totalMissed += missed;
  });

  await wb.xlsx.writeFile(xlsxPath);
  console.log(`\nDone. ${totalFilled} link(s) written, ${totalMissed} unmatched, to ${xlsxPath}`);
})();

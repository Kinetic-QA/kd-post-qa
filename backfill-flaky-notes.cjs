// One-off (but reusable) backfill for Excel workbooks written BEFORE
// excel-reporter.cjs started distinguishing "flaky" (failed once, passed on
// retry) from a clean "PASSED" — added 2026-08-13 after a teammate noticed
// ES's login-widget "forgot password" flake just showed up as plain PASSED
// with no explanation. Finds every test that had more than one attempt in
// its GEO's results.json, and for the ones that ultimately passed, sets the
// Status cell to FLAKY and appends the first attempt's error as a side
// note — matching what excel-reporter.cjs now does for new runs.
//
// Usage: TEST_BRAND=SC TEST_DATE=2026-08-12 node backfill-flaky-notes.cjs "combined-reports/sc-combined-2026-08-12.xlsx"

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const brand = process.env.TEST_BRAND;
const dateStr = process.env.TEST_DATE;
const xlsxPath = process.argv[2];

if (!brand || !dateStr || !xlsxPath) {
  console.error('Usage: TEST_BRAND=SC TEST_DATE=2026-08-12 node backfill-flaky-notes.cjs <path-to-xlsx>');
  process.exit(1);
}
if (!fs.existsSync(xlsxPath)) {
  console.error(`Workbook not found: ${xlsxPath}`);
  process.exit(1);
}

function stripAnsi(str) {
  return (str || '').replace(/\x1B\[[0-9;]*m/g, '');
}

// Same patterns as excel-reporter.cjs's humanizeError, kept identical so a
// backfilled note reads the same as one written by a live run.
function humanizeError(rawMessage) {
  const msg = stripAnsi(rawMessage).replace(/\s+/g, ' ').trim();
  if (!msg) return '';
  if (/toBeVisible/.test(msg) && /element\(s\) not found/.test(msg)) {
    return "Couldn't find this on the page at all — it may not exist for this market, or the page changed.";
  }
  if (/toBeVisible/.test(msg) && /Received:\s*hidden/.test(msg)) {
    return 'Found it on the page, but it was hidden — likely covered by a pop-up/banner, or not shown for this market.';
  }
  if (/toBeVisible/.test(msg)) return 'Waited for something to appear on the page, but it never showed up in time.';
  if (/locator\.click:.*Timeout/.test(msg)) return 'Tried to click something that never appeared on the page in time.';
  if (/toHaveURL/.test(msg)) return "The page didn't go to the expected address in time.";
  if (/Timeout of \d+ms exceeded/.test(msg) || /Test timeout of \d+ms exceeded/.test(msg)) {
    return 'The test ran out of time — the page may have been slow to load, or something got stuck.';
  }
  const firstSentence = msg.split(/(?<=[.!?])\s/)[0] || msg;
  return firstSentence.length > 180 ? firstSentence.substring(0, 180) + '…' : firstSentence;
}

// Keyed by "<projectName>::<title>", value is the first (failed) attempt's
// humanized error — only populated for specs that actually had >1 attempt.
function collectFlakyNotes(suite, map) {
  for (const spec of suite.specs || []) {
    for (const t of spec.tests || []) {
      if (t.results && t.results.length > 1 && t.results[t.results.length - 1].status === 'passed') {
        const firstError = t.results[0].errors?.[0]?.message || '';
        map.set(`${t.projectName}::${spec.title}`, humanizeError(firstError) || 'Failed on first attempt, passed on retry (no error message captured).');
      }
    }
  }
  for (const child of suite.suites || []) collectFlakyNotes(child, map);
}

function loadFlakyMap(geo) {
  const baseGeo = geo.replace(/-mobile$/, '');
  const resultsPath = path.join('Test Reports', brand, baseGeo, dateStr, 'test-results', 'results.json');
  if (!fs.existsSync(resultsPath)) return null;
  const json = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const map = new Map();
  for (const suite of json.suites || []) collectFlakyNotes(suite, map);
  return map;
}

function stripRetrySuffix(testName) {
  return testName.replace(/ \((passed after retry|failed even after retry)\)$/, '');
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);

  let totalUpdated = 0;

  wb.eachSheet(ws => {
    if (ws.name === 'Summary') return;
    const geo = ws.name;
    const flakyMap = loadFlakyMap(geo);
    if (!flakyMap || flakyMap.size === 0) return;

    let headerRowNum = null;
    let testCol = null, statusCol = null, noteCol = null;
    ws.eachRow((row, rowNum) => {
      if (headerRowNum) return;
      row.eachCell((cell, colNum) => {
        if (cell.value === 'Test Name') testCol = colNum;
        if (cell.value === 'Status') statusCol = colNum;
        if (typeof cell.value === 'string' && cell.value.startsWith('Side Note')) noteCol = colNum;
      });
      if (testCol && statusCol) headerRowNum = rowNum;
    });
    if (!headerRowNum || !noteCol) {
      console.log(`Skipping sheet "${geo}" — couldn't find its header row/columns.`);
      return;
    }

    let updated = 0;
    for (let r = headerRowNum + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const rawTestName = row.getCell(testCol).value;
      if (!rawTestName) continue;
      const testName = stripRetrySuffix(String(rawTestName));
      const flakyReason = flakyMap.get(`${geo}::${testName}`);
      if (!flakyReason) continue;

      const statusCell = row.getCell(statusCol);
      statusCell.value = 'FLAKY';
      statusCell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9C6500' } };
      statusCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const noteCell = row.getCell(noteCol);
      const existingNote = typeof noteCell.value === 'string' ? noteCell.value : '';
      const flakyNote = `Flaky — failed on first attempt, passed on retry: ${flakyReason}`;
      noteCell.value = [existingNote, flakyNote].filter(Boolean).join(' | ');
      noteCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF9C6500' } };
      noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
      noteCell.alignment = { vertical: 'middle', wrapText: true };

      row.commit();
      updated++;
    }
    if (updated > 0) console.log(`${geo}: marked ${updated} flaky row(s).`);
    totalUpdated += updated;
  });

  if (totalUpdated > 0) {
    await wb.xlsx.writeFile(xlsxPath);
    console.log(`\nDone. ${totalUpdated} row(s) updated in ${xlsxPath}`);
  } else {
    console.log('\nNo flaky rows found to backfill.');
  }
})();

const fs = require('fs');
const path = require('path');

function stripAnsi(str) {
  return (str || '').replace(/\x1B\[[0-9;]*m/g, '');
}

// Shared by each GEO sheet's own duration and the cross-sheet grand total in
// the Summary tab — grand totals can exceed an hour once every GEO/platform
// is added up, so this (unlike the old inline minutes/seconds-only version)
// rolls over into hours too.
function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.round(totalSeconds % 60);
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Translates a raw Playwright assertion/timeout error into a one-line,
 * non-technical explanation. Falls back to a cleaned/shortened version of
 * the raw message when no known pattern matches, so nothing is ever blank.
 */
function humanizeError(rawMessage) {
  const msg = stripAnsi(rawMessage).replace(/\s+/g, ' ').trim();
  if (!msg) return '';

  if (/toBeVisible/.test(msg) && /element\(s\) not found/.test(msg)) {
    return "Couldn't find this on the page at all — it may not exist for this market, or the page changed.";
  }
  if (/toBeVisible/.test(msg) && /Received:\s*hidden/.test(msg)) {
    return "Found it on the page, but it was hidden — likely covered by a pop-up/banner, or not shown for this market.";
  }
  if (/toBeVisible/.test(msg)) {
    return "Waited for something to appear on the page, but it never showed up in time.";
  }
  if (/locator\.click:.*Timeout/.test(msg)) {
    return "Tried to click something that never appeared on the page in time.";
  }
  if (/toHaveURL/.test(msg)) {
    return "The page didn't go to the expected address in time.";
  }
  if (/Expected:\s*true.*Received:\s*false/.test(msg)) {
    return "A check on the page came back failed (expected it to pass, but it didn't).";
  }
  if (/Expected:\s*false.*Received:\s*true/.test(msg)) {
    return "A check on the page came back true when it shouldn't have.";
  }
  if (/Timeout of \d+ms exceeded/.test(msg) || /Test timeout of \d+ms exceeded/.test(msg)) {
    return "The test ran out of time — the page may have been slow to load, or something got stuck.";
  }
  if (/net::ERR|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED/.test(msg)) {
    return "Couldn't reach the website — a connection/network error occurred.";
  }

  // No known pattern — fall back to a shortened, cleaned version of the raw message.
  const firstSentence = msg.split(/(?<=[.!?])\s/)[0] || msg;
  return firstSentence.length > 180 ? firstSentence.substring(0, 180) + '…' : firstSentence;
}

class ExcelReporter {
  constructor() {
    // Keyed by geo+titlePath so retries overwrite the same entry rather than
    // adding duplicate rows — onTestEnd fires once per attempt when
    // playwright.config.ts's retries > 0, and only the final attempt's
    // outcome should count toward the report.
    this._resultsByKey = new Map();
    this._startTime = null;
  }

  onBegin(config, suite) {
    this._startTime = new Date().toISOString();
    this._resultsByKey = new Map();
    console.log('\n[Excel Reporter] Started — will generate report on completion.');
  }

  onTestEnd(test, result) {
    const titlePath = test.titlePath();
    const geo = test.parent?.project()?.name || 'default';
    const file = titlePath[1] || '';
    const testName = titlePath[titlePath.length - 1] || '';
    const errors = result.errors || [];
    const rawError = errors.length > 0 ? stripAnsi(errors[0].message || '').replace(/\n/g, ' ').substring(0, 400) : '';
    const errorMsg = rawError ? humanizeError(rawError) : '';
    const key = geo + '::' + titlePath.join('>');
    this._resultsByKey.set(key, {
      geo,
      file,
      test: testName,
      status: result.status,
      duration_s: Math.round(result.duration / 100) / 10,
      error: errorMsg,
      errorRaw: rawError,
      retried: result.retry > 0,
    });
  }

  async onEnd(result) {
    const rows = [...this._resultsByKey.values()];
    if (rows.length === 0) {
      console.log('\n[Excel Reporter] No results to write.');
      return;
    }

    let ExcelJS;
    try {
      ExcelJS = require('exceljs');
    } catch (e) {
      console.error('\n[Excel Reporter] exceljs not found. Run: npm install');
      return;
    }

    const outDir = path.join(__dirname, 'test-results');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const geos = [...new Set(rows.map(r => r.geo))];

    // EXCEL_REPORT_FILE opts into append mode — used for a multi-session
    // combined report (e.g. one GEO per paused run, VPN switched between
    // each) where every run should land as new tabs in the SAME workbook
    // instead of each run producing its own new timestamped file. Without
    // it, behavior is unchanged: a fresh file per run, named/timestamped as
    // before — this is what agent.ts's per-ticket runs and any single-shot
    // dev run still rely on.
    //
    // Lives in its own directory, NOT test-results/ — Playwright wipes its
    // configured outputDir (test-results/) at the start of every run
    // (confirmed live: a combined file placed there was gone before the
    // second run's onEnd() could read it back in), which would silently
    // destroy this file before it could ever be appended to.
    const appendFile = process.env.EXCEL_REPORT_FILE;
    const wb = new ExcelJS.Workbook();
    let outPath;

    if (appendFile) {
      const combinedDir = path.join(__dirname, 'combined-reports');
      if (!fs.existsSync(combinedDir)) fs.mkdirSync(combinedDir, { recursive: true });
      outPath = path.join(combinedDir, appendFile.endsWith('.xlsx') ? appendFile : `${appendFile}.xlsx`);
      if (fs.existsSync(outPath)) {
        await wb.xlsx.readFile(outPath);
        // Re-running the same GEO into an existing combined report should
        // replace that GEO's old tab, not leave a stale duplicate/error on
        // a clashing sheet name.
        for (const geo of geos) {
          const existing = wb.getWorksheet(geo.substring(0, 31));
          if (existing) wb.removeWorksheet(existing.id);
        }
      }
    }

    for (const geo of geos) {
      const sheetName = geo.substring(0, 31);
      const ws = wb.addWorksheet(sheetName);
      this._writeSheet(ws, rows.filter(r => r.geo === geo));
    }

    // Summary tab is fully recomputed every run (not just appended to) so it
    // always reflects every GEO/platform sheet currently in the workbook —
    // in append mode that includes tabs written by earlier, separate GEO
    // runs, not just the one that just finished.
    const existingSummary = wb.getWorksheet('Summary');
    if (existingSummary) wb.removeWorksheet(existingSummary.id);
    this._writeSummarySheet(wb);

    if (!appendFile) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 23);
      const uniqueSuites = [...new Set(rows.map(r => r.file).filter(Boolean))];
      // Desktop+mobile runs of the same GEO produce project names like "DE"
      // and "DE-mobile" — strip the "-mobile" suffix before deduping so a
      // combined run is still recognized as a single-GEO run.
      const baseGeos = [...new Set(geos.map(g => g.replace(/-mobile$/, '')))];
      const baseName = uniqueSuites.length === 1
        ? uniqueSuites[0]
            .replace(/^(p[12]|sample)\s*[-–]\s*/i, '')  // strip "P1 - ", "P2 - ", "Sample - "
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
        // Full desktop+mobile suite run of one GEO — use the GEO acronym
        // (e.g. "DE") instead of the uninformative "all-tests", so the
        // filename actually identifies which market the report covers.
        : baseGeos.length === 1
        ? baseGeos[0].toLowerCase().replace(/[^a-z0-9-]/g, '')
        : 'all-tests';
      outPath = path.join(outDir, `${baseName}_${timestamp}.xlsx`);
    }

    await wb.xlsx.writeFile(outPath);
    console.log(`\n[Excel Reporter] Report saved: ${outPath}\n`);
  }

  // Adds a "Summary" tab listing every GEO/platform sheet's duration plus a
  // grand total across the whole workbook — placed last so it always
  // reflects whatever sheets exist at write time, including ones from
  // earlier separate runs in append mode.
  _writeSummarySheet(wb) {
    const perSheet = [];
    let grandTotalSeconds = 0;
    let grandTotal = 0, grandPassed = 0, grandFailed = 0, grandSkipped = 0;
    wb.eachSheet(worksheet => {
      // These all live at fixed rows/col 2 per _writeSheet's per-GEO summary
      // block — read them back exactly rather than re-parsing anything
      // human-readable, which is free to reformat later.
      const raw = worksheet.getRow(8).getCell(2).value;
      const seconds = typeof raw === 'number' ? raw : 0;
      const total = worksheet.getRow(2).getCell(2).value;
      const passed = worksheet.getRow(3).getCell(2).value;
      const failed = worksheet.getRow(4).getCell(2).value;
      const skipped = worksheet.getRow(5).getCell(2).value;
      perSheet.push({ name: worksheet.name, seconds });
      grandTotalSeconds += seconds;
      grandTotal += typeof total === 'number' ? total : 0;
      grandPassed += typeof passed === 'number' ? passed : 0;
      grandFailed += typeof failed === 'number' ? failed : 0;
      grandSkipped += typeof skipped === 'number' ? skipped : 0;
    });

    // Coverage = how much of everything that ran was actually exercised
    // (not skipped as "doesn't exist for this GEO/viewport"). Reliability =
    // of what was actually exercised, how much came back clean — a GEO with
    // heavy skips can still be 100% reliable on what it does cover, so these
    // are two separate numbers, not one blended score.
    const ran = grandPassed + grandFailed;
    const coveragePct = grandTotal > 0 ? Math.round((ran / grandTotal) * 1000) / 10 : 0;
    const reliabilityPct = ran > 0 ? Math.round((grandPassed / ran) * 1000) / 10 : 100;
    const isFullyReliable = grandFailed === 0;

    const ws = wb.addWorksheet('Summary');

    const title = ws.getRow(1);
    title.getCell(1).value = 'Combined Run Summary — All GEOs & Platforms';
    title.getCell(1).font = { name: 'Arial', bold: true, size: 13 };
    title.commit();

    const grandRow = ws.getRow(3);
    grandRow.getCell(1).value = 'Grand Total Duration';
    grandRow.getCell(1).font = { name: 'Arial', bold: true, size: 12 };
    grandRow.getCell(2).value = formatDuration(grandTotalSeconds);
    grandRow.getCell(2).font = { name: 'Arial', bold: true, size: 12, color: { argb: 'FF1F3864' } };
    grandRow.commit();

    const totalChecksRow = ws.getRow(4);
    totalChecksRow.getCell(1).value = 'Total Checks (all GEOs/platforms)';
    totalChecksRow.getCell(1).font = { name: 'Arial', bold: true, size: 11 };
    totalChecksRow.getCell(2).value = `${grandTotal} (${grandPassed} passed, ${grandFailed} failed, ${grandSkipped} skipped)`;
    totalChecksRow.getCell(2).font = { name: 'Arial', size: 11 };
    totalChecksRow.commit();

    const coverageRow = ws.getRow(5);
    coverageRow.getCell(1).value = '% of Regression Suite Automated (Coverage)';
    coverageRow.getCell(1).font = { name: 'Arial', bold: true, size: 11 };
    coverageRow.getCell(2).value = `${coveragePct}%`;
    coverageRow.getCell(2).font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FF1F3864' } };
    coverageRow.commit();

    const reliabilityRow = ws.getRow(6);
    reliabilityRow.getCell(1).value = '% Reliable (pass rate of checks actually run)';
    reliabilityRow.getCell(1).font = { name: 'Arial', bold: true, size: 11 };
    reliabilityRow.getCell(2).value = `${reliabilityPct}%`;
    reliabilityRow.getCell(2).font = { name: 'Arial', bold: true, size: 11, color: { argb: reliabilityPct === 100 ? 'FF00B050' : 'FFC00000' } };
    reliabilityRow.commit();

    const verdictRow = ws.getRow(7);
    verdictRow.getCell(1).value = 'Fully Reliable?';
    verdictRow.getCell(1).font = { name: 'Arial', bold: true, size: 11 };
    verdictRow.getCell(2).value = isFullyReliable
      ? 'Yes — 0 real failures across every GEO/platform in this run'
      : `No — ${grandFailed} real failure(s) found, needs review before calling automation fully reliable`;
    verdictRow.getCell(2).font = { name: 'Arial', bold: true, size: 11, color: { argb: isFullyReliable ? 'FF00B050' : 'FFC00000' } };
    verdictRow.commit();

    const headerRow = ws.getRow(9);
    ['GEO / Platform', 'Duration'].forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    headerRow.commit();

    perSheet.forEach((s, idx) => {
      const row = ws.getRow(10 + idx);
      const shade = idx % 2 === 0 ? 'FFF2F2F2' : 'FFFFFFFF';
      row.getCell(1).value = s.name;
      row.getCell(2).value = formatDuration(s.seconds);
      [1, 2].forEach(ci => {
        const cell = row.getCell(ci);
        cell.font = { name: 'Arial', size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: shade } };
        cell.alignment = { vertical: 'middle' };
      });
      row.commit();
    });

    ws.columns = [{ width: 42 }, { width: 45 }];
  }

  _writeSheet(ws, rows) {
    const total = rows.length;
    const passed = rows.filter(r => r.status === 'passed').length;
    const failed = rows.filter(r => ['failed', 'timedOut'].includes(r.status)).length;
    const skipped = rows.filter(r => r.status === 'skipped').length;
    const passRate = total > 0 ? `${Math.round(passed / total * 1000) / 10}%` : '0%';
    const totalDurationS = rows.reduce((sum, r) => sum + (r.duration_s || 0), 0);
    const totalDurationLabel = formatDuration(totalDurationS);

    const summary = [
      ['Run Date', new Date(this._startTime).toLocaleString()],
      ['Total Tests', total],
      ['Passed', passed],
      ['Failed', failed],
      ['Skipped', skipped],
      ['Pass Rate', passRate],
      ['Total Duration', totalDurationLabel],
      // Hidden — lets onEnd's Summary tab sum exact seconds across every GEO
      // sheet in the workbook without re-parsing the human-readable label
      // above (e.g. "31m 0s"), which would be fragile to reformat.
      ['Total Duration (Raw Seconds)', totalDurationS],
    ];

    summary.forEach(([label, value], i) => {
      const row = ws.getRow(i + 1);
      const lc = row.getCell(1);
      const vc = row.getCell(2);
      lc.value = label;
      lc.font = { name: 'Arial', bold: true, size: 11 };
      vc.value = value;
      if (label === 'Passed') vc.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FF00B050' } };
      else if (label === 'Failed') vc.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FFC00000' } };
      else vc.font = { name: 'Arial', size: 11 };
      if (label === 'Total Duration (Raw Seconds)') row.hidden = true;
      row.commit();
    });

    const headerRow = summary.length + 2;
    const headers = ['Test File', 'Test Name', 'Status', 'Duration (s)', 'What Went Wrong', 'Technical Details'];
    const hr = ws.getRow(headerRow);
    headers.forEach((h, i) => {
      const cell = hr.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { top: { style: 'thin', color: { argb: 'FFD0D0D0' } }, bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } }, left: { style: 'thin', color: { argb: 'FFD0D0D0' } }, right: { style: 'thin', color: { argb: 'FFD0D0D0' } } };
    });
    hr.height = 22;
    hr.commit();

    const statusColors = { passed: 'FF0070C0', failed: 'FFC00000', timedOut: 'FFC00000', skipped: 'FFFFC000' };
    const statusLabels = { passed: 'PASSED', failed: 'FAILED', timedOut: 'TIMED OUT', skipped: 'SKIPPED' };

    rows.forEach((r, idx) => {
      const rowNum = headerRow + 1 + idx;
      const dr = ws.getRow(rowNum);
      const shade = idx % 2 === 0 ? 'FFF2F2F2' : 'FFFFFFFF';
      const testLabel = r.retried
        ? `${r.test} (${r.status === 'passed' ? 'passed after retry' : 'failed even after retry'})`
        : r.test;
      const vals = [r.file, testLabel, statusLabels[r.status] || r.status.toUpperCase(), r.duration_s, r.error, r.errorRaw];
      const border = { top: { style: 'thin', color: { argb: 'FFD0D0D0' } }, bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } }, left: { style: 'thin', color: { argb: 'FFD0D0D0' } }, right: { style: 'thin', color: { argb: 'FFD0D0D0' } } };
      vals.forEach((val, ci) => {
        const cell = dr.getCell(ci + 1);
        cell.value = val;
        cell.border = border;
        if (ci === 2) {
          cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColors[r.status] || 'FF808080' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.font = { name: 'Arial', size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: shade } };
          cell.alignment = { vertical: 'middle', wrapText: ci === 4 || ci === 5 };
        }
      });
      dr.commit();
    });

    ws.columns = [{ width: 35 }, { width: 45 }, { width: 14 }, { width: 14 }, { width: 50 }, { width: 55 }];
    ws.views = [{ state: 'frozen', ySplit: headerRow, activeCell: `A${headerRow + 1}` }];
  }
}

module.exports = ExcelReporter;

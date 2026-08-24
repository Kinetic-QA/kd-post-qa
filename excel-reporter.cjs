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
    // BUG FIXED 2026-08-13: titlePath[1] is the PROJECT name (e.g. "UK"),
    // not the file — titlePath is ['', projectName, filePath, ...describe
    // titles, testTitle]. That put the GEO in the "Test File" column
    // instead of the actual spec file. test.location.file is the reliable
    // source instead — made relative to testDir so it reads like
    // "p1/feedback-form.spec.ts" rather than a full absolute path.
    const file = path.relative(path.join(__dirname, 'tests'), test.location.file).replace(/\\/g, '/');
    const testName = titlePath[titlePath.length - 1] || '';
    const errors = result.errors || [];
    const rawError = errors.length > 0 ? stripAnsi(errors[0].message || '').replace(/\n/g, ' ').substring(0, 400) : '';
    const errorMsg = rawError ? humanizeError(rawError) : '';
    // assertNoSiteError (helpers/common.ts) pushes one of these whenever a
    // "SOMETHING WENT WRONG" glitch appeared and cleared on its own after a
    // reload — the test still passes, but a real visitor wouldn't get an
    // automatic reload, so it's worth a side note to dev even on a pass.
    const selfHealedNotes = (test.annotations || [])
      .filter(a => a.type === 'self-healed-site-error')
      .map(a => a.description)
      .join(' | ');
    const key = geo + '::' + titlePath.join('>');
    // onTestEnd fires once per attempt and each call REPLACES this key's Map
    // entry (see the key comment below), so by the time a retry passes, the
    // first attempt's failure would otherwise be silently overwritten — the
    // row would just read "PASSED" with nothing showing it was flaky.
    // Confirmed live: ES's forgot-password test failed once then passed on
    // retry, and without this the Excel gave no indication why. Carry the
    // first attempt's error into a note on the final (passing) row instead.
    const previousAttempt = this._resultsByKey.get(key);
    let flakyNote = '';
    if (result.retry > 0 && previousAttempt && previousAttempt.status !== 'passed' && result.status === 'passed') {
      const firstError = previousAttempt.error || previousAttempt.errorRaw || 'no error message captured';
      flakyNote = `Flaky — failed on first attempt, passed on retry: ${firstError}`;
    }
    const note = [selfHealedNotes, flakyNote].filter(Boolean).join(' | ');
    this._resultsByKey.set(key, {
      geo,
      file,
      test: testName,
      status: result.status,
      duration_s: Math.round(result.duration / 100) / 10,
      error: errorMsg,
      errorRaw: rawError,
      retried: result.retry > 0,
      note,
      // Mirrors Playwright's own report, which shows "flaky" as a distinct
      // outcome from "passed" (test.outcome() returns it specifically for
      // "failed once, passed on retry") — the Status column should say the
      // same thing the native report does instead of just "PASSED".
      outcome: test.outcome(),
      // test.id is Playwright's own hash of file+title+project — the same
      // id the HTML report's "Copy link" button puts in its
      // "#?testId=<id>" deep link, so this reproduces that link without
      // needing to open the report itself. Prefixed with the NETLIFY_BASE_URL
      // sentinel (not a real URL) because the report isn't deployed yet at
      // write time — deploy-reports.cjs replaces the sentinel with the real
      // Netlify URL once the report is actually live.
      testId: test.id,
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

    const geos = [...new Set(rows.map(r => r.geo))];
    // Desktop+mobile runs of the same GEO produce project names like "UK"
    // and "UK-mobile" — strip the "-mobile" suffix before deduping so a
    // combined run is still recognized as a single-GEO run. Computed here
    // (not just below in the baseName block) so both the Excel report's own
    // folder AND its filename land in the same brand+GEO location as
    // playwright.config.ts's outputDir (Test Reports/<BRAND>/<GEO>/).
    const baseGeos = [...new Set(geos.map(g => g.replace(/-mobile$/, '')))];
    const brand = (process.env.TEST_BRAND || 'SC').toUpperCase();
    // Must match playwright.config.ts's own dateStr/reportRoot formula so
    // the Excel file and the HTML report/traces from the same run all land
    // in the same dated folder.
    const dateStr = new Date().toISOString().slice(0, 10);
    const reportRoot = baseGeos.length === 1
      ? `Test Reports/${brand}/${baseGeos[0]}/${dateStr}`
      : `Test Reports/${brand}/_combined-${baseGeos.join('-')}/${dateStr}`;
    const outDir = path.join(__dirname, reportRoot);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    // Open the HTML report's index.html directly via the OS file-open
    // command, instead of relying on Playwright's own `open: 'always'` —
    // confirmed live 2026-08-06 that Playwright's built-in auto-open
    // requires starting a real server, which needs a real TTY and skips
    // entirely when process.env.CLAUDECODE is set (even after clearing it
    // in playwright.config.ts, a real server proved unreliable to keep
    // alive). The report's index.html is fully self-contained (confirmed
    // live: screenshots, steps, and "View Trace" all work with no server
    // running at all), so just opening the file directly sidesteps the
    // whole server/port/TTY problem. Reporters' onEnd hooks run in the same
    // order they're listed in playwright.config.ts (html, json, list, this
    // one last) — by the time this runs, the html reporter's onEnd has
    // already finished writing index.html.
    const { portForKey } = require('./helpers/report-port.cjs');
    const reportKey = `${brand}-${baseGeos.join('-')}-${dateStr}`;
    const reportPort = portForKey(reportKey);
    const reportIndexPath = path.join(outDir, `report-${reportPort}`, 'index.html');
    if (fs.existsSync(reportIndexPath)) {
      // spawn (detached + unref'd), not exec — confirmed live 2026-08-06:
      // exec's child inherits Playwright's own process group/job object on
      // Windows, which gets torn down the instant the test run exits (right
      // after this onEnd finishes), killing "start" before it can actually
      // dispatch the file-open. Detaching lets it survive the parent
      // process exiting.
      const child = require('child_process').spawn('cmd', ['/c', 'start', '', reportIndexPath], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    }

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
    const summaryWs = this._writeSummarySheet(wb);
    // Workbook tab order is driven by each sheet's orderNo (see ExcelJS's
    // own `worksheets` getter), which addWorksheet always assigns as
    // "last + 1" — there's no options.orderNo override at creation time.
    // Setting it lower than every GEO sheet's here is what actually pins
    // Summary to the first tab position once written to disk.
    summaryWs.orderNo = -1;

    if (!appendFile) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 23);
      const uniqueSuites = [...new Set(rows.map(r => r.file).filter(Boolean))];
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
    let grandTotal = 0, grandPassed = 0, grandFailed = 0, grandSkipped = 0, grandFlaky = 0;
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
      const flaky = worksheet.getRow(9).getCell(2).value;
      perSheet.push({ name: worksheet.name, seconds });
      grandTotalSeconds += seconds;
      grandTotal += typeof total === 'number' ? total : 0;
      grandPassed += typeof passed === 'number' ? passed : 0;
      grandFailed += typeof failed === 'number' ? failed : 0;
      grandSkipped += typeof skipped === 'number' ? skipped : 0;
      grandFlaky += typeof flaky === 'number' ? flaky : 0;
    });

    // Coverage = how much of everything that ran was actually exercised
    // (not skipped as "doesn't exist for this GEO/viewport"). Reliability =
    // of what was actually exercised, how much came back clean — a GEO with
    // heavy skips can still be 100% reliable on what it does cover, so these
    // are two separate numbers, not one blended score.
    const ran = grandPassed + grandFailed;
    const coveragePct = grandTotal > 0 ? Math.round((ran / grandTotal) * 1000) / 10 : 0;
    const reliabilityPct = ran > 0 ? Math.round((grandPassed / ran) * 1000) / 10 : 100;

    // "Clean Run" describes the SITE this run — did everything pass. It is
    // NOT a judgment on the automation's quality: a real bug getting caught
    // correctly is the automation doing its job, not failing at it. Keep
    // this separate from Automation Reliability below — conflating the two
    // makes every genuine bug-catch look like a tooling problem.
    const isCleanRun = grandFailed === 0;

    // Automation Reliability asks a different question: can the tooling's
    // verdicts be trusted? Two structural facts back this up rather than
    // guessing: (1) playwright.config.ts sets retries: 1, so anything shown
    // as Failed above already failed on BOTH attempts — a one-off blip
    // would have self-healed on the retry and shown as Flaky instead, never
    // counted as a failure. (2) Flaky checks are tracked and reported
    // separately, not silently absorbed into the pass count. A flaky rate
    // above 0 doesn't mean "unreliable" on its own — it means the tooling
    // is already catching and self-correcting one-off noise instead of
    // misreporting it as a bug or masking it as a clean pass.
    const flakyRatePct = ran > 0 ? Math.round((grandFlaky / ran) * 1000) / 10 : 0;

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
    reliabilityRow.getCell(1).value = '% Passed (pass rate of checks actually run)';
    reliabilityRow.getCell(1).font = { name: 'Arial', bold: true, size: 11 };
    reliabilityRow.getCell(2).value = `${reliabilityPct}%`;
    reliabilityRow.getCell(2).font = { name: 'Arial', bold: true, size: 11, color: { argb: reliabilityPct === 100 ? 'FF00B050' : 'FFC00000' } };
    reliabilityRow.commit();

    const cleanRunRow = ws.getRow(7);
    cleanRunRow.getCell(1).value = 'Clean Run? (site passed everything)';
    cleanRunRow.getCell(1).font = { name: 'Arial', bold: true, size: 11 };
    cleanRunRow.getCell(2).value = isCleanRun
      ? 'Yes — 0 real failures across every GEO/platform in this run'
      : `No — ${grandFailed} real failure(s) found on the site/product this run`;
    cleanRunRow.getCell(2).font = { name: 'Arial', bold: true, size: 11, color: { argb: isCleanRun ? 'FF00B050' : 'FFC00000' } };
    cleanRunRow.commit();

    // Any flakiness at all means "not reliable" — self-healing on retry
    // keeps a flaky check from being misreported as a bug, but it's still
    // a symptom to eliminate, not a pass. Reliable means 0 flaky checks,
    // full stop; anything else calls out exactly what needs fixing so it
    // doesn't quietly become "normal" just because it self-heals.
    const isAutomationReliable = grandFlaky === 0;

    const reliabilityVerdictRow = ws.getRow(8);
    reliabilityVerdictRow.getCell(1).value = 'Automation Reliability (can the tooling be trusted?)';
    reliabilityVerdictRow.getCell(1).font = { name: 'Arial', bold: true, size: 11 };
    reliabilityVerdictRow.getCell(2).value = isAutomationReliable
      ? `Yes — every result this run was reproducible on the first attempt (0 flaky checks), and any real failure shown already failed twice in a row, not a one-off blip`
      : `No — ${grandFlaky} check(s) (${flakyRatePct}% of what ran) needed a retry to pass. They self-healed rather than being misreported as bugs, but flakiness like this should be root-caused and eliminated, not left to keep self-healing`;
    reliabilityVerdictRow.getCell(2).font = { name: 'Arial', bold: true, size: 11, color: { argb: isAutomationReliable ? 'FF00B050' : 'FFC00000' } };
    reliabilityVerdictRow.commit();

    const headerRow = ws.getRow(10);
    ['GEO / Platform', 'Duration'].forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    headerRow.commit();

    perSheet.forEach((s, idx) => {
      const row = ws.getRow(11 + idx);
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
    return ws;
  }

  _writeSheet(ws, rows) {
    const total = rows.length;
    const passed = rows.filter(r => r.status === 'passed').length;
    const failed = rows.filter(r => ['failed', 'timedOut'].includes(r.status)).length;
    const skipped = rows.filter(r => r.status === 'skipped').length;
    // A test that failed once then passed on Playwright's own retry (see
    // playwright.config.ts's retries: 1) self-healed — it's not counted as
    // Failed above, but tracking it separately lets the Summary tab's
    // Automation Reliability metric distinguish "the tooling caught a
    // one-off blip and recovered" from "the tooling is untrustworthy."
    const flaky = rows.filter(r => r.retried && r.status === 'passed').length;
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
      // Appended after the existing rows (not inserted earlier) so every
      // row index _writeSummarySheet already reads by fixed position stays
      // correct — only this new row 9 needs a new read added.
      ['Flaky (Failed Once, Passed on Retry)', flaky],
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
    const headers = ['Test File', 'Test Name', 'Status', 'Duration (s)', 'What Went Wrong', 'Technical Details', 'Side Note (Self-Healed Glitch / Flaky Retry)', 'Shareable Report Link'];
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

    const statusColors = { passed: 'FF0070C0', failed: 'FFC00000', timedOut: 'FFC00000', skipped: 'FFFFC000', flaky: 'FF9C6500' };
    const statusLabels = { passed: 'PASSED', failed: 'FAILED', timedOut: 'TIMED OUT', skipped: 'SKIPPED', flaky: 'FLAKY' };

    rows.forEach((r, idx) => {
      const rowNum = headerRow + 1 + idx;
      const dr = ws.getRow(rowNum);
      const shade = idx % 2 === 0 ? 'FFF2F2F2' : 'FFFFFFFF';
      const testLabel = r.retried
        ? `${r.test} (${r.status === 'passed' ? 'passed after retry' : 'failed even after retry'})`
        : r.test;
      // deploy-reports.cjs finds this by its NETLIFY_BASE_URL sentinel and
      // swaps it for the real site URL once the report's actually deployed —
      // see the testId comment in onTestEnd for why the path itself
      // (<geo>/index.html#?testId=<id>) is stable ahead of that.
      const shareLink = r.testId ? `NETLIFY_BASE_URL/${r.geo}/index.html#?testId=${r.testId}` : '';
      // Matches Playwright's own report, which shows "flaky" as its own
      // outcome rather than folding a failed-then-retried-passed test into
      // plain "PASSED" — see the outcome comment in onTestEnd.
      const displayStatus = r.outcome === 'flaky' ? 'flaky' : r.status;
      const vals = [r.file, testLabel, statusLabels[displayStatus] || displayStatus.toUpperCase(), r.duration_s, r.error, r.errorRaw, r.note || '', shareLink];
      const border = { top: { style: 'thin', color: { argb: 'FFD0D0D0' } }, bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } }, left: { style: 'thin', color: { argb: 'FFD0D0D0' } }, right: { style: 'thin', color: { argb: 'FFD0D0D0' } } };
      vals.forEach((val, ci) => {
        const cell = dr.getCell(ci + 1);
        if (ci === 7 && val) {
          cell.value = { text: 'View Result', hyperlink: val };
          cell.font = { name: 'Arial', size: 10, underline: true, color: { argb: 'FF0563C1' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: shade } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = border;
          return;
        }
        cell.value = val;
        cell.border = border;
        if (ci === 2) {
          cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColors[displayStatus] || 'FF808080' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (ci === 6 && val) {
          // Side note stands out even on an otherwise-passed row — amber,
          // same family as the "skipped" status color, so it reads as
          // "worth a look" without looking like a failure.
          cell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF9C6500' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
          cell.alignment = { vertical: 'middle', wrapText: true };
        } else {
          cell.font = { name: 'Arial', size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: shade } };
          cell.alignment = { vertical: 'middle', wrapText: ci === 4 || ci === 5 };
        }
      });
      dr.commit();
    });

    ws.columns = [{ width: 35 }, { width: 45 }, { width: 14 }, { width: 14 }, { width: 50 }, { width: 55 }, { width: 55 }, { width: 16 }];
    ws.views = [{ state: 'frozen', ySplit: headerRow, activeCell: `A${headerRow + 1}` }];
  }
}

module.exports = ExcelReporter;

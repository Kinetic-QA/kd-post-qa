// Combines every blob report a VPN-switch run produced (one blob per GEO
// invocation, see playwright.config.ts's blobDir/blobFileName) into ONE real
// Playwright HTML report, using Playwright's own `merge-reports` command —
// so the resulting duration/stats are genuinely Playwright's, not something
// our excel-reporter.cjs computed. Run this AFTER the last GEO in the
// sequence finishes. The Excel workbook (see excel-reporter.cjs /
// EXCEL_REPORT_FILE) is untouched by this — it keeps being generated as
// before and remains the backup/detailed report.
//
// Usage: TEST_BRAND=SC node merge-reports.cjs
// Optional: TEST_DATE=2026-08-07 node merge-reports.cjs (defaults to today,
// matching playwright.config.ts's dateStr so it finds the right blob folder)

const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');

const brand = process.env.TEST_BRAND;
if (!brand) {
  console.error('TEST_BRAND is required, e.g.: TEST_BRAND=SC node merge-reports.cjs');
  process.exit(1);
}

const dateStr = process.env.TEST_DATE || new Date().toISOString().slice(0, 10);
const blobDir = path.join('Test Reports', brand, '_blob-reports', dateStr);

// Both mergeInputDir and outputFolder live OUTSIDE blobDir (as siblings, not
// nested inside it) — BUG FIXED 2026-08-07: an earlier version nested
// outputFolder inside blobDir, so a second merge run's recursive zip scan
// picked up the FIRST run's own merged-html-report/data + resources zips as
// if they were fresh blob reports, silently corrupting the merge with stale
// leftovers. Keeping both outside blobDir means blobDir only ever contains
// what playwright.config.ts's blob reporter actually wrote.
const mergeInputDir = path.join('Test Reports', brand, '_blob-reports', `_merge-input-${dateStr}`);
const outputFolder = path.join('Test Reports', brand, '_blob-reports', `${dateStr}-merged-html-report`);

if (!fs.existsSync(blobDir)) {
  console.error(`No blob reports found at "${blobDir}" — run the GEO(s) first (blob reporter is on by default in playwright.config.ts).`);
  process.exit(1);
}

// Each GEO invocation writes into its own subfolder of blobDir (see
// playwright.config.ts's blobDir comment — that per-GEO subfolder is what
// stops Playwright's blob reporter from wiping a previous GEO's zip when
// the next GEO's run starts). But Playwright's own `merge-reports` CLI does
// a plain, NON-recursive fs.readdir() on the directory it's given (confirmed
// by reading node_modules/playwright/lib/runner/index.js's sortedShardFiles)
// — it will never see zips sitting in subfolders. So we still need to find
// them recursively here ourselves, then copy them (flattened) into a fresh
// flat mergeInputDir before handing THAT to the CLI.
function findZipsRecursive(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findZipsRecursive(full);
    return entry.name.endsWith('.zip') ? [full] : [];
  });
}

const blobFiles = findZipsRecursive(blobDir);
if (blobFiles.length === 0) {
  console.error(`"${blobDir}" exists but has no .zip blob reports to merge (searched recursively).`);
  process.exit(1);
}

console.log(`Merging ${blobFiles.length} blob report(s) from ${blobDir}:`);
blobFiles.forEach(f => console.log(`  - ${path.relative(blobDir, f)}`));

fs.rmSync(mergeInputDir, { recursive: true, force: true });
fs.mkdirSync(mergeInputDir, { recursive: true });
for (const f of blobFiles) {
  // Flattened by relative path (subfolder name is already the zip's own
  // name today, e.g. UK-mobile\UK-mobile.zip -> UK-mobile.zip) so distinct
  // GEOs' filenames can't collide once copied into the flat mergeInputDir.
  fs.copyFileSync(f, path.join(mergeInputDir, path.basename(f)));
}

// mergeInputDir lives under "Test Reports" (contains a space), and spawnSync
// with shell: true on Windows does NOT auto-quote array args before handing
// them to cmd.exe — an unquoted space splits it into two positional args,
// which caused "too many arguments for 'merge-reports'. Expected 1 argument
// but got 2" (confirmed live 2026-08-07). Quoting it here fixes that without
// having to disable shell: true (still needed to resolve `npx` on Windows).
const result = spawnSync(
  'npx',
  ['playwright', 'merge-reports', '--config=merge-reports.config.cjs', `"${mergeInputDir}"`],
  {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, MERGE_REPORT_OUTPUT: outputFolder },
  }
);

if (result.status !== 0) {
  console.error('merge-reports failed — see output above.');
  process.exit(result.status || 1);
}

const indexPath = path.join(outputFolder, 'index.html');
console.log(`\nCombined report ready: ${indexPath}`);

// Only delete the raw sources once the merged report is confirmed on disk —
// outputFolder now holds everything (including trace data) that blobDir's
// per-GEO zips and mergeInputDir's flattened copies contained, so keeping
// them around after a successful merge is pure duplication (this is what
// was ballooning Test Reports/<brand>/_blob-reports — confirmed live
// 2026-08-26, raw blobs + merged report each holding a full copy of the
// same trace data).
if (fs.existsSync(indexPath)) {
  fs.rmSync(mergeInputDir, { recursive: true, force: true });
  fs.rmSync(blobDir, { recursive: true, force: true });
  console.log(`Cleaned up raw blob sources: ${blobDir}, ${mergeInputDir}`);
}

// Detached + unref'd for the same reason as excel-reporter.cjs's report-open
// call — this script's own process exiting shouldn't kill the "start" call
// on Windows before it dispatches.
if (fs.existsSync(indexPath)) {
  const child = spawn('cmd', ['/c', 'start', '', indexPath], { detached: true, stdio: 'ignore' });
  child.unref();
}

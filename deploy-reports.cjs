// Publishes one brand+date's Playwright reports to Netlify as a single
// shareable site — one folder per GEO's native HTML report, plus the merged
// report from merge-reports.cjs if it exists — and then rewrites the
// "Shareable Report Link" column (see excel-reporter.cjs) in that date's
// Excel workbook(s) so each row's link points at the real, live URL instead
// of the NETLIFY_BASE_URL placeholder written at test-run time.
//
// Usage: TEST_BRAND=SC node deploy-reports.cjs
// Optional: TEST_DATE=2026-08-07 node deploy-reports.cjs (defaults to today)
// Optional: EXCEL_REPORT_FILE=<name> node deploy-reports.cjs — set this to
// the SAME value used with merge-reports.cjs/excel-reporter.cjs's append
// mode, so this script updates that one combined workbook under
// combined-reports/ instead of scanning Test Reports/ for loose .xlsx files.
//
// Requires the Netlify CLI to be linked to a site once, ahead of time:
//   npx netlify login
//   npx netlify init      (or: npx netlify link, to use an existing site)

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const brand = process.env.TEST_BRAND;
if (!brand) {
  console.error('TEST_BRAND is required, e.g.: TEST_BRAND=SC node deploy-reports.cjs');
  process.exit(1);
}

const dateStr = process.env.TEST_DATE || new Date().toISOString().slice(0, 10);
const brandDir = path.join('Test Reports', brand);

if (!fs.existsSync(brandDir)) {
  console.error(`No "${brandDir}" folder found — run some tests for ${brand} first.`);
  process.exit(1);
}

// Finds the most recently modified report-* folder under a GEO's dated
// folder — there can be more than one if the same GEO/date was run twice.
function latestReportFolder(dir) {
  if (!fs.existsSync(dir)) return null;
  const candidates = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith('report-'))
    .map(e => path.join(dir, e.name));
  if (candidates.length === 0) return null;
  return candidates
    .map(p => ({ p, mtime: fs.statSync(p).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0].p;
}

// Skips trace attachments (data/*.zip) while staging — confirmed live: for
// one GEO's report, those zips alone were 2.6GB vs. 152MB of video + 27MB
// of screenshots, ~17x bigger than the video/screenshot evidence this is
// actually meant to show. Each zip is just the "View Trace" timeline's
// per-frame JPEG snapshots — dropping them shrinks a ~20GB deploy to
// roughly 1GB and only costs the "View Trace" button (404s harmlessly in
// the deployed copy); videos, screenshots, and results are untouched, and
// the full trace data is still sitting in the local Test Reports/ folder
// this never touches.
function isTraceAttachment(dirName, fileName) {
  return dirName === 'data' && fileName.toLowerCase().endsWith('.zip');
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const srcDirName = path.basename(src);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (!entry.isDirectory() && isTraceAttachment(srcDirName, entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// GEO folders are direct children of brandDir that don't start with "_"
// (that prefix is reserved for _blob-reports/_combined-* housekeeping
// folders — see playwright.config.ts and merge-reports.cjs).
const geoDirs = fs.readdirSync(brandDir, { withFileTypes: true })
  .filter(e => e.isDirectory() && !e.name.startsWith('_'))
  .map(e => e.name);

const staged = []; // [{ geo, sourcePath }]
for (const geo of geoDirs) {
  const reportFolder = latestReportFolder(path.join(brandDir, geo, dateStr));
  if (reportFolder) staged.push({ geo, sourcePath: reportFolder });
}

const mergedDir = path.join(brandDir, '_blob-reports', `${dateStr}-merged-html-report`);
const hasMerged = fs.existsSync(mergedDir);

if (staged.length === 0 && !hasMerged) {
  console.error(`No per-GEO report-* folders or merged report found for ${brand} on ${dateStr}.`);
  process.exit(1);
}

const stagingDir = path.join(os.tmpdir(), `netlify-stage-${brand}-${dateStr}`);
fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });

console.log(`Staging ${brand} ${dateStr} reports for deploy (trace .zip attachments skipped):`);
for (const { geo, sourcePath } of staged) {
  console.log(`  - ${geo}  <-  ${sourcePath}`);
  copyDir(sourcePath, path.join(stagingDir, geo));
}
if (hasMerged) {
  console.log(`  - merged  <-  ${mergedDir}`);
  copyDir(mergedDir, path.join(stagingDir, 'merged'));
}

function dirSizeBytes(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSizeBytes(p) : fs.statSync(p).size;
  }
  return total;
}
console.log(`Staged size: ${(dirSizeBytes(stagingDir) / 1024 / 1024).toFixed(0)} MB`);

const indexLinks = staged.map(({ geo }) => `<li><a href="${geo}/index.html">${geo}</a></li>`).join('\n');
const mergedLink = hasMerged ? `<li><a href="merged/index.html">Merged (all GEOs)</a></li>` : '';
fs.writeFileSync(
  path.join(stagingDir, 'index.html'),
  `<!doctype html><html><head><meta charset="utf-8"><title>${brand} — ${dateStr}</title></head>` +
    `<body><h1>${brand} test reports — ${dateStr}</h1><ul>${mergedLink}${indexLinks}</ul></body></html>`
);

console.log('\nDeploying to Netlify...');
// A single quoted command string with shell: true — not an argv array —
// confirmed live: spawnSync('npx.cmd', [...]) fails outright with EINVAL on
// Windows (it can't exec a .cmd file directly without going through a
// shell), and stagingDir needs its own quoting since os.tmpdir() paths can
// contain spaces (e.g. under a "Local Settings"-style profile path).
const deployCmd = `npx netlify deploy --dir "${stagingDir}" --prod --json`;
const deploy = spawnSync(deployCmd, { encoding: 'utf-8', shell: true });

if (deploy.status !== 0) {
  console.error(deploy.stdout);
  console.error(deploy.stderr);
  console.error('\nNetlify deploy failed. If this is the first deploy, run these once first:');
  console.error('  npx netlify login');
  console.error('  npx netlify init      (or: npx netlify link)');
  process.exit(1);
}

let deployResult;
try {
  // netlify deploy --json pretty-prints the JSON blob (confirmed live —
  // multi-line, so the LAST line alone is just "}" and fails to parse on
  // its own) and can also print banners before it — slicing from the
  // first "{" to the end handles both.
  const output = deploy.stdout;
  deployResult = JSON.parse(output.slice(output.indexOf('{')));
} catch (e) {
  console.error('Could not parse Netlify CLI output as JSON:');
  console.error(deploy.stdout);
  process.exit(1);
}

// deploy_url (not url) on purpose — url is the site's PRODUCTION URL, the
// same address every day, so tomorrow's deploy would silently overwrite
// today's content there and break links already pasted into today's Excel
// report. deploy_url is the unique, permanent link Netlify keeps for this
// exact deploy (visible forever in the site's Deploys tab), so each date's
// links keep working no matter how many later deploys happen.
const baseUrl = deployResult.deploy_url || deployResult.url;
if (!baseUrl) {
  console.error('Netlify deploy succeeded but no URL was found in its output:', deployResult);
  process.exit(1);
}
console.log(`\nDeployed: ${baseUrl}`);
for (const { geo } of staged) console.log(`  ${geo}: ${baseUrl}/${geo}/index.html`);
if (hasMerged) console.log(`  Merged: ${baseUrl}/merged/index.html`);

// --- Write the "Shareable Report Link" column's real URLs ---
//
// Delegates to backfill-report-links.cjs (RESOLVED_BASE_URL set) instead of
// patching the placeholder in place. BUG FIXED 2026-08-13: reading an
// existing NETLIFY_BASE_URL hyperlink and rewriting its target in place —
// even as a brand-new { text, hyperlink } object — silently dropped every
// "#?testId=..." fragment on write for a workbook with enough edit history,
// confirmed live via the raw OOXML relationships (every row collapsed to
// the same fragment-less URL). backfill-report-links.cjs writes the
// fragment fresh from results.json in a single pass with no read-existing-
// hyperlink step at all, which doesn't hit whatever in that history
// triggered it.

const targets = [];
if (process.env.EXCEL_REPORT_FILE) {
  const name = process.env.EXCEL_REPORT_FILE;
  targets.push(path.join(__dirname, 'combined-reports', name.endsWith('.xlsx') ? name : `${name}.xlsx`));
} else {
  // No append-mode file named — scan every GEO/_combined-* folder for
  // that date for its own .xlsx (single-run reports each write their own
  // file rather than sharing one — see excel-reporter.cjs's onEnd).
  for (const entry of fs.readdirSync(brandDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dateDir = path.join(brandDir, entry.name, dateStr);
    if (!fs.existsSync(dateDir)) continue;
    for (const f of fs.readdirSync(dateDir)) {
      if (f.endsWith('.xlsx')) targets.push(path.join(dateDir, f));
    }
  }
}

if (targets.length === 0) {
  console.log('\nNo Excel workbook found to update for this brand/date.');
} else {
  for (const t of targets) {
    if (!fs.existsSync(t)) {
      console.log(`\nSkipping missing workbook: ${t}`);
      continue;
    }
    const backfillScript = path.join(__dirname, 'backfill-report-links.cjs');
    const cmd = `node "${backfillScript}" "${t}"`;
    const result = spawnSync(cmd, {
      encoding: 'utf-8',
      shell: true,
      env: { ...process.env, TEST_BRAND: brand, TEST_DATE: dateStr, RESOLVED_BASE_URL: baseUrl },
    });
    console.log(result.stdout);
    if (result.status !== 0) console.error(result.stderr);
  }
}

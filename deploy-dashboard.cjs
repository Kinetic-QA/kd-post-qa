// Publishes the QA Automated Regression Results overview (dashboard/public)
// — plus, optionally, one brand+date's real Playwright reports staged under
// reports/<BRAND>/<DATE>/<GEO>/ — as ONE combined Netlify deploy, to a
// project separate from the team's existing report-hosting site (this one
// lives under Dominik's Netlify account/token, see NETLIFY_AUTH_TOKEN in
// .env). Deliberately does NOT touch the repo's linked .netlify/state.json
// (that's deploy-reports.cjs's site) — this script's own site id is cached
// in dashboard/.netlify-site.json instead.
//
// Usage:
//   node dashboard/build-data.cjs && node deploy-dashboard.cjs
//   TEST_BRAND=SC node deploy-dashboard.cjs         (also stage+link SC's latest reports)
//   TEST_BRAND=SC TEST_DATE=2026-09-09 node deploy-dashboard.cjs

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { stripTraceButtons } = require('./strip-trace-buttons.cjs');
require('dotenv').config();

const SITE_NAME = 'qa-automated-regression-results';
const ROOT = __dirname;
const DASHBOARD_PUBLIC = path.join(ROOT, 'dashboard', 'public');
const SITE_STATE_FILE = path.join(ROOT, 'dashboard', '.netlify-site.json');

const token = process.env.NETLIFY_AUTH_TOKEN;
if (!token) {
  console.error('NETLIFY_AUTH_TOKEN is not set in .env — paste Dominik\'s personal access token there first.');
  process.exit(1);
}
const netlifyEnv = { ...process.env, NETLIFY_AUTH_TOKEN: token };

function run(cmd) {
  const result = spawnSync(cmd, { encoding: 'utf-8', shell: true, env: netlifyEnv });
  return result;
}

// --- Same "skip trace .zip attachments" optimization as deploy-reports.cjs ---
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

function dirSizeBytes(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSizeBytes(p) : fs.statSync(p).size;
  }
  return total;
}

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

// --- 1. Ensure the site exists (create once, cache its id) ---
function ensureSite() {
  if (fs.existsSync(SITE_STATE_FILE)) {
    const state = JSON.parse(fs.readFileSync(SITE_STATE_FILE, 'utf-8'));
    if (state.siteId) return state;
  }

  console.log(`Creating Netlify site "${SITE_NAME}" under the linked account...`);
  // --account-slug required — sites:create can't infer a team/account from
  // a plain personal access token alone in non-interactive mode (confirmed
  // live: "No teams available" without it). dominik-k-6nzc8qk is the only
  // account this token's GET /accounts returns.
  const create = run(`npx netlify sites:create --name ${SITE_NAME} --account-slug dominik-k-6nzc8qk --json`);
  if (create.status !== 0) {
    console.error(create.stdout);
    console.error(create.stderr);
    process.exit(1);
  }
  let info;
  try {
    info = JSON.parse(create.stdout.slice(create.stdout.indexOf('{')));
  } catch {
    console.error('Could not parse `netlify sites:create` output:', create.stdout);
    process.exit(1);
  }
  const state = { siteId: info.site_id || info.id, name: info.name, url: info.url || info.ssl_url };
  fs.mkdirSync(path.dirname(SITE_STATE_FILE), { recursive: true });
  fs.writeFileSync(SITE_STATE_FILE, JSON.stringify(state, null, 2));
  console.log(`Created: ${state.url} (site id ${state.siteId})`);
  return state;
}

// --- 2. Optionally stage one brand+date's per-GEO reports under reports/<BRAND>/<DATE>/ ---
async function stageReports(brand, dateStr) {
  const brandDir = path.join(ROOT, 'Test Reports', brand);
  if (!fs.existsSync(brandDir)) {
    console.log(`No "Test Reports/${brand}" folder found — skipping report staging.`);
    return { staged: [], hasMerged: false };
  }

  const geoDirs = fs.readdirSync(brandDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('_'))
    .map(e => e.name);

  const staged = [];
  const destRoot = path.join(DASHBOARD_PUBLIC, 'reports', brand, dateStr);
  fs.rmSync(destRoot, { recursive: true, force: true });

  for (const geo of geoDirs) {
    const reportFolder = latestReportFolder(path.join(brandDir, geo, dateStr));
    if (!reportFolder) continue;
    console.log(`  staging ${geo}  <-  ${reportFolder}`);
    const dest = path.join(destRoot, geo);
    copyDir(reportFolder, dest);
    // Trace .zip files are never uploaded (isTraceAttachment above), but the
    // report's own embedded metadata still listed a trace attachment for
    // every test — leaving a Trace button that looked clickable but 404'd.
    // Strip those attachment entries from the staged copy only, so the
    // report's UI simply never renders the button at all.
    await stripTraceButtons(path.join(dest, 'index.html'));
    staged.push(geo);
  }

  const mergedDir = path.join(brandDir, '_blob-reports', `${dateStr}-merged-html-report`);
  const hasMerged = fs.existsSync(mergedDir);
  if (hasMerged) {
    console.log(`  staging merged  <-  ${mergedDir}`);
    const mergedDest = path.join(destRoot, 'merged');
    copyDir(mergedDir, mergedDest);
    await stripTraceButtons(path.join(mergedDest, 'index.html'));
  }

  if (staged.length > 0 || hasMerged) {
    const indexLinks = staged.map(geo => `<li><a href="${geo}/index.html">${geo}</a></li>`).join('\n');
    const mergedLink = hasMerged ? `<li><a href="merged/index.html">Merged (all GEOs)</a></li>` : '';
    fs.writeFileSync(
      path.join(destRoot, 'index.html'),
      `<!doctype html><html><head><meta charset="utf-8"><title>${brand} — ${dateStr}</title></head>` +
        `<body><h1>${brand} test reports — ${dateStr}</h1><ul>${mergedLink}${indexLinks}</ul></body></html>`
    );
  }

  return { staged, hasMerged };
}

// --- 3. Point today's overview data at the staged reports ---
function linkReportUrlsInData(brand, dateStr, geos) {
  const dataPath = path.join(DASHBOARD_PUBLIC, 'data.json');
  if (!fs.existsSync(dataPath)) return;
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  const urlFor = geo => `reports/${brand}/${dateStr}/${geo}/index.html`;

  for (const day of data.days || []) {
    if (day.date !== dateStr) continue;
    for (const entry of day.entries) {
      if (entry.brand === brand && geos.includes(entry.geo)) entry.reportUrl = urlFor(entry.geo);
    }
  }
  for (const t of data.tests || []) {
    if (t.date === dateStr && t.brand === brand && geos.includes(t.geo)) t.reportUrl = urlFor(t.geo);
  }

  fs.writeFileSync(dataPath, JSON.stringify(data));
}

// --- 4. Deploy the combined dashboard/public dir ---
function deploy(siteId) {
  const sizeMb = (dirSizeBytes(DASHBOARD_PUBLIC) / 1024 / 1024).toFixed(0);
  console.log(`\nDeploying dashboard/public (${sizeMb} MB) to Netlify site ${siteId}...`);
  const deployCmd = `npx netlify deploy --dir "${DASHBOARD_PUBLIC}" --site ${siteId} --prod --json`;
  const result = run(deployCmd);
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    process.exit(1);
  }
  let info;
  try {
    info = JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
  } catch {
    console.error('Could not parse `netlify deploy` output:', result.stdout);
    process.exit(1);
  }
  return info;
}

// --- 5. Backfill the brand's Excel workbook's Shareable Report Link column ---
function backfillLinks(brand, dateStr, baseUrl) {
  const combinedDir = path.join(ROOT, 'combined-reports');
  // A brand/date can now have more than one combined workbook — the GUI
  // gives every session its own <brand>-<date>-<run-token>.xlsx (see
  // gui/server.ts's excelReportFile) so same-day reruns don't collide —
  // so guessing a single "<brand>-<date>.xlsx" name here would silently
  // miss every one of them. Backfill every matching workbook instead,
  // unless EXCEL_REPORT_FILE names one file explicitly.
  const explicit = process.env.EXCEL_REPORT_FILE;
  const namePattern = new RegExp(`^${brand}-${dateStr}(-\\d{2}-\\d{2}-\\d{2})?\\.xlsx$`);
  const targets = explicit
    ? [path.join(combinedDir, explicit.endsWith('.xlsx') ? explicit : `${explicit}.xlsx`)]
    : fs.existsSync(combinedDir)
      ? fs.readdirSync(combinedDir).filter(f => namePattern.test(f)).map(f => path.join(combinedDir, f))
      : [];

  if (targets.length === 0) {
    console.log(`\nNo combined workbook found for ${brand} ${dateStr} in ${combinedDir} — skipping link backfill.`);
    return;
  }

  for (const target of targets) {
    if (!fs.existsSync(target)) {
      console.log(`\nNo combined workbook found at ${target} — skipping link backfill.`);
      continue;
    }
    const cmd = `node "${path.join(ROOT, 'backfill-report-links.cjs')}" "${target}"`;
    const result = spawnSync(cmd, {
      encoding: 'utf-8',
      shell: true,
      env: { ...process.env, TEST_BRAND: brand, TEST_DATE: dateStr, RESOLVED_BASE_URL: `${baseUrl}/reports/${brand}/${dateStr}` },
    });
    console.log(result.stdout);
    if (result.status !== 0) console.error(result.stderr);
  }
}

(async function main() {
  const brand = process.env.TEST_BRAND;
  const dateStr = process.env.TEST_DATE || new Date().toISOString().slice(0, 10);

  const site = ensureSite();

  let staged = [];
  if (brand) {
    console.log(`Staging ${brand} ${dateStr} reports (trace .zip attachments skipped):`);
    const result = await stageReports(brand, dateStr);
    staged = result.staged;
    linkReportUrlsInData(brand, dateStr, staged);
  }

  const deployResult = deploy(site.siteId);
  const deployUrl = deployResult.deploy_url || deployResult.url;
  const prodUrl = deployResult.url || deployUrl;
  console.log(`\nDeployed overview: ${prodUrl}`);
  if (staged.length > 0) {
    for (const geo of staged) console.log(`  ${geo}: ${deployUrl}/reports/${brand}/${dateStr}/${geo}/index.html`);
  }

  if (brand && staged.length > 0) {
    backfillLinks(brand, dateStr, deployUrl);
  }
})();

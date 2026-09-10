// Auto-upload for the "Done Today's test" trigger (see CLAUDE.md).
// Scans Test Reports/<brand>/<geo>/<date>/ for whichever brand(s) have a
// folder dated today, rebuilds the dashboard's data.json snapshot, then
// deploys the overview + each detected brand's per-GEO reports to the
// QA Automated Regression Results Netlify site — same steps
// deploy-dashboard.cjs's own header comment describes, just run
// automatically for every brand touched today instead of one at a time by
// hand.
//
// Usage:
//   node upload-todays-results.cjs                  (today's date)
//   TEST_DATE=2026-09-10 node upload-todays-results.cjs   (a specific date)

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const TEST_REPORTS = path.join(ROOT, 'Test Reports');

// TESTORDER is a leftover pipeline-testing scaffold, not a real brand — skip
// it so a stray folder never gets "uploaded" to the team-facing site.
const EXCLUDE_BRANDS = new Set(['TESTORDER']);

const dateStr = process.env.TEST_DATE || new Date().toISOString().slice(0, 10);

function detectBrandsTestedOn(targetDate) {
  if (!fs.existsSync(TEST_REPORTS)) return [];
  const brands = [];
  for (const brandEntry of fs.readdirSync(TEST_REPORTS, { withFileTypes: true })) {
    if (!brandEntry.isDirectory() || EXCLUDE_BRANDS.has(brandEntry.name)) continue;
    const brandDir = path.join(TEST_REPORTS, brandEntry.name);
    const geoDirs = fs.readdirSync(brandDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('_'));
    const hasToday = geoDirs.some(geo => fs.existsSync(path.join(brandDir, geo.name, targetDate)));
    if (hasToday) brands.push(brandEntry.name);
  }
  return brands.sort();
}

function run(cmd, extraEnv = {}) {
  console.log(`\n> ${cmd}`);
  const result = spawnSync(cmd, { stdio: 'inherit', shell: true, env: { ...process.env, ...extraEnv } });
  if (result.status !== 0) {
    console.error(`\nCommand failed (exit ${result.status}): ${cmd}`);
    process.exit(1);
  }
}

(function main() {
  const brands = detectBrandsTestedOn(dateStr);
  if (brands.length === 0) {
    console.log(
      `No "Test Reports/<brand>/<geo>/${dateStr}" folders found — nothing to upload.\n` +
      `If today's run used a different date, re-run with TEST_DATE=YYYY-MM-DD.`
    );
    return;
  }

  console.log(`Detected brand(s) tested on ${dateStr}: ${brands.join(', ')}`);

  run('node dashboard/build-data.cjs');

  for (const brand of brands) {
    run('node deploy-dashboard.cjs', { TEST_BRAND: brand, TEST_DATE: dateStr });
  }

  console.log(
    `\nDone — uploaded ${brands.length} brand(s) for ${dateStr} to ` +
    `https://qa-automated-regression-results.netlify.app`
  );
})();

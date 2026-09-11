// Keeps disk usage bounded now that same-day reruns of the same brand/GEO
// each get their own isolated run-<token>/test-results folder and their own
// report-<port> HTML report (see playwright.config.ts) instead of
// overwriting the previous run's — without this, screenshots/videos/traces
// from every rerun would accumulate forever, undoing the 2026-08-26 disk
// cleanup (Test Reports/ had hit 127GB). Only those two heavy per-run
// folders are pruned; the xlsx report(s) for a date are left untouched
// (kilobytes each, and keeping every run's summary as an audit trail is the
// whole point of distinguishing runs in the first place).
const fs = require('fs');
const path = require('path');

const DEFAULT_KEEP = Number(process.env.RUN_RETENTION_COUNT) || 3;

function pruneDir(dir, prefix, keep) {
  if (!fs.existsSync(dir)) return;
  const candidates = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith(prefix))
    .map(e => ({ name: e.name, mtime: fs.statSync(path.join(dir, e.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const stale of candidates.slice(keep)) {
    fs.rmSync(path.join(dir, stale.name), { recursive: true, force: true });
  }
}

// Prunes Test Reports/<brand>/<geo>/<date>/'s run-<token>/ (test-results:
// screenshots/videos/traces) and report-<port>/ (HTML report) folders down
// to the most recent `keep` of each — newest kept, oldest deleted first.
// Safe to call after every run: a day with <= keep runs so far is a no-op.
function pruneOldRuns(brand, geo, dateStr, keep = DEFAULT_KEEP) {
  const dateDir = path.join(process.cwd(), 'Test Reports', brand, geo, dateStr);
  try {
    pruneDir(dateDir, 'run-', keep);
    pruneDir(dateDir, 'report-', keep);
  } catch (err) {
    console.error(`[prune-old-runs] Failed to prune ${dateDir}:`, err.message);
  }
}

module.exports = { pruneOldRuns };

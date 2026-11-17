// What the public Netlify overview already knows, so a new snapshot is built on
// top of it instead of replacing it. Every machine only has its own Test
// Reports/, so a snapshot built from local files alone drops any run that was
// only ever tested on another machine (2026-11-13: the second laptop's upload
// removed the 10-29..10-31 ES runs from the site).
//
// The site carries history.json (every run + every test, written by
// build-data.cjs). A site that predates it is rebuilt from data.json instead.

const SITE_URL = process.env.LIVE_SITE_URL || 'https://qa-automated-regression-results.netlify.app';

async function fetchJson(file) {
  const res = await fetch(`${SITE_URL}/${file}?nocache=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${SITE_URL}/${file} answered ${res.status}`);
  try {
    return await res.json();
  } catch {
    // A missing file can come back as the site's HTML 404 page with a 200.
    return null;
  }
}

// data.json only lists each past run's pass/fail counts, plus the tests of each
// brand's latest run — enough to put every run back, with total/skipped worked
// out from the tests where they're present.
function runsFromDataJson(data) {
  const testsByRun = new Map();
  for (const t of data.tests || []) {
    const k = `${t.brand}|${t.geo}|${t.date}`;
    if (!testsByRun.has(k)) testsByRun.set(k, []);
    testsByRun.get(k).push(t);
  }
  const runs = [];
  for (const day of data.days || []) {
    for (const e of day.entries || []) {
      const tests = testsByRun.get(`${e.brand}|${e.geo}|${day.date}`) || [];
      const executed = (e.passed || 0) + (e.failed || 0) + (e.flaky || 0);
      const skipped = tests.filter(t => t.status === 'skipped').length;
      runs.push({
        brand: e.brand, geo: e.geo, date: day.date, runTime: e.runTime,
        total: Math.max(tests.length, executed + skipped), passed: e.passed || 0, failed: e.failed || 0,
        skipped, flaky: e.flaky || 0, specs: e.specs || [], reportUrl: e.reportUrl,
      });
    }
  }
  return { runs, tests: data.tests || [] };
}

// Returns { runs, tests, source }. A site with nothing published yet is an empty
// base; any other failure throws, because deploying on top of an unknown site
// is exactly the wipe this exists to prevent.
async function loadLiveBase() {
  const history = await fetchJson('history.json');
  if (history && Array.isArray(history.runs)) {
    return { runs: history.runs, tests: history.tests || [], source: 'history.json' };
  }
  const data = await fetchJson('data.json');
  if (data) return { ...runsFromDataJson(data), source: 'data.json (no history.json on the site yet)' };
  return { runs: [], tests: [], source: 'nothing published yet' };
}

// Same rule build-data.cjs's keepFullRunPerGeoDay uses within one machine, applied
// across machines: for one brand+GEO+day the fullest run wins, newest on a tie.
// `pinned` (the run just reviewed in the GUI) always wins over what's live.
function mergeWithLive(base, local, isPinned = () => false) {
  const keyOf = r => `${r.brand}|${r.geo}|${r.date}`;
  const baseByKey = new Map(base.runs.map(r => [keyOf(r), r]));
  const localWins = new Set();
  for (const r of local.runs) {
    const b = baseByKey.get(keyOf(r));
    if (!b || isPinned(r) || r.total > b.total || (r.total === b.total && String(r.runTime) >= String(b.runTime))) {
      localWins.add(keyOf(r));
    }
  }
  const localKeys = new Set(local.runs.map(keyOf));
  const runs = [
    ...base.runs.filter(r => !localWins.has(keyOf(r))),
    ...local.runs.filter(r => localWins.has(keyOf(r))),
  ];
  const tests = [
    ...base.tests.filter(t => !localWins.has(keyOf(t))),
    ...local.tests.filter(t => localWins.has(keyOf(t))),
  ];
  const fromLive = runs.filter(r => !localKeys.has(keyOf(r)) || !localWins.has(keyOf(r))).length;
  return { runs, tests, fromLive };
}

module.exports = { loadLiveBase, mergeWithLive, runsFromDataJson };

// Facts about ONE failed check, gathered without any guessing, so Review and the
// Jira draft can reason from evidence instead of only the test's own error text.
//
// Four sources, each one a plain sentence (or nothing when there is nothing to
// say — never a made-up line):
//   1. Which step of the test stopped.
//   2. What the recorded browser activity (trace.zip) shows: pages the server
//      answered with an error, addresses with an unfilled placeholder (such as
//      "/slingo/:gameSlug/"), and links in the saved page snapshot that have one.
//   3. How the same check did in earlier runs, and whether the test script
//      changed between the last good run and the failing one (from git).
//   4. A read-only re-check of any page the server refused: does it still fail?
//
// Everything here only READS (files, git log, a plain GET of a public page).

import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import JSZip from 'jszip';
import { cleanStep } from './plain-error';

export type FactsInput = {
  brand: string;
  geo: string;
  dateStr: string;
  platform: 'Desktop' | 'Mobile';
  title: string;
  specFile?: string;
  // The failing run's "test-results" folder (its parent is "run-HH-MM-SS").
  resultsDir: string | null;
  tracePath: string | null;
  errorContext: string | null;
  failedStep: string | null;
};

export type FailureFacts = { lines: string[] };

type Deps = {
  reportsRoot: string;
  repoRoot: string;
  fetchFn?: typeof fetch;
  now?: () => number;
};

const HISTORY_DAYS = 7;
const MAX_TRACE_BYTES = 150 * 1024 * 1024;
const MAX_PAGE_ERRORS = 3;

const cache = new Map<string, Promise<FailureFacts>>();
const CACHE_MS = 2 * 60 * 1000;

const PLACEHOLDER_SEGMENT = /\/(:[A-Za-z][A-Za-z0-9_]*)(?=[/?#]|$)/;

function sameSite(host: string, base: string): boolean {
  return host === base || host.endsWith(`.${base}`);
}

type PageError = { url: string; status: number };

async function readTrace(tracePath: string): Promise<{ pageErrors: PageError[]; serverErrors: PageError[] }> {
  const empty = { pageErrors: [], serverErrors: [] };
  try {
    if (fs.statSync(tracePath).size > MAX_TRACE_BYTES) return empty;
    const zip = await JSZip.loadAsync(fs.readFileSync(tracePath));
    const networkFiles = Object.keys(zip.files).filter(n => n.endsWith('trace.network'));
    const rows: Array<{ url: string; status: number; mime: string; method: string }> = [];
    for (const name of networkFiles) {
      const text = await zip.files[name].async('string');
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          const s = JSON.parse(line)?.snapshot;
          if (!s?.request?.url || typeof s?.response?.status !== 'number') continue;
          rows.push({
            url: String(s.request.url),
            status: s.response.status,
            mime: String(s.response.content?.mimeType ?? ''),
            method: String(s.request.method ?? 'GET'),
          });
        } catch { /* a damaged line is skipped */ }
      }
    }
    const firstPage = rows.find(r => r.mime.startsWith('text/html') && /^https?:/.test(r.url));
    if (!firstPage) return empty;
    const base = new URL(firstPage.url).hostname.replace(/^www\./, '');
    const seen = new Set<string>();
    const pageErrors: PageError[] = [];
    const serverErrors: PageError[] = [];
    for (const r of rows) {
      if (r.status < 400 || r.method !== 'GET' || !/^https?:/.test(r.url)) continue;
      let host: string;
      try { host = new URL(r.url).hostname; } catch { continue; }
      if (!sameSite(host, base)) continue;
      const key = `${r.status} ${r.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (r.mime.startsWith('text/html')) pageErrors.push({ url: r.url, status: r.status });
      else if (r.status >= 500) serverErrors.push({ url: r.url, status: r.status });
    }
    return { pageErrors, serverErrors };
  } catch {
    return empty;
  }
}

function placeholderLinks(errorContext: string | null): string[] {
  if (!errorContext) return [];
  let text: string;
  try { text = fs.readFileSync(errorContext, 'utf8').slice(0, 400_000); } catch { return []; }
  const found = new Set<string>();
  for (const m of text.matchAll(/\/url:\s*"?(https?:\/\/[^\s"]+)/g)) {
    if (PLACEHOLDER_SEGMENT.test(new URL(m[1], 'http://x').pathname)) found.add(m[1]);
  }
  return [...found];
}

function describeStatus(status: number): string {
  if (status === 404) return 'HTTP 404, "page not found"';
  if (status === 403) return 'HTTP 403, "forbidden"';
  if (status >= 500) return `HTTP ${status}, a server error`;
  return `HTTP ${status}`;
}

type PastResult = { atMs: number; label: string; status: 'passed' | 'failed' | 'flaky' | 'skipped' };

function readPastResults(input: FactsInput, deps: Deps): PastResult[] {
  const out: PastResult[] = [];
  const dayDirs = (geoDir: string) => (fs.existsSync(geoDir) ? fs.readdirSync(geoDir, { withFileTypes: true }) : [])
    .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name) && e.name <= input.dateStr)
    .map(e => e.name)
    .sort()
    .slice(-HISTORY_DAYS);
  const geoDir = path.join(deps.reportsRoot, input.brand, input.geo);
  for (const day of dayDirs(geoDir)) {
    const dayDir = path.join(geoDir, day);
    for (const run of fs.readdirSync(dayDir, { withFileTypes: true })) {
      const stamp = /^run-(\d{2})-(\d{2})-(\d{2})$/.exec(run.name);
      if (!run.isDirectory() || !stamp) continue;
      const resultsDir = path.join(dayDir, run.name, 'test-results');
      const resultsFile = path.join(resultsDir, 'results.json');
      if (!fs.existsSync(resultsFile)) continue;
      const atMs = new Date(`${day}T${stamp[1]}:${stamp[2]}:${stamp[3]}`).getTime();
      try {
        const json = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
        const walk = (suite: any): void => {
          for (const spec of suite.specs ?? []) {
            if (spec.title !== input.title) continue;
            for (const test of spec.tests ?? []) {
              const isMobile = /mobile/i.test(String(test.projectName ?? ''));
              if ((input.platform === 'Mobile') !== isMobile) continue;
              const status = test.status === 'expected' ? 'passed' : test.status === 'unexpected' ? 'failed' : test.status === 'flaky' ? 'flaky' : test.status === 'skipped' ? 'skipped' : null;
              if (status) out.push({ atMs, label: `${day} ${stamp[1]}:${stamp[2]}`, status });
            }
          }
          for (const s of suite.suites ?? []) walk(s);
        };
        for (const s of json.suites ?? []) walk(s);
      } catch { /* an unreadable results file is skipped */ }
    }
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

/** Test-script files changed in git between two moments, or null if git could not say. */
function gitFilesBetween(deps: Deps, fromMs: number, toMs: number): Promise<string[] | null> {
  return new Promise(resolve => {
    execFile(
      'git',
      ['log', `--since=${new Date(fromMs).toISOString()}`, `--until=${new Date(toMs).toISOString()}`, '--name-only', '--format=', '--', 'tests', 'helpers'],
      { cwd: deps.repoRoot, timeout: 10_000 },
      (err, stdout) => resolve(err ? null : [...new Set(stdout.split('\n').map(l => l.trim()).filter(Boolean))]),
    );
  });
}

function prettyWhen(label: string, nowMs: number): string {
  const [day, time] = label.split(' ');
  const today = new Date(nowMs);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return day === todayStr ? `${time} today` : `${day} ${time}`;
}

async function historyLines(input: FactsInput, deps: Deps): Promise<string[]> {
  if (!input.resultsDir) return [];
  const stamp = /run-(\d{2})-(\d{2})-(\d{2})$/.exec(path.basename(path.dirname(input.resultsDir)));
  if (!stamp) return [];
  const thisMs = new Date(`${input.dateStr}T${stamp[1]}:${stamp[2]}:${stamp[3]}`).getTime();
  const nowMs = (deps.now ?? Date.now)();
  const earlier = readPastResults(input, deps).filter(r => r.atMs < thisMs - 1000).slice(-4);
  if (earlier.length === 0) return [];
  const lines = [`Earlier results for this same check (${input.brand} ${input.geo}, ${input.platform}): ${earlier.map(r => `${r.status} at ${prettyWhen(r.label, nowMs)}`).join('; ')}.`];
  const lastGood = [...earlier].reverse().find(r => r.status === 'passed');
  const previous = earlier[earlier.length - 1];
  if (lastGood && previous.status === 'passed') {
    const files = await gitFilesBetween(deps, lastGood.atMs, thisMs);
    const when = prettyWhen(lastGood.label, nowMs);
    const ownFile = input.specFile ? path.basename(input.specFile) : '';
    if (files === null) lines.push(`It passed in the previous run (${when}).`);
    else if (files.length === 0) lines.push(`It passed in the previous run (${when}) and no test script file has changed since then, according to the project's history, so the difference most likely comes from the site.`);
    else {
      const touchesOwn = ownFile !== '' && files.some(f => path.basename(f) === ownFile);
      const shown = files.slice(0, 5).join(', ') + (files.length > 5 ? ` and ${files.length - 5} more` : '');
      lines.push(`It passed in the previous run (${when}). Since then these test script files changed: ${shown}. ${touchesOwn ? "That includes this check's own file, so a script cause is possible." : "That does not include this check's own file, but shared helper files can still affect it."}`);
    }
  }
  return lines;
}

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0 Safari/537.36';

async function recheck(url: string, deps: Deps): Promise<string> {
  const doFetch = deps.fetchFn ?? fetch;
  try {
    const res = await doFetch(url, { redirect: 'follow', headers: { 'user-agent': BROWSER_UA }, signal: AbortSignal.timeout(10_000) });
    const cloudflare = (res.status === 403 || res.status === 503) && (/cloudflare/i.test(res.headers.get('server') ?? '') || res.headers.has('cf-mitigated'));
    if (cloudflare) return `Could not re-check ${url}: the site's bot protection blocked the request.`;
    if (res.status >= 400) return `Checked again just now: ${url} still returns ${describeStatus(res.status)}.`;
    return `Checked again just now: ${url} now loads fine (HTTP ${res.status}), so the problem may have been temporary.`;
  } catch (e) {
    return `Could not re-check ${url}: ${e instanceof Error ? e.message : String(e)}.`;
  }
}

async function gather(input: FactsInput, deps: Deps): Promise<FailureFacts> {
  const lines: string[] = [];
  if (input.failedStep) lines.push(`The check stopped at the step "${cleanStep(input.failedStep)}".`);

  const trace = input.tracePath && fs.existsSync(input.tracePath) ? await readTrace(input.tracePath) : { pageErrors: [], serverErrors: [] };
  const recheckUrls: string[] = [];
  for (const e of trace.pageErrors.slice(0, MAX_PAGE_ERRORS)) {
    lines.push(`A page the test opened, ${e.url}, was answered by the site with ${describeStatus(e.status)}.`);
    const ph = PLACEHOLDER_SEGMENT.exec(new URL(e.url).pathname);
    if (ph) lines.push(`That address contains an unfilled placeholder ("${ph[1]}"), so it was built from a template whose real value was never filled in.`);
    recheckUrls.push(e.url);
  }
  if (trace.pageErrors.length > MAX_PAGE_ERRORS) lines.push(`${trace.pageErrors.length - MAX_PAGE_ERRORS} more page${trace.pageErrors.length - MAX_PAGE_ERRORS === 1 ? '' : 's'} also failed to load.`);
  for (const e of trace.serverErrors.slice(0, 2)) lines.push(`The site's data service reported a server error (${describeStatus(e.status)}) for ${e.url}.`);

  const links = placeholderLinks(input.errorContext);
  if (links.length > 0) lines.push(`${links.length} link${links.length === 1 ? '' : 's'} on the page ${links.length === 1 ? 'has' : 'have'} an unfilled placeholder instead of a real address, for example ${links[0]}.`);

  lines.push(...await historyLines(input, deps));

  for (const url of recheckUrls.slice(0, 2)) lines.push(await recheck(url, deps));
  return { lines };
}

/** Cached for two minutes per failing check, so Review and the ticket draft share one look. */
export function gatherFailureFacts(input: FactsInput, deps: Deps): Promise<FailureFacts> {
  const bucket = Math.floor((deps.now ?? Date.now)() / CACHE_MS);
  const key = `${bucket}|${input.brand}|${input.geo}|${input.dateStr}|${input.platform}|${input.title}|${input.tracePath ?? ''}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = gather(input, deps).catch(() => ({ lines: [] }));
    cache.set(key, hit);
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  }
  return hit;
}

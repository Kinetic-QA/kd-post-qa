// GUI for triggering Playwright runs without the CLI. Brand/GEO options come
// from helpers/brand-urls.ts (single source of truth, same one agent.ts
// uses); spec options come from scanning tests/p1|p2|p3 on disk. Device
// picks between the default desktop project and the "<geo>-mobile" project
// playwright.config.ts only creates when TEST_MOBILE=true (see its
// TEST_MOBILE block) — --project targets exactly one so runs stay single-
// project regardless of device choice.
//
// brand/geo/device/spec arrive as client-controlled query params and flow
// into a shell-spawned command (spawn(..., { shell: true })), so each is
// validated against a real whitelist (BRAND_URLS combos, on-disk spec
// files, the two device literals) before being used — never interpolated
// as-is.
import express from 'express';
import multer from 'multer';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import axios from 'axios';
import ExcelJS from 'exceljs';
import { BRAND_URLS } from '../helpers/brand-urls';
import { captureFullPageScreenshot, captureMultipleFrames, captureWithPopupWait, captureSiteText, rasterizeSvgToPng, cropRegion } from './screenshot-capture';
import { compareVisual, compareText, MODEL, VisualCheckMode, VisualStatus, VisualCompareResult } from './visual-compare';
import { crawlSite } from './site-crawler';

dotenv.config();

const app = express();
const PORT = Number(process.env.GUI_PORT) || 4848;

// Mirrors the desktop Notification alerts in app.js so the same VPN-switch
// and run-finished pings also land on Slack (and your phone). Optional —
// SLACK_WEBHOOK_URL is unset by default, and a failed post never breaks the
// run, it just logs and moves on.
async function notifySlack(text: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await axios.post(webhookUrl, {
      text,
      // Both optional — Slack falls back to the app's own name/icon (set
      // under the app's "App Home" page) when these are unset. icon_emoji
      // (e.g. ":robot_face:") wins over icon_url if both are set.
      ...(process.env.SLACK_BOT_USERNAME ? { username: process.env.SLACK_BOT_USERNAME } : {}),
      ...(process.env.SLACK_BOT_ICON_EMOJI
        ? { icon_emoji: process.env.SLACK_BOT_ICON_EMOJI }
        : process.env.SLACK_BOT_ICON_URL
        ? { icon_url: process.env.SLACK_BOT_ICON_URL }
        : {}),
    });
  } catch (err) {
    console.error('Slack notification failed:', err instanceof Error ? err.message : err);
  }
}

// Sums the same fixed summary rows excel-reporter.cjs writes into each
// sheet (row 2 Total, 3 Passed, 4 Failed, 5 Skipped — see scanRunReports
// below) so the Slack ping can show a one-line pass/fail count without a
// separate parse of the run's stdout. geoFilter narrows to one GEO's
// sheet(s) (stripping "-mobile"); omit it to sum the whole workbook.
// Returns null if the workbook isn't there yet or fails to parse — callers
// fall back to omitting the summary rather than failing the notification.
async function readExcelSummary(
  excelPath: string,
  geoFilter?: string
): Promise<{ total: number; passed: number; failed: number; skipped: number } | null> {
  if (!fs.existsSync(excelPath)) return null;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(excelPath);
    let total = 0, passed = 0, failed = 0, skipped = 0;
    wb.eachSheet(sheet => {
      if (sheet.name === 'Summary') return;
      if (geoFilter && sheet.name.replace(/-mobile$/, '') !== geoFilter) return;
      total += Number(sheet.getRow(2).getCell(2).value) || 0;
      passed += Number(sheet.getRow(3).getCell(2).value) || 0;
      failed += Number(sheet.getRow(4).getCell(2).value) || 0;
      skipped += Number(sheet.getRow(5).getCell(2).value) || 0;
    });
    return { total, passed, failed, skipped };
  } catch {
    return null;
  }
}

function formatSummary(s: { total: number; passed: number; failed: number; skipped: number } | null): string {
  if (!s || s.total === 0) return '';
  const icon = s.failed > 0 ? '❌' : '✅';
  const skippedPart = s.skipped > 0 ? `, ${s.skipped} skipped` : '';
  return ` ${icon} ${s.passed} passed, ${s.failed} failed${skippedPart}`;
}

const TEST_TIERS = ['p1', 'p2', 'p3'] as const;
const ALL_SPECS_VALUE = '__all__';

// Turns a filename like "feedback-form.spec.ts" into "Feedback Form" for
// the dropdown — the tier folder (p1/p2/p3) only matters for locating the
// file on disk, not for what a non-technical user picks from.
function humanizeSpecName(file: string): string {
  return file
    .replace(/\.spec\.ts$/, '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function discoverSpecs(): Array<{ value: string; label: string }> {
  const specs: Array<{ value: string; label: string }> = [];
  for (const tier of TEST_TIERS) {
    const dir = path.join(process.cwd(), 'tests', tier);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.spec.ts')) continue;
      specs.push({ value: `tests/${tier}/${file}`, label: humanizeSpecName(file) });
    }
  }
  specs.sort((a, b) => a.label.localeCompare(b.label));
  specs.unshift({ value: ALL_SPECS_VALUE, label: 'All Tests' });
  return specs;
}

function geosByBrand(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const entry of BRAND_URLS) {
    (map[entry.brand] ??= []).push(entry.geo);
  }
  return map;
}

app.use(express.static(path.join(__dirname, 'public')));
app.use('/reports', express.static(path.join(process.cwd(), 'Test Reports')));
// merge-reports.cjs's combined HTML report and excel-reporter.cjs's
// EXCEL_REPORT_FILE workbook both write outside Test Reports/ (see their own
// comments on why), so the combined-run flow's report/excel links need this
// second static mount to actually be reachable in the browser.
app.use('/combined-reports', express.static(path.join(process.cwd(), 'combined-reports')));

app.get('/meta', (_req, res) => {
  res.json({
    geosByBrand: geosByBrand(),
    specs: discoverSpecs(),
  });
});

// ── Visual Check ──────────────────────────────────────────────────────────
// AI-powered comparison — see gui/visual-compare.ts for the Claude vision
// call and gui/screenshot-capture.ts for the bare (non-test-fixture)
// Playwright screenshot capture. memoryStorage(): the upload never touches
// disk, matching the feature's deliberately ephemeral design (nothing is
// persisted — results render once from the response, same as this route's
// own JSON reply).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const uploadFields = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'bannerImage', maxCount: 1 },
  { name: 'popupImage', maxCount: 1 },
]);
// 'campaign-vs-site' is an orchestration mode handled entirely in this file
// (it fans out into up to three compareVisual/compareText calls) — not a
// real VisualCheckMode compareVisual itself understands.
type RouteMode = VisualCheckMode | 'campaign-vs-site';
const VISUAL_MODES: RouteMode[] = ['document-vs-site', 'asset-vs-site', 'site-vs-site', 'campaign-vs-site'];

function fileFrom(req: express.Request, field: string): Express.Multer.File | undefined {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return files?.[field]?.[0];
}

function mimeTypeFor(file: Express.Multer.File): string {
  // multer/the browser usually gets this right from the file's extension,
  // but fall back to sniffing the extension ourselves for the one type this
  // feature cares about (PDF) in case a browser ever sends a generic
  // application/octet-stream for it.
  if (file.mimetype && file.mimetype !== 'application/octet-stream') return file.mimetype;
  if (file.originalname.toLowerCase().endsWith('.pdf')) return 'application/pdf';
  if (file.originalname.toLowerCase().endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}

// Crops the matched region (if Claude gave one) out of the relevant site
// frame — the "close-up" the UI shows instead of a whole full-page
// screenshot shrunk to a sliver. Returns null on any failure/absence, so
// the caller always has a safe "just show the full frame" fallback.
async function buildMatchCrop(
  result: { boundingBox: { x: number; y: number; width: number; height: number } | null; bestFrameIndex: number },
  siteBufs: Buffer[]
): Promise<string | null> {
  if (!result.boundingBox) return null;
  const frame = siteBufs[result.bestFrameIndex] ?? siteBufs[0];
  if (!frame) return null;
  const cropped = await cropRegion(frame, result.boundingBox);
  return cropped ? `data:image/png;base64,${cropped.toString('base64')}` : null;
}

type SectionImages = { a: string | null; b: string[]; matchCrop: string | null };

// Shared by document-vs-site, asset-vs-site, site-vs-site, and the banner/
// popup sub-checks inside campaign-vs-site — every one of them is "one
// reference image vs one-or-more site screenshots", just with different
// capture sources feeding in. Handles the SVG-rasterize-for-Claude step,
// the compareVisual call, and building the close-up crop + thumbnail data
// URLs, so none of the four call sites have to repeat this plumbing.
async function runImageSection(
  mode: VisualCheckMode,
  refBuffer: Buffer,
  refMime: string,
  siteBufs: Buffer[]
): Promise<{ result: VisualCompareResult | { error: string }; images: SectionImages }> {
  const compareImage = refMime === 'image/svg+xml'
    ? { buffer: await rasterizeSvgToPng(refBuffer), mimeType: 'image/png' as const }
    : { buffer: refBuffer, mimeType: refMime };

  const result = await compareVisual(
    mode,
    compareImage,
    siteBufs.map(buf => ({ buffer: buf, mimeType: 'image/png' as const }))
  );

  const matchCrop = 'error' in result ? null : await buildMatchCrop(result, siteBufs);

  return {
    result,
    images: {
      // Only rendered as a thumbnail if the browser can display it
      // directly — a PDF's base64 isn't something an <img> tag can show,
      // and re-rendering a PDF page to an image is out of scope for v1.
      // SVG displays fine as-is (unrasterized, sharper than the copy sent
      // to Claude).
      a: refMime === 'application/pdf' ? null : `data:${refMime};base64,${refBuffer.toString('base64')}`,
      b: siteBufs.map(buf => `data:image/png;base64,${buf.toString('base64')}`),
      matchCrop,
    },
  };
}

// Rolls up several section statuses into one headline verdict: any genuine
// absence beats any lesser issue, which beats a clean result — regardless
// of whether the clean sections said "matched" (image checks) or
// "no_issues_found" (the text-only T&C check), so a mixed bag of section
// kinds still rolls up sensibly.
function worstStatus(statuses: string[]): VisualStatus {
  if (statuses.includes('not_matched')) return 'not_matched';
  if (statuses.includes('issue_found')) return 'issue_found';
  return 'no_issues_found';
}

app.post('/visual-check', uploadFields, async (req, res) => {
  const mode = String(req.body.mode ?? '') as RouteMode;
  if (!VISUAL_MODES.includes(mode)) {
    res.status(400).json({ error: 'Invalid or missing comparison mode.' });
    return;
  }

  try {
    if (mode === 'site-vs-site') {
      const qaUrl = String(req.body.qaUrl ?? '').trim();
      const prodUrl = String(req.body.prodUrl ?? '').trim();
      if (!qaUrl || !prodUrl) {
        res.status(400).json({ error: 'Both QA and Production URLs are required.' });
        return;
      }

      const [bufA, bufB] = await Promise.all([
        captureFullPageScreenshot(qaUrl),
        captureFullPageScreenshot(prodUrl),
      ]);

      const { result, images } = await runImageSection('site-vs-site', bufA, 'image/png', [bufB]);
      res.json({ ...result, mode, images });
      return;
    }

    if (mode === 'campaign-vs-site') {
      const siteUrl = String(req.body.siteUrl ?? '').trim();
      const tncText = String(req.body.tncText ?? '').trim();
      const bannerFile = fileFrom(req, 'bannerImage');
      const popupFile = fileFrom(req, 'popupImage');

      if (!siteUrl || (!bannerFile && !popupFile && !tncText)) {
        res.status(400).json({ error: 'A site URL plus at least one of Banner Image, Pop-up Image, or T&C Text is required.' });
        return;
      }

      const sections: Record<string, unknown> = {};
      const statuses: string[] = [];

      if (bannerFile) {
        const bannerFrames = await captureMultipleFrames(siteUrl);
        const { result, images } = await runImageSection('asset-vs-site', bannerFile.buffer, mimeTypeFor(bannerFile), bannerFrames);
        sections.banner = { ...result, images };
        statuses.push('error' in result ? 'issue_found' : result.status);
      }

      if (popupFile) {
        const { buffer: popupSiteBuf, popupDetected } = await captureWithPopupWait(siteUrl);
        if (!popupDetected) {
          // No point spending a Claude call comparing the reference pop-up
          // against a page that never showed one at all.
          const synthesized: VisualCompareResult = {
            status: 'not_matched',
            bestFrameIndex: 0,
            boundingBox: null,
            breakdown: [],
            findings: [{
              severity: 'critical',
              title: 'No pop-up appeared',
              description: 'No pop-up became visible on the page within 10 seconds of loading it.',
              location: 'n/a',
            }],
            model: MODEL,
          };
          sections.popup = {
            ...synthesized,
            images: {
              a: `data:${mimeTypeFor(popupFile)};base64,${popupFile.buffer.toString('base64')}`,
              b: [`data:image/png;base64,${popupSiteBuf.toString('base64')}`],
              matchCrop: null,
            },
          };
          statuses.push('not_matched');
        } else {
          const { result, images } = await runImageSection('popup-vs-site', popupFile.buffer, mimeTypeFor(popupFile), [popupSiteBuf]);
          sections.popup = { ...result, images };
          statuses.push('error' in result ? 'issue_found' : result.status);
        }
      }

      if (tncText) {
        const siteText = await captureSiteText(siteUrl);
        const result = await compareText(tncText, siteText);
        sections.tnc = result;
        statuses.push('error' in result ? 'issue_found' : result.status);
      }

      res.json({
        mode,
        overallStatus: worstStatus(statuses),
        sections,
        model: MODEL,
      });
      return;
    }

    // document-vs-site / asset-vs-site: one upload + one site URL.
    const siteUrl = String(req.body.siteUrl ?? '').trim();
    const file = fileFrom(req, 'file');
    if (!siteUrl || !file) {
      res.status(400).json({ error: 'A site URL and an uploaded file are both required.' });
      return;
    }

    // Asset vs Site checks for presence of one specific element, which is
    // often part of a rotating hero banner/carousel — a single screenshot
    // can only prove what was showing at that instant, not that the asset
    // is genuinely absent. Capture several frames spaced apart instead so a
    // carousel gets at least one full rotation; Document vs Site is a
    // whole-page fidelity check where this matters far less, so it keeps
    // the cheaper single-shot capture.
    const siteBufs = mode === 'asset-vs-site'
      ? await captureMultipleFrames(siteUrl)
      : [await captureFullPageScreenshot(siteUrl)];

    const { result, images } = await runImageSection(mode, file.buffer, mimeTypeFor(file), siteBufs);
    res.json({ ...result, mode, images });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Visual Check failed:', msg);
    res.status(200).json({ error: `Couldn't complete the comparison: ${msg}` });
  }
});

// ── Visual Check: Investigate (site crawl) ───────────────────────────────
// A deterministic Playwright crawl streamed over SSE (same pattern as
// /run below) so the results table in the UI fills in page-by-page instead
// of waiting on the whole site to finish. Smart match (opt-in, see
// site-crawler.ts) only ever runs after the crawl itself completes, so it
// can't slow down or destabilize the crawl's own timing/results.
type InvestigateSession = { id: string; stopped: boolean; res: express.Response };
const investigateSessions = new Map<string, InvestigateSession>();

app.get('/investigate', async (req, res) => {
  const seedUrl = String(req.query.url ?? '').trim();
  const termsRaw = String(req.query.terms ?? '').trim();
  const excludeRaw = String(req.query.exclude ?? '').trim();
  const smartMatch = req.query.smartMatch === 'true';
  const terms = termsRaw ? termsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
  const excludePatterns = excludeRaw ? excludeRaw.split(',').map(p => p.trim()).filter(Boolean) : [];

  try {
    new URL(seedUrl);
  } catch {
    res.status(400).json({ error: 'Enter a valid URL, including https://.' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const id = crypto.randomUUID();
  const session: InvestigateSession = { id, stopped: false, res };
  investigateSessions.set(id, session);
  sendSSE(res, { type: 'session', sessionId: id });

  req.on('close', () => {
    const s = investigateSessions.get(id);
    if (s) s.stopped = true;
    investigateSessions.delete(id);
  });

  try {
    const summary = await crawlSite(
      { seedUrl, terms, smartMatch, excludePatterns },
      page => sendSSE(res, { type: 'page', page }),
      () => session.stopped
    );
    if (!session.stopped) {
      sendSSE(res, { type: 'done', ...summary });
    } else {
      sendSSE(res, { type: 'stopped' });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sendSSE(res, { type: 'error', message: msg });
  } finally {
    res.end();
    investigateSessions.delete(id);
  }
});

app.post('/investigate/:id/stop', (req, res) => {
  const session = investigateSessions.get(req.params.id);
  if (!session) {
    res.json({ stopped: false });
    return;
  }
  session.stopped = true;
  res.json({ stopped: true });
});

function findReportFolder(brand: string, geo: string, dateStr: string): string | null {
  const dir = path.join(process.cwd(), 'Test Reports', brand, geo, dateStr);
  if (!fs.existsSync(dir)) return null;
  const candidates = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith('report-'))
    .map(e => e.name);
  if (candidates.length === 0) return null;
  return candidates
    .map(name => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0].name;
}

type RunReport = {
  brand: string;
  geo: string;
  date: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  specs: string[];
  reportUrl: string | null;
};

type FlatTestResult = {
  date: string;
  brand: string;
  geo: string;
  spec: string;
  testName: string;
  status: TestStatus;
  reportUrl: string | null;
};

type TestStatus = 'passed' | 'failed' | 'flaky' | 'skipped';

type TestRow = {
  spec: string;
  testName: string;
  status: TestStatus;
};

// excel-reporter.cjs's statusLabels writes one of these five strings into
// the Status column — collapse TIMED OUT into failed since the dashboard's
// stat tiles don't break that out separately.
function normalizeStatus(raw: string): TestStatus {
  const upper = raw.toUpperCase();
  if (upper === 'PASSED') return 'passed';
  if (upper === 'FLAKY') return 'flaky';
  if (upper === 'SKIPPED') return 'skipped';
  return 'failed';
}

// The detail table in each per-GEO sheet starts at a fixed row (see
// excel-reporter.cjs's _writeSheet: summary block is 9 rows, header is
// summary.length + 2 = row 11, data from row 12) with Test File/Test
// Name/Status in columns 1-3 — e.g. "p1/feedback-form.spec.ts". Reused here
// (rather than only the row 2-9 summary counts) to say what was actually
// tested, and to let the dashboard drill down into individual test rows.
function extractTestRows(sheet: ExcelJS.Worksheet): TestRow[] {
  const rows: TestRow[] = [];
  for (let row = 12; ; row++) {
    const fileCell = sheet.getRow(row).getCell(1).value;
    if (!fileCell) break;
    const file = String(fileCell);
    const base = file.split('/').pop() || file;
    const statusCell = sheet.getRow(row).getCell(3).value;
    rows.push({
      spec: humanizeSpecName(base),
      testName: String(sheet.getRow(row).getCell(2).value || ''),
      status: normalizeStatus(String(statusCell || '')),
    });
  }
  return rows;
}

// Walks combined-reports/<BRAND>-<date>.xlsx (see excel-reporter.cjs's
// EXCEL_REPORT_FILE append mode, which the combined multi-GEO run flow in
// this file always sets) — these workbooks hold one sheet per GEO/device
// (e.g. "CA", "CA-mobile") for a whole multi-GEO run, entirely separate
// from the per-GEO Test Reports/<brand>/<geo>/<date>/*.xlsx files
// scanRunReports() below reads. Without this, a combined run's results
// never appeared on the Dashboard at all — its .xlsx lives outside the
// folder structure the rest of scanRunReports() walks. The strict
// `<BRAND>-<date>.xlsx` filename match (brand is exactly what '/run'
// passes as excelReportFile) is what excludes older, differently-named
// ad-hoc combined workbooks already sitting in that folder from prior
// sessions.
async function scanCombinedReports(): Promise<{ reports: RunReport[]; tests: FlatTestResult[] }> {
  const combinedDir = path.join(process.cwd(), 'combined-reports');
  const reports: RunReport[] = [];
  const tests: FlatTestResult[] = [];
  if (!fs.existsSync(combinedDir)) return { reports, tests };

  for (const file of fs.readdirSync(combinedDir)) {
    const match = file.match(/^([A-Za-z0-9]+)-(\d{4}-\d{2}-\d{2})\.xlsx$/);
    if (!match) continue;
    const [, brand, date] = match;

    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(path.join(combinedDir, file));

      // One combined workbook covers several GEOs — bucket each sheet by
      // its base GEO (stripping "-mobile") so desktop+mobile still collapse
      // into one Dashboard row per GEO, same as the per-GEO folder scan
      // below already does within a single .xlsx.
      const byGeo = new Map<string, { total: number; passed: number; failed: number; skipped: number; flaky: number; specs: Set<string>; reportUrl: string | null }>();

      wb.eachSheet(sheet => {
        if (sheet.name === 'Summary') return;
        const geo = sheet.name.replace(/-mobile$/, '');
        if (!byGeo.has(geo)) {
          const folder = findReportFolder(brand, geo, date);
          const reportUrl = folder ? `/reports/${brand}/${geo}/${date}/${folder}/index.html` : null;
          byGeo.set(geo, { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0, specs: new Set(), reportUrl });
        }
        const agg = byGeo.get(geo)!;
        agg.total += Number(sheet.getRow(2).getCell(2).value) || 0;
        agg.passed += Number(sheet.getRow(3).getCell(2).value) || 0;
        agg.failed += Number(sheet.getRow(4).getCell(2).value) || 0;
        agg.skipped += Number(sheet.getRow(5).getCell(2).value) || 0;
        agg.flaky += Number(sheet.getRow(9).getCell(2).value) || 0;

        for (const row of extractTestRows(sheet)) {
          agg.specs.add(row.spec);
          tests.push({ date, brand, geo, spec: row.spec, testName: row.testName, status: row.status, reportUrl: agg.reportUrl });
        }
      });

      for (const [geo, agg] of byGeo) {
        reports.push({
          brand, geo, date,
          total: agg.total, passed: agg.passed, failed: agg.failed, skipped: agg.skipped, flaky: agg.flaky,
          specs: [...agg.specs].sort((a, b) => a.localeCompare(b)),
          reportUrl: agg.reportUrl,
        });
      }
    } catch {
      // Skip a corrupt/partially-written workbook rather than failing the
      // whole dashboard over one bad file.
    }
  }

  return { reports, tests };
}

// Walks Test Reports/<brand>/<geo>/<date>/*.xlsx and sums each workbook's
// per-GEO sheets using the exact fixed-row layout excel-reporter.cjs writes
// (_writeSheet: row 2 Total, 3 Passed, 4 Failed, 5 Skipped, 9 Flaky) —
// reading the same positions the reporter itself sums from, rather than
// re-parsing the human-readable "Summary" tab it also writes.
async function scanRunReports(): Promise<{ reports: RunReport[]; tests: FlatTestResult[] }> {
  const rootDir = path.join(process.cwd(), 'Test Reports');
  if (!fs.existsSync(rootDir)) return { reports: [], tests: [] };

  const reports: RunReport[] = [];
  const tests: FlatTestResult[] = [];

  for (const brand of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!brand.isDirectory()) continue;
    const brandDir = path.join(rootDir, brand.name);

    for (const geo of fs.readdirSync(brandDir, { withFileTypes: true })) {
      if (!geo.isDirectory() || geo.name.startsWith('_')) continue;
      const geoDir = path.join(brandDir, geo.name);

      for (const dateEntry of fs.readdirSync(geoDir, { withFileTypes: true })) {
        if (!dateEntry.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(dateEntry.name)) continue;
        const dateDir = path.join(geoDir, dateEntry.name);

        const xlsxFiles = fs.readdirSync(dateDir).filter(f => f.endsWith('.xlsx'));
        const folder = findReportFolder(brand.name, geo.name, dateEntry.name);
        const reportUrl = folder
          ? `/reports/${brand.name}/${geo.name}/${dateEntry.name}/${folder}/index.html`
          : null;

        for (const file of xlsxFiles) {
          try {
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.readFile(path.join(dateDir, file));

            let total = 0, passed = 0, failed = 0, skipped = 0, flaky = 0;
            const specSet = new Set<string>();
            wb.eachSheet(sheet => {
              if (sheet.name === 'Summary') return;
              total += Number(sheet.getRow(2).getCell(2).value) || 0;
              passed += Number(sheet.getRow(3).getCell(2).value) || 0;
              failed += Number(sheet.getRow(4).getCell(2).value) || 0;
              skipped += Number(sheet.getRow(5).getCell(2).value) || 0;
              flaky += Number(sheet.getRow(9).getCell(2).value) || 0;

              for (const row of extractTestRows(sheet)) {
                specSet.add(row.spec);
                tests.push({
                  date: dateEntry.name,
                  brand: brand.name,
                  geo: geo.name,
                  spec: row.spec,
                  testName: row.testName,
                  status: row.status,
                  reportUrl,
                });
              }
            });

            reports.push({
              brand: brand.name,
              geo: geo.name,
              date: dateEntry.name,
              total,
              passed,
              failed,
              skipped,
              flaky,
              specs: [...specSet].sort((a, b) => a.localeCompare(b)),
              reportUrl,
            });
          } catch {
            // Skip a corrupt/partially-written workbook rather than failing
            // the whole dashboard over one bad file.
          }
        }
      }
    }
  }

  const combined = await scanCombinedReports();
  reports.push(...combined.reports);
  tests.push(...combined.tests);

  return {
    reports: reports.sort((a, b) => b.date.localeCompare(a.date)),
    tests: tests.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

type DayGroup = {
  date: string;
  passed: number;
  failed: number;
  flaky: number;
  entries: Array<{
    brand: string;
    geo: string;
    specs: string[];
    passed: number;
    failed: number;
    flaky: number;
    reportUrl: string | null;
  }>;
};

app.get('/dashboard', async (_req, res) => {
  const { reports: runs, tests } = await scanRunReports();

  const stats = runs.reduce(
    (acc, r) => {
      acc.totalRuns += 1;
      acc.totalPassed += r.passed;
      acc.totalFailed += r.failed;
      acc.totalFlaky += r.flaky;
      if (!acc.lastRunDate || r.date > acc.lastRunDate) acc.lastRunDate = r.date;
      return acc;
    },
    { totalRuns: 0, totalPassed: 0, totalFailed: 0, totalFlaky: 0, lastRunDate: null as string | null }
  );

  // Grouped by date rather than one row per brand/GEO — one collapsible
  // card per day, one bar per day in the trend chart, each summing the
  // brand/GEO entries run that day.
  const byDate = new Map<string, DayGroup>();
  for (const r of runs) {
    if (!byDate.has(r.date)) byDate.set(r.date, { date: r.date, passed: 0, failed: 0, flaky: 0, entries: [] });
    const day = byDate.get(r.date)!;
    day.passed += r.passed;
    day.failed += r.failed;
    day.flaky += r.flaky;
    day.entries.push({
      brand: r.brand,
      geo: r.geo,
      specs: r.specs,
      passed: r.passed,
      failed: r.failed,
      flaky: r.flaky,
      reportUrl: r.reportUrl,
    });
  }

  const days = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);

  // Capped rather than unbounded — this is a drill-down list for the stat
  // tiles (click Passed/Failed/Flaky), not a paginated results browser.
  res.json({ stats, days, tests: tests.slice(0, 500) });
});

// proc is spawned with shell:true, so proc.kill() only kills the shell
// wrapper, not the npx/playwright/browser processes underneath it. On
// Windows, taskkill /t walks the whole process tree; elsewhere SIGTERM
// on the shell process is enough since spawn() didn't detach it.
function killProcessTree(proc: ReturnType<typeof spawn>): void {
  if (process.platform === 'win32' && proc.pid) {
    spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f']);
  } else {
    proc.kill();
  }
}

// ── Run (single or multi-GEO, combined) ──────────────────────────────────
// Runs several GEOs of the same brand back-to-back through ONE SSE stream,
// pausing between each so the user can switch their VPN/IP by hand — there
// is no way to script that (only one GEO's real IP can be active at a
// time, see feedback_multi_geo_vpn_switch), so this deliberately waits for
// an explicit "continue" instead of silently plowing ahead on the wrong
// GEO's IP. Every GEO run shares one EXCEL_REPORT_FILE value so
// excel-reporter.cjs appends each GEO as its own tab into the SAME
// combined-reports/<brand>-<date>.xlsx workbook (see its append-mode
// comment) instead of writing a separate file per GEO. Once the last GEO
// finishes, merge-reports.cjs is spawned to fold every GEO's blob report
// (playwright.config.ts writes one per GEO under the same
// Test Reports/<brand>/_blob-reports/<date>/ root) into one real Playwright
// HTML report — the exact same two-artifact "combined report" the CLI
// VPN-switch workflow already produces, just wired up instead of typed by hand.
type MultiState = 'awaiting-vpn' | 'running' | 'merging' | 'done' | 'stopped';

type MultiSession = {
  id: string;
  brand: string;
  geos: string[];
  device: string;
  spec: string;
  dateStr: string;
  excelReportFile: string;
  index: number;
  state: MultiState;
  res: express.Response;
  proc: ReturnType<typeof spawn> | null;
  stoppedByUser: boolean;
  // Set while the browser is disconnected but the run is still being given
  // a chance to reconnect (see attachDisconnectHandler) — cleared the
  // moment a /run/:id/resume call reattaches a live response.
  disconnectTimer: NodeJS.Timeout | null;
};

const multiSessions = new Map<string, MultiSession>();

// A dropped browser connection (VPN switch resetting the network adapter,
// wifi blip, laptop sleep/wake) used to be treated the same as the user
// closing the tab — req.on('close') killed the real Playwright process
// immediately. That's real work lost over a transient hiccup that had
// nothing to do with the test run itself. Now a disconnect only starts this
// grace period; the run keeps going and only gets killed if the browser
// hasn't reconnected (via /run/:id/resume) by the time it elapses.
const DISCONNECT_GRACE_MS = 20_000;

function sendSSE(res: express.Response, data: Record<string, unknown>): void {
  // The session's res can be a stale/closed connection while disconnected
  // (grace period pending) — writing to it would throw and could crash the
  // run's own event handlers, which is worse than just dropping the line.
  if (res.writableEnded || res.destroyed) return;
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Socket already gone; the disconnect handler below owns cleanup.
  }
}

// Shared by the initial /run connection and every /run/:id/resume
// reconnect — starts (or restarts) the kill-after-grace-period timer when
// THIS specific response disconnects. Guarded by identity so an old
// connection's belated 'close' event can't kill a session a newer resume
// has already taken over.
function attachDisconnectHandler(res: express.Response, session: MultiSession): void {
  res.on('close', () => {
    if (session.res !== res) return;
    session.disconnectTimer = setTimeout(() => {
      const s = multiSessions.get(session.id);
      if (!s) return;
      if (s.proc) killProcessTree(s.proc);
      multiSessions.delete(session.id);
    }, DISCONNECT_GRACE_MS);
  });
}

function runNextGeo(session: MultiSession): void {
  const geo = session.geos[session.index];
  session.state = 'running';
  const emit = (data: Record<string, unknown>) => sendSSE(session.res, data);
  emit({ type: 'geo-start', geo, step: session.index + 1, total: session.geos.length });
  notifySlack(`▶️ Now running *${session.brand} ${geo}* (step ${session.index + 1} of ${session.geos.length})`);

  const projectArgs =
    session.device === 'both' ? [] : ['--project', session.device === 'mobile' ? `${geo}-mobile` : geo];
  // 'tests' alone would sweep in tests/tracking, tests/sample,
  // tests/smoke.spec.ts, and tests/requirements-parser.spec.ts too — none of
  // which are in scope for a Functional Check run (tracking's specs also
  // require QA_TAG_ID/QA_BASE_URL that only the ticket-driven agent flow
  // sets). "All Tests" means all of p1/p2/p3, not literally everything
  // under tests/ — same TEST_TIERS discoverSpecs() already scopes to.
  const specArgs = session.spec === ALL_SPECS_VALUE
    ? TEST_TIERS.map(tier => `tests/${tier}`)
    : [session.spec];

  const proc = spawn('npx', ['playwright', 'test', ...specArgs, ...projectArgs], {
    cwd: process.cwd(),
    shell: true,
    env: {
      ...process.env,
      TEST_BRAND: session.brand,
      TEST_GEO: geo,
      CI: 'true',
      EXCEL_REPORT_FILE: session.excelReportFile,
      ...(session.device === 'mobile' || session.device === 'both' ? { TEST_MOBILE: 'true' } : {}),
    },
  });
  session.proc = proc;

  proc.stdout.on('data', chunk => emit({ type: 'log', text: chunk.toString() }));
  proc.stderr.on('data', chunk => emit({ type: 'log', text: chunk.toString() }));

  proc.on('close', async exitCode => {
    session.proc = null;
    if (session.stoppedByUser) {
      emit({ type: 'stopped' });
      notifySlack(`⏹️ Test run stopped (${session.brand} ${geo}).`);
      session.res.end();
      multiSessions.delete(session.id);
      return;
    }

    const folder = findReportFolder(session.brand, geo, session.dateStr);
    const reportUrl = folder
      ? `/reports/${session.brand}/${geo}/${session.dateStr}/${folder}/index.html`
      : null;
    emit({ type: 'geo-done', geo, exitCode, reportUrl, step: session.index + 1, total: session.geos.length });

    const excelPath = path.join(process.cwd(), 'combined-reports', `${session.excelReportFile}.xlsx`);
    const summary = formatSummary(await readExcelSummary(excelPath, geo));

    session.index += 1;
    if (session.index < session.geos.length) {
      session.state = 'awaiting-vpn';
      const nextGeo = session.geos[session.index];
      emit({ type: 'awaiting-vpn', geo: nextGeo, step: session.index + 1, total: session.geos.length });
      notifySlack(
        `*${session.brand} ${geo}* finished —${summary}. Switch your VPN to *${nextGeo}* now, then hit Continue in the GUI (step ${session.index + 1} of ${session.geos.length}).`
      );
    } else {
      finishMultiSession(session);
    }
  });
}

function finishMultiSession(session: MultiSession): void {
  session.state = 'merging';
  const emit = (data: Record<string, unknown>) => sendSSE(session.res, data);
  emit({ type: 'merging' });

  const proc = spawn('node', ['merge-reports.cjs'], {
    cwd: process.cwd(),
    shell: true,
    env: { ...process.env, TEST_BRAND: session.brand, TEST_DATE: session.dateStr },
  });
  session.proc = proc;

  proc.stdout.on('data', chunk => emit({ type: 'log', text: chunk.toString() }));
  proc.stderr.on('data', chunk => emit({ type: 'log', text: chunk.toString() }));

  proc.on('close', async exitCode => {
    session.proc = null;
    if (session.stoppedByUser) {
      emit({ type: 'stopped' });
      notifySlack(`⏹️ Test run stopped (${session.brand}, during report merge).`);
      session.res.end();
      multiSessions.delete(session.id);
      return;
    }

    const mergedIndex = path.join(
      process.cwd(), 'Test Reports', session.brand, '_blob-reports', `${session.dateStr}-merged-html-report`, 'index.html'
    );
    const mergedReportUrl = fs.existsSync(mergedIndex)
      ? `/reports/${session.brand}/_blob-reports/${session.dateStr}-merged-html-report/index.html`
      : null;
    const excelPath = path.join(process.cwd(), 'combined-reports', `${session.excelReportFile}.xlsx`);
    const excelUrl = fs.existsSync(excelPath) ? `/combined-reports/${session.excelReportFile}.xlsx` : null;
    const summary = formatSummary(await readExcelSummary(excelPath));

    session.state = 'done';
    emit({ type: 'all-done', exitCode, mergedReportUrl, excelUrl });
    notifySlack(
      `🎉 *${session.brand}* run complete — all ${session.geos.length} GEO(s) finished (${session.geos.join(', ')}).${summary}`
    );
    session.res.end();
    multiSessions.delete(session.id);
  });
}

app.get('/run', (req, res) => {
  const brand = String(req.query.brand ?? '');
  const geos = String(req.query.geos ?? '').split(',').map(g => g.trim()).filter(Boolean);
  const device = String(req.query.device ?? '');
  const spec = String(req.query.spec ?? '');

  const validGeos = geos.length > 0 && geos.every(geo => BRAND_URLS.some(e => e.brand === brand && e.geo === geo));
  const validDevice = device === 'desktop' || device === 'mobile' || device === 'both';
  const validSpec = discoverSpecs().some(s => s.value === spec);

  if (!validGeos || !validDevice || !validSpec) {
    res.status(400).json({ error: 'Invalid brand/geos/device/spec combination.' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const id = crypto.randomUUID();
  const dateStr = new Date().toISOString().slice(0, 10);
  const session: MultiSession = {
    id,
    brand,
    geos,
    device,
    spec,
    dateStr,
    // Matches merge-reports.cjs's own TEST_BRAND-scoped blob folder naming
    // convention so the workbook and the merged HTML report are easy to
    // pair up by name.
    excelReportFile: `${brand}-${dateStr}`,
    index: 0,
    state: 'running',
    res,
    proc: null,
    stoppedByUser: false,
    disconnectTimer: null,
  };
  multiSessions.set(id, session);

  sendSSE(res, { type: 'session', sessionId: id });
  // Starts GEO 1 immediately — no "awaiting-vpn" pause before the very
  // first GEO, since the user is assumed to already be on the right VPN/IP
  // by the time they click Run (same assumption a plain single-GEO run
  // always made). The pause only shows up BETWEEN GEOs, where an actual
  // VPN switch is required — see runNextGeo's proc.on('close') handler.
  runNextGeo(session);

  attachDisconnectHandler(res, session);
});

// The browser's EventSource reattaches here after a dropped connection
// (see app.js's onerror handler) instead of hitting /run again, which would
// otherwise spin up a brand-new session/process from GEO 1 while the
// original run is still going. Only works within DISCONNECT_GRACE_MS of the
// drop — after that the run has already been killed and there's nothing
// left to resume.
app.get('/run/:id/resume', (req, res) => {
  const session = multiSessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'No active run with that id — it may have already finished or timed out after a disconnect.' });
    return;
  }
  if (session.disconnectTimer) {
    clearTimeout(session.disconnectTimer);
    session.disconnectTimer = null;
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  session.res = res;
  sendSSE(res, { type: 'resumed', sessionId: session.id, state: session.state });
  attachDisconnectHandler(res, session);
});

app.post('/run/:id/continue', (req, res) => {
  const session = multiSessions.get(req.params.id);
  if (!session || session.state !== 'awaiting-vpn') {
    res.status(400).json({ error: 'No session awaiting a continue right now.' });
    return;
  }
  res.json({ ok: true });
  runNextGeo(session);
});

app.post('/run/:id/stop', (req, res) => {
  const session = multiSessions.get(req.params.id);
  if (!session) {
    res.json({ stopped: false });
    return;
  }
  session.stoppedByUser = true;
  if (session.proc) {
    killProcessTree(session.proc);
  } else {
    // Stopped while paused on "awaiting-vpn" — no child process to kill,
    // so end the stream directly instead of waiting on a 'close' that will
    // never fire.
    sendSSE(session.res, { type: 'stopped' });
    notifySlack(`⏹️ Test run stopped (${session.brand}, while awaiting VPN switch).`);
    session.res.end();
    multiSessions.delete(session.id);
  }
  res.json({ stopped: true });
});

app.listen(PORT, () => {
  console.log(`GUI running at http://localhost:${PORT}`);
});

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
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import axios from 'axios';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { BRAND_URLS, getLiveUrl } from '../helpers/brand-urls';
import { captureFullPageScreenshot, captureMultipleFrames, captureWithPopupWait, captureSiteText, rasterizeSvgToPng, cropRegion } from './screenshot-capture';
import Anthropic from '@anthropic-ai/sdk';
import { compareVisual, compareText, MODEL, VisualCheckMode, VisualStatus, VisualCompareResult, ImageInput, TextInput } from './visual-compare';
import { parseFigmaUrl, fetchFigmaFrameImage } from './figma-client';
import { crawlSite } from './site-crawler';
import { JiraClient } from '../src/jira-client';
// require(), not import — TS's module resolution doesn't match an explicit
// .cjs extension against a .d.ts declaration file of the same base name
// (same reasoning as playwright.config.ts's portForKey import).
const { pruneOldRuns } = require('../helpers/prune-old-runs.cjs') as {
  pruneOldRuns: (brand: string, geo: string, dateStr: string, keep?: number) => void;
};
const { localTimeToken, localTimestampToken } = require('../helpers/run-token.cjs') as { localTimeToken: (d?: Date) => string; localTimestampToken: (d?: Date) => string };
import { registerJiraCheckerRoutes } from './jira-checker';
import { registerJiraTicketRoutes, findingEnvironment, pageSnapshotExcerpt, detectBlockedPage, Finding } from './jira-ticket';
import { plainError } from './plain-error';
import { saveExportImages, buildPdfExport, buildExcelExport, VisualExportInput } from './visual-export';

dotenv.config();

const app = express();
const PORT = Number(process.env.GUI_PORT) || 4848;

// Labels every Slack alert with who's running it, so when multiple people
// run the GUI on their own machines at the same time (e.g. splitting brands
// across the team), a "SC UK finished" ping is attributable to a person, not
// just a brand. RUNNER_NAME is an optional per-machine .env override
// (useful if a shared login makes the OS username generic, e.g. "qa-user");
// falls back to the OS account name so this works with zero setup.
const RUNNER_NAME = process.env.RUNNER_NAME || os.userInfo().username;

type RunStats = { total: number; passed: number; failed: number; skipped: number };

// One card color per event type, so a fast glance down a busy channel tells
// you the outcome before reading a word — blue while a run is in progress,
// green/red once it has a real pass/fail result, gray for a manual stop,
// amber while it's genuinely waiting on a person (VPN switch).
const CARD_COLOR = {
  running: '#2E86DE',
  success: '#2EB67D',
  failure: '#E01E5A',
  stopped: '#8D8D8D',
  waiting: '#ECB22E',
} as const;

interface SlackCard {
  emoji: string;
  title: string;
  color: keyof typeof CARD_COLOR;
  /** Extra mrkdwn line under the title, e.g. a VPN-switch instruction. */
  body?: string;
  /** Pass/fail/skip counts, rendered as a row of fields instead of prose. */
  stats?: RunStats | null;
  /** Extra context after the runner name, e.g. "Step 2 of 5". */
  footer?: string;
}

// Replaced a single growing text line per event (Slack renders consecutive
// messages from the same bot as one indistinguishable wall of text — see
// the screenshot Reeve flagged 2026-09-10, unreadable once two people run
// at once) with a Block Kit card: colored left border by outcome, a bold
// title, pass/fail/skip as real fields instead of buried in a sentence, and
// a small context line naming who ran it — same idea as [[RUNNER_NAME]]
// but visually separated instead of just prefixed in plain text.
async function notifySlack(card: SlackCard): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const blocks: Record<string, unknown>[] = [
    { type: 'section', text: { type: 'mrkdwn', text: `${card.emoji} *${card.title}*` } },
  ];
  if (card.body) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: card.body } });
  }
  if (card.stats && card.stats.total > 0) {
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Passed*\n${card.stats.passed} ✅` },
        { type: 'mrkdwn', text: `*Failed*\n${card.stats.failed}${card.stats.failed > 0 ? ' ❌' : ''}` },
        { type: 'mrkdwn', text: `*Skipped*\n${card.stats.skipped}` },
      ],
    });
  }
  const contextText = `👤 Run by *${RUNNER_NAME}*${card.footer ? `  •  ${card.footer}` : ''}`;
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: contextText }] });

  try {
    await axios.post(webhookUrl, {
      // Fallback shown in notification previews/screen readers — clients
      // that can't render blocks fall back to this too.
      text: `${card.emoji} ${card.title} — run by ${RUNNER_NAME}`,
      attachments: [{ color: CARD_COLOR[card.color], blocks }],
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Same service this project's helpers/ip-detect.ts and geo-features.ts
// comments already use to manually confirm a VPN's real country. Returns
// null (never throws) on any failure — a flaky/rate-limited IP-check
// service must never be able to block a real run.
async function fetchOutboundIp(): Promise<string | null> {
  try {
    const res = await axios.get('https://ipinfo.io/json', { timeout: 6_000 });
    return typeof res.data?.ip === 'string' ? res.data.ip : null;
  } catch {
    return null;
  }
}

// Clicking Continue used to fire the next GEO's Playwright process
// instantly (confirmed live 2026-09-18: an SNG AB run failed immediately
// after switching to Cyprus and hitting Continue) — a VPN client showing
// "Connected" doesn't mean the OS's routing/DNS has actually finished
// cutting over yet, so the test's very first request could still go out
// the OLD route and fail before the new tunnel was really up. This polls
// the outbound IP for up to ~12s waiting for it to differ from whatever it
// was when the pause started; if it never changes (VPN check service down,
// or the next GEO genuinely shares an IP with the last one), it logs a
// warning and proceeds anyway rather than blocking a run indefinitely on a
// third-party service.
const VPN_SWITCH_POLL_MS = 2_000;
const VPN_SWITCH_MAX_ATTEMPTS = 6;

async function confirmVpnSwitched(session: MultiSession, geo: string): Promise<void> {
  const emit = (data: Record<string, unknown>) => sendSSE(session.res, data);
  if (!session.lastIpBeforeSwitch) {
    // No usable baseline (IP-check failed when the pause started) — nothing
    // to compare against, so there's no reliable check to run here.
    return;
  }

  emit({ type: 'verifying-vpn', geo });
  for (let attempt = 0; attempt < VPN_SWITCH_MAX_ATTEMPTS; attempt++) {
    await sleep(VPN_SWITCH_POLL_MS);
    const currentIp = await fetchOutboundIp();
    if (currentIp && currentIp !== session.lastIpBeforeSwitch) return;
  }

  emit({
    type: 'log',
    text: `\n⚠️  Your outbound IP still looks the same as before Continue was clicked — the VPN switch to ${geo} may not have finished yet. Starting anyway.\n`,
  });
}

// Sums the same fixed summary rows excel-reporter.cjs writes into each
// sheet (row 2 Total, 3 Passed, 4 Failed, 5 Skipped — see scanRunReports
// below) so the Slack card can show real pass/fail fields without a
// separate parse of the run's stdout. geoFilter narrows to one GEO's
// sheet(s) (stripping "-mobile"); omit it to sum the whole workbook.
// Returns null if the workbook isn't there yet or fails to parse — callers
// fall back to omitting the stats fields rather than failing the notification.
async function readExcelSummary(excelPath: string, geoFilter?: string): Promise<RunStats | null> {
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

const TEST_TIERS = ['p1', 'p2', 'p3'] as const;
// Visual-priority tiers — separate from TEST_TIERS (functional priority) on
// purpose: a component's functional criticality and its visual criticality
// don't always match (see docs/Automated Regression Checklist 2026.xlsx,
// "Visual Critical Priority" tab). Named lowercase 'v-p1' etc. (not 'V-P1')
// so it sorts alphabetically after p1/p2/p3 regardless of case-sensitivity,
// matching the intended run order below. Only v-p1 exists on disk today;
// v-p2/v-p3 are reserved for when those checklist items get automated.
const VISUAL_TIERS = ['v-p1', 'v-p2', 'v-p3'] as const;
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
  for (const tier of [...TEST_TIERS, ...VISUAL_TIERS]) {
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

// Raised well above the 100kb default: /visual-check/export's body is the
// full result JSON the client already rendered, including every screenshot
// as a base64 data URL (several MB is routine for a full-page PNG, more for
// a multi-frame Campaign Materials result with 3 sections).
app.use(express.json({ limit: '50mb' }));
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
const VISUAL_MODES: RouteMode[] = ['document-vs-site', 'asset-vs-site', 'site-vs-site', 'campaign-vs-site', 'figma-vs-site'];

function fileFrom(req: express.Request, field: string): Express.Multer.File | undefined {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return files?.[field]?.[0];
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function mimeTypeFor(file: Express.Multer.File): string {
  // multer/the browser usually gets this right from the file's extension,
  // but fall back to sniffing the extension ourselves in case a browser ever
  // sends a generic application/octet-stream for one of these.
  if (file.mimetype && file.mimetype !== 'application/octet-stream') return file.mimetype;
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  if (name.endsWith('.docx')) return DOCX_MIME;
  if (name.endsWith('.xlsx')) return XLSX_MIME;
  return 'image/png';
}

function isOfficeDoc(mimeType: string): boolean {
  return mimeType === DOCX_MIME || mimeType === XLSX_MIME;
}

// Document vs Site used to only ever check the one URL a person typed in —
// if the reference document itself named a specific sub-page ("the Mobile
// App page at qa-ab.spingenie.ca/mobile-app/"), the tool had no way to
// actually go look, and could only say "cannot confirm from screenshot
// alone." This finds same-site URLs mentioned in the document's own
// extracted text (full "https://..." links and bare "hostname/path"
// mentions alike) so those specific pages get captured and checked too —
// scoped to the SAME hostname as the URL the person provided, never an
// arbitrary domain named in the document, and capped so a document that
// mentions many links can't turn one check into an uncontrolled crawl.
const MAX_EXTRA_SITE_PAGES = 3;

function extractSameSiteUrls(text: string, baseUrlStr: string): string[] {
  let base: URL;
  try {
    base = new URL(baseUrlStr);
  } catch {
    return [];
  }
  const found = new Set<string>();
  const alreadyMain = new Set([base.origin + base.pathname, base.origin + '/']);

  const addIfSameHost = (candidate: string) => {
    try {
      const u = new URL(candidate, base);
      if (u.hostname !== base.hostname) return;
      const normalized = u.origin + u.pathname;
      if (!alreadyMain.has(normalized)) found.add(normalized);
    } catch { /* not a usable URL — ignore */ }
  };

  // Full URLs, e.g. "https://qa-ab.spingenie.ca/mobile-app/"
  for (const m of text.matchAll(/https?:\/\/[^\s,;()"'<>]+/gi)) {
    addIfSameHost(m[0].replace(/[.,;:]+$/, ''));
  }

  // Bare "hostname/path" mentions with no scheme, e.g.
  // "qa-ab.spingenie.ca/mobile-app/" — same host as the given URL only, so
  // this can't be tricked into resolving an unrelated domain named in the doc.
  const escapedHost = base.hostname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const m of text.matchAll(new RegExp(`\\b${escapedHost}(/[^\\s,;()"'<>]*)`, 'gi'))) {
    addIfSameHost(base.origin + m[1].replace(/[.,;:]+$/, ''));
  }

  return [...found].slice(0, MAX_EXTRA_SITE_PAGES);
}

// Claude's document content block only understands PDF — a Word/Excel
// upload is converted to plain extracted text here instead, so
// "Document vs Site" can accept any of the three, not just PDF/image.
// Formatting/layout doesn't survive this; the document-vs-site prompt in
// visual-compare.ts is written to compare content only when it gets text.
const MAX_EXTRACTED_DOC_CHARS = 50_000;
// Plain text extraction silently drops any images embedded IN the document
// (a mockup pasted into a Word doc, a logo in a spreadsheet) — extracted
// separately and sent to Claude as real image blocks so it can actually see
// them, capped so one document with dozens of images can't blow up the
// request.
const MAX_EMBEDDED_IMAGES = 12;

// PDF references get the same "did the document itself name a specific
// page" treatment docx/xlsx already have (see extractSameSiteUrls below) —
// pdf-parse pulls the text layer only; a scanned/image-only PDF just yields
// an empty string, which extractSameSiteUrls already handles fine (finds no
// URLs, falls back to single-page like before).
async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text.trim();
  } catch (e) {
    console.warn('[WARN] Could not extract text from .pdf for page-scan (comparison itself is unaffected):', e instanceof Error ? e.message : e);
    return '';
  } finally {
    await parser.destroy();
  }
}

function mediaExtensionToMimeType(extension: string): string | null {
  const ext = extension.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  return null; // exceljs also reports e.g. emf/wmf vector media Claude can't read as an image
}

async function extractOfficeDocContent(buffer: Buffer, mimeType: string): Promise<{ text: string; images: ImageInput[] }> {
  let text: string;
  let images: ImageInput[] = [];

  if (mimeType === DOCX_MIME) {
    try {
      text = (await mammoth.extractRawText({ buffer })).value;
    } catch (e) {
      // Same graceful-degradation the .xlsx branch below already has — a
      // corrupt/unusual .docx shouldn't fail the whole check via the outer
      // route catch, just mean Claude gets a clear "couldn't read this"
      // note instead of any document content.
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[WARN] Could not parse .docx (falling back to no extracted content):', msg);
      return { text: `(Could not read this Word document's content: ${msg})`, images: [] };
    }
    try {
      await mammoth.convertToHtml({ buffer }, {
        convertImage: mammoth.images.imgElement(async image => {
          if (images.length < MAX_EMBEDDED_IMAGES) {
            const b64 = await image.read('base64');
            images.push({ buffer: Buffer.from(b64, 'base64'), mimeType: image.contentType });
          }
          return { src: '' };
        }),
      });
    } catch (e) {
      // Text extraction above already succeeded — losing the embedded
      // images on a weird/corrupt image stream shouldn't fail the whole
      // check, just means Claude only sees the text this time.
      console.warn('[WARN] Could not extract embedded images from .docx:', e instanceof Error ? e.message : e);
    }
  } else {
    // exceljs's own .d.ts types load(buffer) against a Buffer shape that
    // doesn't structurally match this project's actual Buffer type (a
    // @types/node duplication/version issue) — readFile(path) has no such
    // mismatch, so the upload is written to a temp file instead, same
    // write-then-cleanup pattern jira-checker.ts's uploadBufferAsAttachment
    // already uses for the same class of problem.
    const wb = new ExcelJS.Workbook();
    const tmpPath = path.join(os.tmpdir(), `visual-check-${crypto.randomUUID()}.xlsx`);
    fs.writeFileSync(tmpPath, buffer);
    try {
      try {
        await wb.xlsx.readFile(tmpPath);
      } finally {
        fs.unlinkSync(tmpPath);
      }
    } catch (e) {
      // Confirmed live: exceljs can throw while reconciling drawings/images
      // against worksheets for some real, valid .xlsx files (a compatibility
      // quirk, not a corrupt-file problem) — losing the WHOLE workbook to an
      // uncaught throw here would silently fail cell text too, not just
      // images, so this is caught and reported rather than left to bubble up.
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[WARN] Could not parse .xlsx (falling back to no extracted content):', msg);
      return { text: `(Could not read this Excel file's content: ${msg})`, images: [] };
    }

    const parts: string[] = [];
    wb.eachSheet(sheet => {
      parts.push(`Sheet: ${sheet.name}`);
      sheet.eachRow({ includeEmpty: false }, row => {
        const cells = (row.values as unknown[]).slice(1).map(v => (v == null ? '' : String(v)));
        if (cells.some(c => c !== '')) parts.push(cells.join(' | '));
      });
    });
    text = parts.join('\n');

    try {
      for (const media of wb.model.media ?? []) {
        if (images.length >= MAX_EMBEDDED_IMAGES) break;
        const imgMime = mediaExtensionToMimeType(media.extension);
        if (imgMime) images.push({ buffer: Buffer.from(media.buffer), mimeType: imgMime });
      }
    } catch (e) {
      console.warn('[WARN] Could not extract embedded images from .xlsx:', e instanceof Error ? e.message : e);
    }
  }

  text = text.trim();
  if (text.length > MAX_EXTRACTED_DOC_CHARS) {
    text = text.slice(0, MAX_EXTRACTED_DOC_CHARS) + '\n\n[...truncated...]';
  }
  return { text, images };
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

type SectionImages = { a: string | null; aText: string | null; b: string[]; bLabels: string[] | null; matchCrop: string | null };

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
  siteBufs: Buffer[],
  siteLabels?: string[]
): Promise<{ result: VisualCompareResult | { error: string }; images: SectionImages }> {
  // A Word/Excel reference has no visual form Claude's document block
  // understands, so it's converted to text before compareVisual ever sees
  // it — everything else in this function (crop, thumbnails) still only
  // deals with the SITE side, which is always real screenshots either way.
  let extractedText: string | null = null;
  let reference: ImageInput | TextInput;
  if (isOfficeDoc(refMime)) {
    const extracted = await extractOfficeDocContent(refBuffer, refMime);
    extractedText = extracted.text;
    reference = { text: extracted.text, images: extracted.images };
  } else {
    reference = refMime === 'image/svg+xml'
      ? { buffer: await rasterizeSvgToPng(refBuffer), mimeType: 'image/png' as const }
      : { buffer: refBuffer, mimeType: refMime };
  }

  const result = await compareVisual(
    mode,
    reference,
    siteBufs.map(buf => ({ buffer: buf, mimeType: 'image/png' as const })),
    siteLabels
  );

  const matchCrop = 'error' in result ? null : await buildMatchCrop(result, siteBufs);

  return {
    result,
    images: {
      // Only rendered as a thumbnail if the browser can display it
      // directly — a PDF or Office file's base64 isn't something an <img>
      // tag can show, and re-rendering one to an image is out of scope for
      // v1. SVG displays fine as-is (unrasterized, sharper than the copy
      // sent to Claude).
      a: (refMime === 'application/pdf' || isOfficeDoc(refMime)) ? null : `data:${refMime};base64,${refBuffer.toString('base64')}`,
      // Shown instead of a thumbnail for a Word/Excel reference, so the
      // panel isn't just blank — the same text Claude actually compared
      // against, not a re-derived summary.
      aText: extractedText,
      b: siteBufs.map(buf => `data:image/png;base64,${buf.toString('base64')}`),
      // Which real URL each site frame came from, when the reference
      // document itself named extra pages to check (see
      // extractSameSiteUrls below) — lets the UI show which screenshot is
      // which page instead of a bare "Site frame N".
      bLabels: siteLabels ?? null,
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
    if (mode === 'figma-vs-site') {
      const figmaUrl = String(req.body.figmaUrl ?? '').trim();
      const siteUrl = String(req.body.siteUrl ?? '').trim();
      if (!figmaUrl || !siteUrl) {
        res.status(400).json({ error: 'Both a Figma frame URL and a Site URL are required.' });
        return;
      }

      const ref = parseFigmaUrl(figmaUrl);
      if (!ref) {
        res.status(400).json({ error: 'Could not read a frame from that Figma URL — select one specific frame in Figma, then use "Copy link to selection" (a whole-file link with no node-id isn\'t enough).' });
        return;
      }

      const [figmaBuf, siteBuf] = await Promise.all([
        fetchFigmaFrameImage(ref.fileKey, ref.nodeId),
        captureFullPageScreenshot(siteUrl),
      ]);

      const { result, images } = await runImageSection('figma-vs-site', figmaBuf, 'image/png', [siteBuf]);
      res.json({ ...result, mode, images });
      return;
    }

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
              aText: null,
              b: [`data:image/png;base64,${popupSiteBuf.toString('base64')}`],
              bLabels: null,
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
    // carousel gets at least one full rotation.
    //
    // Document vs Site instead looks for OTHER PAGES the reference document
    // itself names (see extractSameSiteUrls) — possible for Word/Excel (real
    // extracted text) and PDF (text-layer extraction via pdf-parse) alike;
    // only a plain image reference stays single-page, since there's no text
    // to scan before ever capturing a screenshot.
    let siteBufs: Buffer[];
    let siteLabels: string[] | undefined;
    if (mode === 'asset-vs-site') {
      siteBufs = await captureMultipleFrames(siteUrl);
    } else {
      let extraUrls: string[] = [];
      const fileMime = mimeTypeFor(file);
      if (isOfficeDoc(fileMime)) {
        const preExtracted = await extractOfficeDocContent(file.buffer, fileMime);
        extraUrls = extractSameSiteUrls(preExtracted.text, siteUrl);
      } else if (fileMime === 'application/pdf') {
        const pdfText = await extractPdfText(file.buffer);
        extraUrls = extractSameSiteUrls(pdfText, siteUrl);
      }

      const captured: { url: string; buf: Buffer }[] = [];
      for (const u of [siteUrl, ...extraUrls]) {
        try {
          captured.push({ url: u, buf: await captureFullPageScreenshot(u) });
        } catch (e) {
          // The MAIN url failing is a real error the outer catch should
          // report; an EXTRA page the document happened to mention being
          // unreachable (wrong/stale link, requires auth, etc.) shouldn't
          // fail the whole check — it's just one less page to check.
          if (u === siteUrl) throw e;
          console.warn(`[WARN] Could not capture "${u}" (mentioned in the reference document) — skipping it:`, e instanceof Error ? e.message : e);
        }
      }
      siteBufs = captured.map(c => c.buf);
      siteLabels = captured.length > 1 ? captured.map(c => c.url) : undefined;
    }

    const { result, images } = await runImageSection(mode, file.buffer, mimeTypeFor(file), siteBufs, siteLabels);
    res.json({ ...result, mode, images });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Visual Check failed:', msg);
    res.status(200).json({ error: `Couldn't complete the comparison: ${msg}` });
  }
});

// Builds the PDF/Excel from the images already rendered in the browser (no
// re-comparison, no upload) inside a throwaway temp folder, then streams the
// single finished file back as a download so it lands in the browser's
// Downloads folder. The temp folder is always removed afterwards, so nothing
// is left in the project. See gui/visual-export.ts for the actual builders.
app.post('/visual-check/export', async (req, res) => {
  const data = req.body?.data as VisualExportInput | undefined;
  const format = String(req.body?.format ?? '');
  if (!data || !data.mode || (format !== 'pdf' && format !== 'xlsx')) {
    res.status(400).json({ error: 'Missing result data or an invalid export format.' });
    return;
  }

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-check-export-'));
  const cleanUp = () => fs.rmSync(outDir, { recursive: true, force: true });

  try {
    const sections = saveExportImages(data, outDir);
    const filePath = format === 'pdf'
      ? await buildPdfExport(sections, data.mode, data.model, outDir)
      : await buildExcelExport(sections, data.mode, outDir);

    const downloadName = `visual-check-${data.mode}-${localTimestampToken()}.${format}`;
    res.download(filePath, downloadName, err => {
      if (err) console.error('Visual Check export download failed:', err.message);
      cleanUp();
    });
  } catch (err) {
    cleanUp();
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Visual Check export failed:', msg);
    res.status(200).json({ error: `Couldn't build the export: ${msg}` });
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

// port, when known, comes straight from the xlsx filename's own suffix (see
// parseXlsxRunInfo) and names this exact run's report-<port> folder — no
// guessing needed. Falls back to picking the most-recently-modified
// report-* folder only for older xlsx files written before that suffix
// existed, or if the exact folder is somehow missing.
function findReportFolder(brand: string, geo: string, dateStr: string, port: number | null): string | null {
  const dir = path.join(process.cwd(), 'Test Reports', brand, geo, dateStr);
  if (!fs.existsSync(dir)) return null;
  if (port != null) {
    const exact = `report-${port}`;
    if (fs.existsSync(path.join(dir, exact))) return exact;
  }
  const candidates = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith('report-'))
    .map(e => e.name);
  if (candidates.length === 0) return null;
  return candidates
    .map(name => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0].name;
}

// Recovers which run this xlsx belongs to. New files are named
// "<base>_<local-timestamp-with-dashes>_<port>.xlsx" (excel-reporter.cjs) —
// the timestamp restores cleanly into the exact instant the run finished
// (no trailing Z: the digits are this machine's own local wall clock, not
// UTC — see helpers/run-token.cjs — so re-parsing it without a timezone
// designator correctly lands back on that same local instant), and the
// port is the same one portForKey() gave that run's report folder. Older
// files (written before this suffix existed) fall back to the file's own
// mtime so every run still gets a distinguishable runTime to group/sort
// same-day reruns by, just without a matched report link.
function parseXlsxRunInfo(filePath: string, fileName: string): { runTime: string; port: number | null } {
  const m = fileName.match(/_(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})(?:_(\d+))?\.xlsx$/);
  if (m) {
    const [, datePart, hh, mm, ss, ms, portStr] = m;
    return {
      runTime: `${datePart}T${hh}:${mm}:${ss}.${ms}`,
      port: portStr ? Number(portStr) : null,
    };
  }
  return { runTime: fs.statSync(filePath).mtime.toISOString(), port: null };
}

type RunReport = {
  brand: string;
  geo: string;
  date: string;
  runTime: string;
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
    // The trailing -<HH-mm-ss> run token (added when /run creates the
    // session — see excelReportFile) tells us exactly which session this
    // workbook belongs to; older files written before that token existed
    // still match via the optional group and fall back to file mtime below.
    // No trailing Z: the token is this machine's local wall clock, not UTC
    // (see helpers/run-token.cjs), so re-parsing it without a timezone
    // designator lands back on that same local instant.
    const match = file.match(/^([A-Za-z0-9]+)-(\d{4}-\d{2}-\d{2})(?:-(\d{2}-\d{2}-\d{2}))?\.xlsx$/);
    if (!match) continue;
    const [, brand, date, token] = match;
    const runTime = token
      ? `${date}T${token.replace(/-/g, ':')}.000`
      : fs.statSync(path.join(combinedDir, file)).mtime.toISOString();

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
          const folder = findReportFolder(brand, geo, date, null);
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
          brand, geo, date, runTime,
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

        for (const file of xlsxFiles) {
          try {
            const filePath = path.join(dateDir, file);
            const { runTime, port } = parseXlsxRunInfo(filePath, file);
            const folder = findReportFolder(brand.name, geo.name, dateEntry.name, port);
            const reportUrl = folder
              ? `/reports/${brand.name}/${geo.name}/${dateEntry.name}/${folder}/index.html`
              : null;

            const wb = new ExcelJS.Workbook();
            await wb.xlsx.readFile(filePath);

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
              runTime,
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
    runTime: string;
    specs: string[];
    passed: number;
    failed: number;
    flaky: number;
    reportUrl: string | null;
  }>;
};

type BrandSummary = {
  brand: string;
  geos: string[];
  passed: number;
  failed: number;
  flaky: number;
  passRatePct: number;
  lastRunDate: string;
  status: 'healthy' | 'watch' | 'issue' | 'known-issue';
  knownIssueNote: string | null;
};

// Same file the Netlify overview's build-data.cjs reads — one shared source
// of truth, so confirming a brand's failure as a script issue (not a real
// product bug) in one place calms the alarm in both places. Scoped to
// appliesToDate: if that brand's latest run moves to a new date, the entry
// stops applying automatically and the brand goes back to full "Needs
// attention" alarm until someone re-confirms the new failure — a stale note
// must never silently mask a genuinely new failure landing on the same brand.
const KNOWN_ISSUES_PATH = path.join(__dirname, '..', 'dashboard', 'known-issues.json');
function loadKnownIssues(): Record<string, { appliesToDate: string; note: string }> {
  try {
    return JSON.parse(fs.readFileSync(KNOWN_ISSUES_PATH, 'utf8')).brands || {};
  } catch {
    return {};
  }
}

// Each brand's OWN most-recent run only (not summed across every date it's
// ever run) — mirrors the Netlify overview's Brands table: "how is this
// brand doing right now", not a growing pile of stale numbers from weeks of
// reruns. A brand that hasn't been retested today still shows its last real
// result instead of vanishing from the table.
function buildBrandSummary(runs: RunReport[]): BrandSummary[] {
  const knownIssues = loadKnownIssues();
  const latestDateByBrand = new Map<string, string>();
  for (const r of runs) {
    const cur = latestDateByBrand.get(r.brand);
    if (!cur || r.date > cur) latestDateByBrand.set(r.brand, r.date);
  }
  const currentRuns = runs.filter(r => r.date === latestDateByBrand.get(r.brand));

  const byBrand = new Map<string, { passed: number; failed: number; flaky: number; geos: Set<string>; lastRunDate: string }>();
  for (const r of currentRuns) {
    if (!byBrand.has(r.brand)) {
      byBrand.set(r.brand, { passed: 0, failed: 0, flaky: 0, geos: new Set(), lastRunDate: r.date });
    }
    const agg = byBrand.get(r.brand)!;
    agg.passed += r.passed;
    agg.failed += r.failed;
    agg.flaky += r.flaky;
    agg.geos.add(r.geo);
  }

  return [...byBrand.entries()]
    .map(([brand, agg]) => {
      const totalExecuted = agg.passed + agg.failed + agg.flaky;
      const known = knownIssues[brand];
      const isKnownIssue = agg.failed > 0 && known && known.appliesToDate === agg.lastRunDate;
      return {
        brand,
        geos: [...agg.geos].sort((a, b) => a.localeCompare(b)),
        passed: agg.passed,
        failed: agg.failed,
        flaky: agg.flaky,
        passRatePct: totalExecuted > 0 ? Math.round((agg.passed / totalExecuted) * 1000) / 10 : 0,
        lastRunDate: agg.lastRunDate,
        // Plain status for a non-technical glance: any real failure means
        // "issue" regardless of how small; flaky-only (no hard failures,
        // just an inconsistent result) is a lesser "watch" state — unless
        // known-issues.json has already confirmed this exact failing run as
        // a script bug, in which case it's calmed down to "known-issue".
        status: isKnownIssue ? 'known-issue' : agg.failed > 0 ? 'issue' : agg.flaky > 0 ? 'watch' : 'healthy',
        knownIssueNote: isKnownIssue ? known.note : null,
      } as BrandSummary;
    })
    .sort((a, b) => b.lastRunDate.localeCompare(a.lastRunDate) || a.brand.localeCompare(b.brand));
}

app.get('/dashboard', async (_req, res) => {
  const { reports: runs, tests } = await scanRunReports();
  const brands = buildBrandSummary(runs);

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
  ) as { totalRuns: number; totalPassed: number; totalFailed: number; totalFlaky: number; lastRunDate: string | null; totalTests: number; passRatePct: number | null };

  // Plain-language headline for the Dashboard's hero tile: "of what actually
  // ran, what fraction came back clean" — skipped tests aren't part of the
  // denominator since they were never executed, so they can't count for or
  // against health.
  const totalExecuted = stats.totalPassed + stats.totalFailed + stats.totalFlaky;
  stats.totalTests = totalExecuted;
  stats.passRatePct = totalExecuted > 0 ? Math.round((stats.totalPassed / totalExecuted) * 1000) / 10 : null;

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
      runTime: r.runTime,
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
  res.json({ stats, days, tests: tests.slice(0, 500), brands });
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
  // Exact report-<port> folder each GEO's run produced in THIS session, so
  // /upload-to-netlify can publish those folders and not whichever report-*
  // folder happens to be newest on disk (a later one-test re-run would be).
  reportFolders: Record<string, string>;
  index: number;
  state: MultiState;
  res: express.Response;
  proc: ReturnType<typeof spawn> | null;
  stoppedByUser: boolean;
  // Set while the browser is disconnected but the run is still being given
  // a chance to reconnect (see attachDisconnectHandler) — cleared the
  // moment a /run/:id/resume call reattaches a live response.
  disconnectTimer: NodeJS.Timeout | null;
  // Outbound IP recorded the moment this session paused for a VPN switch —
  // see confirmVpnSwitched()'s comment for why this exists.
  lastIpBeforeSwitch: string | null;
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
  notifySlack({
    emoji: '▶️',
    title: `Now running ${session.brand} ${geo}`,
    color: 'running',
    footer: `Step ${session.index + 1} of ${session.geos.length}`,
  });

  const projectArgs =
    session.device === 'both' ? [] : ['--project', session.device === 'mobile' ? `${geo}-mobile` : geo];
  // 'tests' alone would sweep in tests/tracking and
  // tests/requirements-parser.spec.ts too — neither is in scope for a
  // Regression Check run (tracking's specs are a separate ticket-driven
  // feature — see PLAN.md's Tracking Tag Checker — and require
  // QA_TAG_ID/QA_BASE_URL that only src/agent.ts's flow sets, not this GUI
  // run). "All Tests" means all of p1/p2/p3 plus v-p1/v-p2/v-p3, not
  // literally everything under tests/ — same tiers discoverSpecs() scopes
  // to. Functional tiers listed before visual ones so functional finishes
  // first on a single-worker run (playwright.config.ts: workers: 1) — the
  // team wants functional coverage confirmed before visual runs at all.
  const specArgs = session.spec === ALL_SPECS_VALUE
    ? [...TEST_TIERS, ...VISUAL_TIERS].map(tier => `tests/${tier}`)
    : [session.spec];

  // Markets with no live site yet (brand-urls.ts's liveUrl: null, e.g. SNG/AB,
  // MC/AB) only have a QA environment to test against — playwright.config.ts
  // defaults TEST_ENV to 'live', so without this the run fails instantly with
  // "No live URL found" before a single test even opens a page.
  const testEnv = getLiveUrl(session.brand, geo) === null ? 'qa' : undefined;

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
      ...(testEnv ? { TEST_ENV: testEnv } : {}),
    },
  });
  session.proc = proc;

  proc.stdout.on('data', chunk => emit({ type: 'log', text: chunk.toString() }));
  proc.stderr.on('data', chunk => emit({ type: 'log', text: chunk.toString() }));

  proc.on('close', async exitCode => {
    session.proc = null;
    if (session.stoppedByUser) {
      emit({ type: 'stopped' });
      notifySlack({ emoji: '⏹️', title: `Test run stopped — ${session.brand} ${geo}`, color: 'stopped' });
      session.res.end();
      multiSessions.delete(session.id);
      return;
    }

    const folder = findReportFolder(session.brand, geo, session.dateStr, null);
    const reportUrl = folder
      ? `/reports/${session.brand}/${geo}/${session.dateStr}/${folder}/index.html`
      : null;
    if (folder) session.reportFolders[geo] = folder;
    emit({ type: 'geo-done', geo, exitCode, reportUrl, step: session.index + 1, total: session.geos.length });

    // Trims this brand/GEO/date's older run-*/report-* folders down to the
    // most recent few now that each rerun keeps its own instead of
    // overwriting — done right after this run's own folder is confirmed to
    // exist, so it's never the one folder getting pruned.
    pruneOldRuns(session.brand, geo, session.dateStr);

    const excelPath = path.join(process.cwd(), 'combined-reports', `${session.excelReportFile}.xlsx`);
    const stats = await readExcelSummary(excelPath, geo);

    session.index += 1;
    if (session.index < session.geos.length) {
      session.state = 'awaiting-vpn';
      session.lastIpBeforeSwitch = await fetchOutboundIp();
      const nextGeo = session.geos[session.index];
      emit({ type: 'awaiting-vpn', geo: nextGeo, step: session.index + 1, total: session.geos.length });
      notifySlack({
        emoji: stats && stats.failed > 0 ? '❌' : '✅',
        title: `${session.brand} ${geo} finished`,
        color: stats && stats.failed > 0 ? 'failure' : 'success',
        body: `⚠️ Switch your VPN to *${nextGeo}* now, then hit Continue in the GUI.`,
        stats,
        footer: `Step ${session.index + 1} of ${session.geos.length} next`,
      });
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
      notifySlack({
        emoji: '⏹️',
        title: `Test run stopped — ${session.brand}`,
        color: 'stopped',
        body: 'Stopped during report merge.',
      });
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
    const stats = await readExcelSummary(excelPath);

    session.state = 'done';
    // brand/dateStr included so the client can still call /review-run and
    // /upload-to-netlify after this — the session itself is deleted right
    // below, so those fields (plus excelReportFile/reportFolders, which pin
    // an upload to this exact run) won't be recoverable any other way once
    // this event has gone out.
    emit({
      type: 'all-done', exitCode, mergedReportUrl, excelUrl,
      brand: session.brand, dateStr: session.dateStr,
      excelReportFile: session.excelReportFile, reportFolders: session.reportFolders,
    });
    notifySlack({
      emoji: '🎉',
      title: `${session.brand} run complete`,
      color: stats && stats.failed > 0 ? 'failure' : 'success',
      body: `All ${session.geos.length} GEO(s) finished: ${session.geos.join(', ')}`,
      stats,
    });
    session.res.end();
    multiSessions.delete(session.id);
  });
}

// ── Review + Upload-to-Netlify (Results panel) ─────────────────────────────
// Added 2026-09-29 so reviewing a finished run's results and publishing them
// to the QA Automated Regression Results Netlify site are GUI actions,
// instead of asking Claude in chat to do both by hand every time (see
// upload-todays-results.cjs's own header comment for the manual version of
// step 2). Both take {brand, dateStr} in the POST body — the session itself
// is already gone by the time these can be clicked (deleted right after
// 'all-done' fires, see finishMultiSession above), so the client re-sends
// what it captured from that event instead of a session id.

function isValidBrand(brand: string): boolean {
  return BRAND_URLS.some(e => e.brand === brand);
}

function isValidDateStr(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

// Mirrors findReportFolder's shape but for the raw run-<HH-MM-SS>/test-results
// folders (Playwright's own JSON reporter output) rather than the merged
// report-#### folders — see playwright.config.ts's outputDir for why every
// invocation gets its own timestamped subfolder.
//
// Returns every run folder of the day, newest first. Callers pick the fullest
// one (see gatherRunReviewData) rather than blindly the newest: a one-test
// re-run after a full run is newer but is not what was being reviewed.
function listRunFolders(brand: string, geo: string, dateStr: string): string[] {
  const dir = path.join(process.cwd(), 'Test Reports', brand, geo, dateStr);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith('run-'))
    .map(e => ({ name: e.name, mtime: fs.statSync(path.join(dir, e.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map(e => e.name);
}

type ReviewTestEntry = {
  geo: string;
  // Playwright runs desktop and mobile as separate projects (`AB` vs
  // `AB-mobile`), so the same spec fails once per platform — the Jira ticket
  // needs to say which, and the Triage table needs one row per platform.
  platform: 'Desktop' | 'Mobile';
  specFile: string;
  title: string;
  status: string;
  // Only populated for 'unexpected'/'flaky' — the real error message +
  // source location from the LAST attempt that actually failed, stripped of
  // ANSI color codes (Playwright embeds them raw in results.json, unreadable
  // once dropped into a plain-text prompt or JSON string).
  errorMessage: string | null;
  errorLocation: string | null;
  // Absolute paths to the failing attempt's screenshot and Playwright
  // error-context.md (page snapshot at the moment of failure). Server-side
  // only — never sent to the browser; evidence is served by finding id.
  evidence: { screenshot: string | null; errorContext: string | null };
};

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

// Playwright's JSON reporter nests specs inside an arbitrarily deep tree of
// suites (describe blocks, project, file) — this just wants every leaf
// spec's title + its test's final status, not the tree shape itself.
function extractTestEntries(resultsJson: any, geo: string, resultsDir: string): ReviewTestEntry[] {
  const out: ReviewTestEntry[] = [];
  // Playwright writes attachment paths absolute, but resolve a relative one
  // against results.json's own folder rather than assume.
  const abs = (p: unknown): string | null =>
    typeof p === 'string' && p ? (path.isAbsolute(p) ? p : path.join(resultsDir, p)) : null;
  function walk(suite: any): void {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const status = String(test.status ?? 'unknown');
        let errorMessage: string | null = null;
        let errorLocation: string | null = null;
        const evidence: ReviewTestEntry['evidence'] = { screenshot: null, errorContext: null };
        if (status === 'unexpected' || status === 'flaky') {
          // Walk attempts in reverse — the failure worth explaining is
          // whichever attempt actually failed, not necessarily the last one
          // in the array (a flaky test's final attempt passed with no error).
          const results = Array.isArray(test.results) ? test.results : [];
          for (let i = results.length - 1; i >= 0; i--) {
            const r = results[i];
            if (r?.error?.message) {
              errorMessage = String(r.error.message).replace(ANSI_PATTERN, '').trim().slice(0, 500);
              const loc = r.error.location;
              if (loc?.file) {
                errorLocation = `${String(loc.file).split(/[\\/]/).pop()}:${loc.line ?? '?'}`;
              }
              const attachments: any[] = Array.isArray(r.attachments) ? r.attachments : [];
              evidence.screenshot = abs(attachments.find(a => a?.name === 'screenshot')?.path);
              evidence.errorContext = abs(attachments.find(a => a?.name === 'error-context')?.path);
              break;
            }
          }
        }
        const platform = /mobile/i.test(String(test.projectName ?? '')) ? 'Mobile' : 'Desktop';
        out.push({ geo, platform, specFile: String(spec.file ?? ''), title: spec.title, status, errorMessage, errorLocation, evidence });
      }
    }
    for (const s of suite.suites ?? []) walk(s);
  }
  for (const s of resultsJson.suites ?? []) walk(s);
  return out;
}

async function gatherRunReviewData(brand: string, dateStr: string): Promise<ReviewTestEntry[]> {
  const brandDir = path.join(process.cwd(), 'Test Reports', brand);
  if (!fs.existsSync(brandDir)) return [];
  const geos = fs.readdirSync(brandDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('_'))
    .map(e => e.name);
  const entries: ReviewTestEntry[] = [];
  for (const geo of geos) {
    // Fullest run of the day wins (most tests; newest breaks a tie) — the same
    // rule the public overview uses — so a one-test re-run made after the full
    // run doesn't replace it in Review/Triage.
    let best: ReviewTestEntry[] = [];
    for (const runFolder of listRunFolders(brand, geo, dateStr)) {
      const resultsPath = path.join(brandDir, geo, dateStr, runFolder, 'test-results', 'results.json');
      if (!fs.existsSync(resultsPath)) continue;
      try {
        const json = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
        const runEntries = extractTestEntries(json, geo, path.dirname(resultsPath));
        if (runEntries.length > best.length) best = runEntries;
      } catch {
        // Unreadable/partial results.json (e.g. a run still in progress) — skip
        // this run rather than failing the whole review.
      }
    }
    entries.push(...best);
  }
  return entries;
}

// ── Triage findings ──────────────────────────────────────────────────────
// A "finding" is one failing/flaky test in one GEO, however many platforms it
// failed on — a Login bug that breaks on desktop AND mobile is ONE problem
// and gets ONE row and ONE Jira ticket (QA Reporting Protocol §4.7: state an
// issue once, list everything it affects). This is the single place that
// decides what a finding is; Triage rows, Review verdicts and the saved
// outcomes all hang off the same id so they can't drift apart.
// (Finding type lives in ./jira-ticket so both modules share one definition.)

const findingId = (geo: string, title: string): string => `${geo}|${title}`;

function groupFindings(entries: ReviewTestEntry[]): Finding[] {
  const byId = new Map<string, Finding>();
  for (const e of entries) {
    if (e.status !== 'unexpected' && e.status !== 'flaky') continue;
    const status: Finding['status'] = e.status === 'unexpected' ? 'failed' : 'flaky';
    const id = findingId(e.geo, e.title);
    const cur = byId.get(id);
    if (!cur) {
      byId.set(id, {
        id, geo: e.geo, title: e.title, specFile: e.specFile, platforms: [e.platform],
        status, errorMessage: e.errorMessage, errorLocation: e.errorLocation,
        evidence: [{ platform: e.platform, ...e.evidence }],
      });
      continue;
    }
    if (!cur.platforms.includes(e.platform)) {
      cur.platforms.push(e.platform);
      cur.evidence.push({ platform: e.platform, ...e.evidence });
    }
    // A real failure on one platform outranks a flake on the other, and the
    // error shown should be the failing one's.
    if (status === 'failed' && cur.status === 'flaky') {
      cur.status = 'failed';
      cur.errorMessage = e.errorMessage;
      cur.errorLocation = e.errorLocation;
    } else if (!cur.errorMessage && e.errorMessage) {
      cur.errorMessage = e.errorMessage;
      cur.errorLocation = e.errorLocation;
    }
  }
  const findings = [...byId.values()];
  for (const f of findings) f.platforms.sort((a, b) => (a === b ? 0 : a === 'Desktop' ? -1 : 1));
  // Failures before flakes; Array.sort is stable so GEO/test order is kept.
  return findings.sort((a, b) => Number(b.status === 'failed') - Number(a.status === 'failed'));
}

// ── Saved triage outcomes ────────────────────────────────────────────────
// What a human decided about each finding, kept per brand + run date (a new
// run date never inherits an old verdict — same deliberate scoping as
// dashboard/known-issues.json). Lives under the brand's reserved `_triage`
// folder: every Test Reports scanner already skips `_`-prefixed folders.
// 'ticket_created' is written only by the Jira step, never by the manual buttons.
type TriageOutcomeKind = 'script_issue' | 'ignored' | 'ticket_created';
type StoredOutcome = {
  geo: string;
  title: string;
  outcome: TriageOutcomeKind;
  ticketKey?: string;
  ticketUrl?: string;
  updatedAt: string;
};

const triageStorePath = (brand: string, dateStr: string): string =>
  path.join(process.cwd(), 'Test Reports', brand, '_triage', `${dateStr}.json`);

function readTriageStore(brand: string, dateStr: string): Record<string, StoredOutcome> {
  const file = triageStorePath(brand, dateStr);
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed.findings === 'object' && parsed.findings ? parsed.findings : {};
  } catch {
    // Never overwrite an unreadable file in place — set it aside so whatever
    // was in it can still be recovered by hand, then start clean.
    try { fs.renameSync(file, file.replace(/\.json$/, `.corrupt-${Date.now()}.json`)); } catch { /* best effort */ }
    return {};
  }
}

// Temp file + rename: a crash mid-write leaves the old file intact instead of
// a half-written one.
function writeTriageStore(brand: string, dateStr: string, findings: Record<string, StoredOutcome>): void {
  const file = triageStorePath(brand, dateStr);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, brand, dateStr, findings }, null, 2));
  fs.renameSync(tmp, file);
}

// The Triage table's rows — straight from Playwright's own results, no AI, so
// it fills in the moment a run finishes. Review (below) adds the
// site-vs-script verdict per row, matched back by finding id; any outcome a
// human already saved comes back attached to its row.
app.post('/triage-run', async (req, res) => {
  const brand = String(req.body?.brand ?? '');
  const dateStr = String(req.body?.dateStr ?? '');
  if (!isValidBrand(brand) || !isValidDateStr(dateStr)) {
    res.status(400).json({ error: 'Invalid brand or date.' });
    return;
  }

  const entries = await gatherRunReviewData(brand, dateStr);
  const saved = readTriageStore(brand, dateStr);

  // A ticket that was deleted in Jira must not keep the row marked "created"
  // (and must not keep blocking a new one). Only a definite "not found" from
  // Jira releases the row; if Jira can't be reached or asked, nothing changes.
  const ticketed = Object.entries(saved).filter(([, s]) => s.outcome === 'ticket_created' && s.ticketKey);
  if (ticketed.length > 0) {
    const gone = await Promise.all(ticketed.map(async ([, s]) => {
      try {
        await new JiraClient().getTicket(s.ticketKey as string);
        return false;
      } catch (e) {
        return (e as any)?.response?.status === 404;
      }
    }));
    let released = false;
    ticketed.forEach(([id, s], i) => {
      if (!gone[i]) return;
      console.warn(`[triage-run] ${s.ticketKey} no longer exists in Jira — releasing "${s.title}" (${s.geo}) so it can be reported again.`);
      delete saved[id];
      released = true;
    });
    if (released) writeTriageStore(brand, dateStr, saved);
  }

  res.json({
    brand,
    dateStr,
    total: entries.length,
    // `evidence` holds absolute file paths — server-side only.
    findings: groupFindings(entries).map(f => {
      const { evidence: _evidence, ...rest } = f;
      return {
        ...rest,
        environment: findingEnvironment(brand, f),
        plainError: plainError(f.errorMessage),
        saved: saved[f.id] ?? null,
      };
    }),
  });
});

// One finding in full (incl. evidence paths) for the Jira ticket module.
// Re-derived from the run's own results on every call, so a caller can only
// ever reach a finding that really exists in that run.
async function findFinding(brand: string, dateStr: string, geo: string, title: string): Promise<Finding | null> {
  return groupFindings(await gatherRunReviewData(brand, dateStr)).find(f => f.id === findingId(geo, title)) ?? null;
}

registerJiraTicketRoutes(app, {
  isValidBrand,
  isValidDateStr,
  findFinding,
  getSavedTicket: (brand, dateStr, finding) => {
    const saved = readTriageStore(brand, dateStr)[finding.id];
    return saved?.outcome === 'ticket_created' && saved.ticketKey && saved.ticketUrl
      ? { key: saved.ticketKey, url: saved.ticketUrl }
      : null;
  },
  // The only writer of 'ticket_created' (see StoredOutcome's comment).
  recordTicket: (brand, dateStr, finding, ticket) => {
    const saved = readTriageStore(brand, dateStr);
    saved[finding.id] = {
      geo: finding.geo,
      title: finding.title,
      outcome: 'ticket_created',
      ticketKey: ticket.key,
      ticketUrl: ticket.url,
      updatedAt: new Date().toISOString(),
    };
    writeTriageStore(brand, dateStr, saved);
  },
});

// Manual outcomes only: "this is a script problem" / "not an issue", or
// clearing one again. Refuses anything that isn't a real finding in that run
// (no junk keys) and never touches a finding that already has a Jira ticket.
app.post('/triage-outcome', async (req, res) => {
  const brand = String(req.body?.brand ?? '');
  const dateStr = String(req.body?.dateStr ?? '');
  const geo = String(req.body?.geo ?? '');
  const title = String(req.body?.title ?? '');
  const outcome = String(req.body?.outcome ?? '');
  if (!isValidBrand(brand) || !isValidDateStr(dateStr) || !['script_issue', 'ignored', 'clear'].includes(outcome)) {
    res.status(400).json({ error: 'Invalid brand, date or outcome.' });
    return;
  }

  const finding = groupFindings(await gatherRunReviewData(brand, dateStr)).find(f => f.id === findingId(geo, title));
  if (!finding) {
    res.status(404).json({ error: 'That finding is not part of this run.' });
    return;
  }

  const saved = readTriageStore(brand, dateStr);
  if (saved[finding.id]?.outcome === 'ticket_created') {
    res.status(409).json({ error: 'This finding has already been reported in Jira.', saved: saved[finding.id] });
    return;
  }

  if (outcome === 'clear') {
    delete saved[finding.id];
  } else {
    saved[finding.id] = { geo: finding.geo, title: finding.title, outcome: outcome as TriageOutcomeKind, updatedAt: new Date().toISOString() };
  }
  writeTriageStore(brand, dateStr, saved);
  res.json({ saved: saved[finding.id] ?? null });
});

// ── Review: AI verdict per failing/flaky check ───────────────────────────
// Shared by the main Review call and the one-off retry for any check whose
// verdict came back missing, so both ask for exactly the same thing.
const REVIEW_VERDICT_GUIDE = `For EACH of the following failing/flaky checks, decide whether it's more likely a REAL SITE ISSUE (a real problem with the actual website — broken content, missing page, wrong behavior, translation bug, etc.) or a SCRIPT ISSUE (a problem with the test code itself — wrong selector, timing/race condition, environment/VPN flakiness, outdated assumption about the page). Base this on the actual error message and source location given, not just the test name. Use "unclear" only when the error message genuinely gives no useful signal either way — it is not a safe default. An unknown environment is NOT a reason to leave a check out or to answer "unclear": give your best read and say what would settle it.

FIRST look at "Page the test saw when it failed". If that page is not the page the test meant to check — a login or sign-in wall, a bot or security check, an access-denied or "blocked" page, an error or maintenance page — the real site was never tested, so it is neither a site issue nor a script issue: answer "blocked". Say what the page IS and who is stopping the test (for example "The site is behind a sign-in page, so the test could not get in"), and do NOT describe or list what is on that page (its headings, fields or buttons).

How to write your notes (they are read by QA teammates and managers, not developers): plain everyday English only. Describe what a person visiting the page would see wrong. NEVER mention selectors, CSS classes, element names, locators, timeouts, test code, frameworks or file names. Name the environment correctly from the "Environment" line of each check — say "the QA site" for a QA-site result and "the live site" for a live one, and never call a QA-site result live. If you are not sure it is a real site issue, say what would settle it in plain words.`;

function describeChecks(brand: string, list: Finding[]): string {
  return list.map((f, i) => `${i + 1}. [${f.geo}] ${f.title} (${f.status} on ${f.platforms.join(' + ')})
   Environment: ${({ QA: 'the QA (pre-release test) site', Live: 'the live site', Unknown: 'not known' } as const)[findingEnvironment(brand, f)]}
   Error: ${f.errorMessage ?? '(no error message captured)'}
   Location: ${f.errorLocation ?? '(unknown)'}
   Page the test saw when it failed (start of its saved snapshot): ${pageSnapshotExcerpt(f, 1200) || '(not available)'}`).join('\n\n');
}

// Despite the "ONLY JSON" instruction, a stray prose prefix or a ```json fence
// has been observed, so take the outermost {...} rather than the whole reply.
function extractJsonObject(raw: string): any | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  try {
    return JSON.parse(start !== -1 && end > start ? raw.slice(start, end + 1) : raw);
  } catch {
    return null;
  }
}

app.post('/review-run', async (req, res) => {
  const brand = String(req.body?.brand ?? '');
  const dateStr = String(req.body?.dateStr ?? '');
  if (!isValidBrand(brand) || !isValidDateStr(dateStr)) {
    res.status(400).json({ error: 'Invalid brand or date.' });
    return;
  }

  const entries = await gatherRunReviewData(brand, dateStr);
  if (entries.length === 0) {
    res.json({ summary: `No test result data found for ${brand} on ${dateStr}.`, total: 0, geoBreakdown: [], findings: [] });
    return;
  }

  // Playwright's JSON reporter uses 'expected'/'unexpected'/'flaky'/'skipped'
  // on each test's own `status` field (the outcome relative to what was
  // expected), NOT 'passed'/'failed'/'timedOut' — those only appear one
  // level down, per-attempt, inside each test's own `results[]` array.
  // Confirmed live against a real failing run (SNG AB 2026-09-28, 4 real
  // failures) before trusting this — an earlier version of this filter
  // checked for 'failed'/'timedOut'/'interrupted' here and would have
  // silently never matched a single real failure.
  const counts: Record<string, number> = {};
  for (const e of entries) counts[e.status] = (counts[e.status] ?? 0) + 1;
  const skipped = entries.filter(e => e.status === 'skipped');

  // Per-GEO breakdown for the table the client renders under the AI
  // headline — the AI summary alone doesn't give a per-market at-a-glance
  // view the way a table does.
  const geoOrder: string[] = [];
  const geoTallies = new Map<string, { total: number; expected: number; unexpected: number; flaky: number; skipped: number }>();
  for (const e of entries) {
    if (!geoTallies.has(e.geo)) {
      geoOrder.push(e.geo);
      geoTallies.set(e.geo, { total: 0, expected: 0, unexpected: 0, flaky: 0, skipped: 0 });
    }
    const t = geoTallies.get(e.geo)!;
    t.total += 1;
    if (e.status === 'expected') t.expected += 1;
    else if (e.status === 'unexpected') t.unexpected += 1;
    else if (e.status === 'flaky') t.flaky += 1;
    else if (e.status === 'skipped') t.skipped += 1;
  }
  const geoBreakdown = geoOrder.map(geo => ({ geo, ...geoTallies.get(geo)! }));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set — add it to .env to use Review.' });
    return;
  }

  // One entry per finding (desktop + mobile of the same test in the same GEO
  // collapse into one) — half the prompt for a typical run, and exactly one
  // verdict per Triage row.
  const needsAttention = groupFindings(entries);

  try {
    const client = new Anthropic({ apiKey });
    const prompt = `You are triaging a QA regression test run for the brand "${brand}", run on ${dateStr}.

Result counts: ${JSON.stringify(counts)}
Total checks: ${entries.length}

Skipped checks (normal, expected exclusions — no action needed):
${skipped.length ? skipped.map(f => `- [${f.geo}] ${f.title}`).join('\n') : '(none)'}

${needsAttention.length === 0 ? 'There are no failing or flaky checks to classify.' : `${REVIEW_VERDICT_GUIDE}

${describeChecks(brand, needsAttention)}`}

Respond with ONLY a JSON object (no prose before or after it), in exactly this shape:
{
  "headline": "1-2 sentence plain-English overall health summary for a QA teammate, not a developer. State health plainly, don't manufacture concerns if everything's clean, don't downplay real failures. If checks were stopped by a login wall or bot check, say so — that is not a fault on the site.",
  "verdicts": [
    { "geo": "...", "title": "...", "classification": "likely_site_issue" | "likely_script_issue" | "blocked" | "unclear", "plainSummary": "ONE short plain-English sentence saying what is wrong on the page from a visitor's point of view, e.g. 'The Help page shows no FAQ questions.' No technical terms.", "reasoning": "ONE short plain-English sentence (about 25 words at most) on why you think it is a site issue or a test problem" }
  ]
}
"verdicts" must have exactly one entry per failing/flaky check listed above, in the same order, matching "geo" and "title" exactly. Omit "verdicts" entirely (or leave it an empty array) only if there were none to classify.`;

    const response = await client.messages.create({
      model: MODEL,
      // Room for a headline plus ~250 tokens per check; a fixed 1500 would cut
      // the reply off (and drop every verdict) on a run with a dozen failures.
      max_tokens: Math.min(4000, 600 + 250 * needsAttention.length),
      messages: [{ role: 'user', content: prompt }],
    });
    const replyText = (r: Anthropic.Message) => r.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();
    const raw = replyText(response);

    // Not parseable at all: show the raw text as the headline rather than
    // failing the whole review; every check is then picked up by the retry below.
    const parsed: any = extractJsonObject(raw) ?? { headline: raw, verdicts: [] };

    const summary = typeof parsed.headline === 'string' && parsed.headline.trim() ? parsed.headline.trim() : 'Review completed, but no summary text was returned.';
    const validClassifications = new Set(['likely_site_issue', 'likely_script_issue', 'blocked', 'unclear']);
    type Verdict = { classification: string; reasoning: string; plainSummary: string };
    const toVerdict = (v: any): Verdict => ({
      classification: validClassifications.has(v?.classification) ? v.classification : 'unclear',
      reasoning: typeof v?.reasoning === 'string' ? v.reasoning.trim() : '',
      plainSummary: typeof v?.plainSummary === 'string' ? v.plainSummary.trim() : '',
    });
    const norm = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

    // Match each check to its verdict: exact GEO + title first, then ignoring
    // case/spacing, then (only when the AI returned exactly one entry per
    // check, as asked) by position.
    const verdicts = new Map<string, Verdict>();
    const assign = (list: Finding[], rawVerdicts: any[]) => {
      list.forEach((f, i) => {
        if (verdicts.has(f.id)) return;
        const v = rawVerdicts.find(x => x?.geo === f.geo && x?.title === f.title)
          ?? rawVerdicts.find(x => norm(x?.geo) === norm(f.geo) && norm(x?.title) === norm(f.title))
          ?? (rawVerdicts.length === list.length ? rawVerdicts[i] : undefined);
        if (v) verdicts.set(f.id, toVerdict(v));
      });
    };
    assign(needsAttention, Array.isArray(parsed.verdicts) ? parsed.verdicts : []);

    // A page we can positively identify as a gate (Cloudflare Access sign-in,
    // bot check, block page) is stated as fact, not left to the AI's wording —
    // and needs no retry. These overwrite whatever the AI said for that check.
    for (const f of needsAttention) {
      const gate = detectBlockedPage(f);
      if (gate) verdicts.set(f.id, { classification: 'blocked', reasoning: gate.reasoning, plainSummary: gate.plainSummary });
    }

    // A check left without a verdict (seen on MC AB 2026-10-09: the headline
    // came back, the verdict did not, every time) gets ONE focused retry
    // with just those checks, instead of a badge that looks like a real answer.
    const missing = needsAttention.filter(f => !verdicts.has(f.id));
    if (missing.length > 0) {
      console.warn(`[review-run] ${missing.length} of ${needsAttention.length} check(s) came back without a verdict — retrying once. Start of the first reply: ${raw.slice(0, 500)}`);
      try {
        const retry = await client.messages.create({
          model: MODEL,
          max_tokens: Math.min(4000, 400 + 250 * missing.length),
          messages: [{ role: 'user', content: `You are triaging failed QA checks for the brand "${brand}", run on ${dateStr}.

${REVIEW_VERDICT_GUIDE}

${describeChecks(brand, missing)}

Respond with ONLY a JSON object (no prose before or after it), in exactly this shape, with one entry per check above, in the same order, matching "geo" and "title" exactly:
{ "verdicts": [ { "geo": "...", "title": "...", "classification": "likely_site_issue" | "likely_script_issue" | "blocked" | "unclear", "plainSummary": "ONE short plain-English sentence saying what is wrong on the page from a visitor's point of view. No technical terms.", "reasoning": "ONE short plain-English sentence (about 25 words at most) on why you think it is a site issue or a test problem" } ] }` }],
        });
        const retried = extractJsonObject(replyText(retry));
        assign(missing, Array.isArray(retried?.verdicts) ? retried.verdicts : []);
      } catch (retryErr) {
        console.warn(`[review-run] Retry failed: ${(retryErr as Error).message}`);
      }
    }

    res.json({
      summary,
      counts,
      total: entries.length,
      geoBreakdown,
      // Still no verdict after the retry: say so plainly ('unreviewed') rather
      // than a made-up "unclear" — the person judges it from the error details.
      findings: needsAttention.map(f => ({
        id: f.id,
        ...(verdicts.get(f.id) ?? {
          classification: 'unreviewed',
          reasoning: 'The AI did not return a verdict for this check. Judge it from the technical details.',
          plainSummary: '',
        }),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: `Review failed: ${(err as Error).message}` });
  }
});

function runNodeScript(scriptArgs: string[], extraEnv: Record<string, string> = {}): Promise<{ code: number; output: string }> {
  return new Promise(resolve => {
    const proc = spawn('node', scriptArgs, { cwd: process.cwd(), shell: true, env: { ...process.env, ...extraEnv } });
    let output = '';
    proc.stdout.on('data', chunk => { output += chunk.toString(); });
    proc.stderr.on('data', chunk => { output += chunk.toString(); });
    proc.on('close', code => resolve({ code: code ?? 1, output }));
    proc.on('error', err => resolve({ code: 1, output: output + '\n' + err.message }));
  });
}

app.post('/upload-to-netlify', async (req, res) => {
  const brand = String(req.body?.brand ?? '');
  const dateStr = String(req.body?.dateStr ?? '');
  if (!isValidBrand(brand) || !isValidDateStr(dateStr)) {
    res.status(400).json({ error: 'Invalid brand or date.' });
    return;
  }

  // Pins the upload to the exact run that was reviewed. Without it both
  // scripts fall back to "newest file on disk", which silently swaps in a
  // later, smaller re-run of the same brand+date (confirmed 2026-09-29).
  const excelReportFile = String(req.body?.excelReportFile ?? '');
  const rawFolders = req.body?.reportFolders;
  const pinnedFolders: Record<string, string> = {};
  const pinPrefix = `${brand}-${dateStr}-`;
  const pinOk =
    excelReportFile.startsWith(pinPrefix) &&
    /^\d{2}-\d{2}-\d{2}$/.test(excelReportFile.slice(pinPrefix.length)) &&
    rawFolders && typeof rawFolders === 'object' && !Array.isArray(rawFolders) &&
    Object.entries(rawFolders).every(([geo, folder]) => /^[A-Za-z0-9-]+$/.test(geo) && /^report-\d+$/.test(String(folder)));
  if (!pinOk) {
    res.status(400).json({ error: 'This upload is not tied to a specific run (the page may be out of date). Reload it and re-run, or use the "Done Today\'s test" command. Nothing was uploaded.' });
    return;
  }
  for (const [geo, folder] of Object.entries(rawFolders as Record<string, string>)) pinnedFolders[geo] = String(folder);

  const build = await runNodeScript(['dashboard/build-data.cjs'], { PINNED_RUN_FILE: excelReportFile });
  if (build.code !== 0) {
    res.status(500).json({ error: 'dashboard/build-data.cjs failed.', output: build.output });
    return;
  }

  const deploy = await runNodeScript(['deploy-dashboard.cjs'], {
    TEST_BRAND: brand,
    TEST_DATE: dateStr,
    EXCEL_REPORT_FILE: excelReportFile,
    PINNED_REPORT_FOLDERS: JSON.stringify(pinnedFolders),
  });
  if (deploy.code !== 0) {
    res.status(500).json({ error: 'deploy-dashboard.cjs failed.', output: deploy.output });
    return;
  }

  // release-scope.json is a deliberately human-curated allowlist (see its
  // own header comment) — this deliberately does NOT auto-add brand to it,
  // even though the report files upload fine either way. Surface the gap
  // instead of silently publishing a brand to the management-facing Brands
  // table without a human decision.
  let scopeNote: string | null = null;
  try {
    const scope = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'dashboard', 'release-scope.json'), 'utf8'));
    if (!Array.isArray(scope.brands) || !scope.brands.includes(brand)) {
      scopeNote = `${brand} isn't in dashboard/release-scope.json yet, so it won't show on the public Brands overview until someone adds it there.`;
    }
  } catch {
    // Non-fatal — the upload itself already succeeded either way.
  }

  res.json({
    success: true,
    url: 'https://qa-automated-regression-results.netlify.app',
    scopeNote,
    output: deploy.output,
  });
});

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
  // Folded into excelReportFile below so starting a brand-new session for a
  // brand/date that already ran today gets its OWN combined workbook,
  // instead of colliding with (and silently replacing GEO tabs in) an
  // earlier session's workbook from the same day. Every GEO within THIS one
  // session still shares this single token, so they still land as tabs in
  // one workbook, same as before.
  const runToken = localTimeToken();
  const session: MultiSession = {
    id,
    brand,
    geos,
    device,
    spec,
    dateStr,
    // Brand+date+runToken — still easy to pair with the merged HTML report
    // by brand/date, just no longer collides across separate same-day runs.
    excelReportFile: `${brand}-${dateStr}-${runToken}`,
    reportFolders: {},
    index: 0,
    state: 'running',
    res,
    proc: null,
    stoppedByUser: false,
    disconnectTimer: null,
    lastIpBeforeSwitch: null,
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

app.post('/run/:id/continue', async (req, res) => {
  const session = multiSessions.get(req.params.id);
  if (!session || session.state !== 'awaiting-vpn') {
    res.status(400).json({ error: 'No session awaiting a continue right now.' });
    return;
  }
  res.json({ ok: true });
  const nextGeo = session.geos[session.index];
  await confirmVpnSwitched(session, nextGeo);
  // The wait above can take up to ~12s — re-check rather than assume
  // nothing happened in the meantime (the user may have clicked Stop while
  // still paused, which already ended the stream and removed the session).
  if (session.stoppedByUser) return;
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
    notifySlack({
      emoji: '⏹️',
      title: `Test run stopped — ${session.brand}`,
      color: 'stopped',
      body: 'Stopped while awaiting VPN switch.',
    });
    session.res.end();
    multiSessions.delete(session.id);
  }
  res.json({ stopped: true });
});

registerJiraCheckerRoutes(app);

app.listen(PORT, () => {
  console.log(`GUI running at http://localhost:${PORT}`);
});

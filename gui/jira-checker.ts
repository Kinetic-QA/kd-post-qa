// JIRA Checker tab — POC.
//
// Flow: Load Ticket -> (ready?) -> Check (real Playwright run against the
// existing curated spec mapped by AI-interpreted test type, same TEST_MAP
// agent.ts uses — never AI-generated test code) -> review the drafted
// house-style comment -> Commit (human-gated: posts the comment and, only
// then, transitions the ticket).
//
// Deliberately does NOT auto-transition on Load or Check — only Commit and
// Hold touch Jira state, matching the KB's own rule that status transitions
// require an explicit per-action confirmation, comments alone don't.
import type { Express, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { JiraClient } from '../src/jira-client';
import { parseTestType } from '../src/requirements-parser';
import { interpretTicket, VisualCheckKind, DraftedTestCase } from '../src/ticket-interpreter';
import { resolveTestFile, runPlaywrightTest, SUPPORTED_TEST_TYPES, TestRunResult } from '../src/test-runner';
import { getQAUrl, getBrandEntry, resolveBrandFromProjectKey } from '../helpers/brand-urls';
import {
  buildCommentAdf, commentPreviewText, adfDocToPreviewText,
  adfDoc, adfPara, adfBold, adfText, adfBulletList, adfImage,
  CheckPhase, VideoAttachment, CommentContext,
} from '../src/jira-comment';
import { captureFullPageScreenshot, captureMultipleFrames } from './screenshot-capture';
import { compareVisual, VisualCompareResult } from './visual-compare';

// What a "visual check" needs varies by kind — situational, not fixed:
// site-vs-site needs two live URLs (QA vs Production); asset-vs-site needs
// a reference image (from the ticket's own Jira attachment) plus the one
// live site to check it against. Computed once in GET /jira/ticket, reused
// as-is by both the primary "Ready" response and the secondary
// "recommended alongside a functional match" response.
type VisualCheckOption =
  | { kind: 'site-vs-site'; qaUrl: string; liveUrl: string }
  | { kind: 'asset-vs-site'; attachmentUrl: string; attachmentFilename: string; siteUrl: string };

const MIME_BY_EXT: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

const TRANSITION_IN_REVIEW  = process.env.JIRA_TRANSITION_IN_REVIEW  ?? '71';
const TRANSITION_APPROVED   = process.env.JIRA_TRANSITION_APPROVED   ?? '101';
const TRANSITION_QA_REJECTED = process.env.JIRA_TRANSITION_QA_REJECTED ?? '81';
const TRANSITION_ON_HOLD    = process.env.JIRA_TRANSITION_ON_HOLD    ?? '11';
const TRANSITION_POST_RELEASE_CLOSED = process.env.JIRA_TRANSITION_POST_RELEASE_CLOSED ?? '191';

// Pre-check: ticket is in "Ready For QA" — first-time verification before
// release, ends in Approved/Reopened.
// Post-check: ticket is already "Production QA" (assigned for live
// verification) or "Approved" (passed pre-check, now confirming on live) —
// per the Reporting Protocol, post-check always ends in Closed regardless of
// pass/fail; a failed post-check's defect is tracked on a new ticket instead
// of reopening this one.
const PRE_CHECK_STATUSES = ['ready for qa'];
const POST_CHECK_STATUSES = ['production qa', 'approved'];

// Situational AI-vision checks — which kind applies depends entirely on
// what the ticket is actually about (confirmed live both ways: LP1-445
// needs 'site-vs-site', a content/translation mismatch; SC-963 needs
// 'asset-vs-site', a brand-new image rollout — neither is "the" fallback,
// each is the right tool for a different kind of ticket). Both reuse the
// existing Visual Check tab's own compareVisual() modes/prompts as-is.
const VISUAL_LABELS: Record<'site-vs-site' | 'asset-vs-site', { title: string; scopeFallback: string; evidenceLabel: string; comparisonLabel: string }> = {
  'site-vs-site': {
    title: 'QA vs Production Content Compare',
    scopeFallback: 'QA vs Production content/visual comparison',
    evidenceLabel: 'Evidence (QA, then Production):',
    comparisonLabel: 'Field-by-field comparison (QA vs Production):',
  },
  'asset-vs-site': {
    title: 'New Asset vs Live Site Check',
    scopeFallback: 'New/changed asset renders correctly on the live site',
    evidenceLabel: 'Evidence (live site frame(s) checked):',
    comparisonLabel: 'Field-by-field comparison (reference asset vs site):',
  },
};

function buildVisualCommentAdf(
  visualKind: 'site-vs-site' | 'asset-vs-site',
  result: VisualCompareResult,
  attachments: { thumbnailUrl: string; filename: string }[],
  checkItems: string[],
  phase: CheckPhase,
  ctx: CommentContext = {},
): object {
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const headerLabel = phase === 'post-check' ? 'Post-Checked' : 'Pre-Checked';
  const labels = VISUAL_LABELS[visualKind];
  const success = result.status === 'matched' || result.status === 'no_issues_found';
  const scopeItems = checkItems.length > 0 ? checkItems : [labels.scopeFallback];

  // Shared skeleton per the Jira Comment Format Reference — same shape
  // buildCommentAdf() uses for functional checks: header, Scope Checked,
  // Platform and GEOs Checked (GEO/Platform bullets), then "Overall Result"
  // as its own heading with the verdict as a separate line.
  const nodes: object[] = [
    adfPara(adfBold(`${headerLabel} (${today}) — ${labels.title}`)),
    adfPara(adfBold('Scope Checked')),
    adfBulletList(...scopeItems),
    adfPara(adfBold('Platform and GEOs Checked')),
    adfBulletList(
      `GEO: ${ctx.geo || '(not resolved — see ticket)'}`,
      `Platform: ${ctx.platform || 'Desktop'} — AI-assisted visual check (${visualKind})`,
    ),
    adfPara(adfBold('Overall Result')),
    adfPara(adfText(success ? '✅ ' : '❌ '), adfBold(success ? 'PASS' : 'FAIL')),
  ];

  if (success) {
    nodes.push(adfPara(adfText(
      visualKind === 'site-vs-site'
        ? 'No meaningful visual/content differences found between QA and Production.'
        : 'The asset is present and matches on the live site.'
    )));
  } else {
    // Findings stated as bullets, per the format reference's "one bullet
    // per defect, stated as a factual mismatch" rule — no separate
    // "Findings:" header duplicating what the bullets already say.
    const findingLines = result.findings.length
      ? result.findings.map(f => `[${f.severity.toUpperCase()}] ${f.title} — ${f.description}${f.location ? ` (${f.location})` : ''}`)
      : ['Visual mismatch detected — see evidence.'];
    nodes.push(adfBulletList(...findingLines));
  }

  if (result.breakdown.length > 0) {
    nodes.push(adfPara(adfBold(labels.comparisonLabel)));
    nodes.push(adfBulletList(...result.breakdown.map(r =>
      `${r.field}: ${r.assetValue}"  |  ${r.siteValue}"  ${r.match ? '✅' : '❌'}`
    )));
  }

  if (!success) {
    nodes.push(adfPara(adfText(
      phase === 'post-check'
        ? 'We will file a new ticket for the issues found.'
        : 'Action required: Please investigate the discrepancy and re-run after fix.'
    )));
  }

  if (attachments.length > 0) {
    nodes.push(adfPara(adfBold(labels.evidenceLabel)));
    for (const att of attachments) {
      nodes.push(adfPara(adfText(att.filename)));
      nodes.push(adfImage(att.thumbnailUrl));
    }
  }

  return adfDoc(...nodes);
}

function visualCommentPreviewText(
  visualKind: 'site-vs-site' | 'asset-vs-site',
  result: VisualCompareResult,
  checkItems: string[],
  phase: CheckPhase,
  ctx: CommentContext = {},
): string {
  return adfDocToPreviewText(buildVisualCommentAdf(visualKind, result, [], checkItems, phase, ctx) as { content: any[] });
}

function detectPhase(status: string): CheckPhase | null {
  const s = status.toLowerCase();
  if (PRE_CHECK_STATUSES.includes(s)) return 'pre-check';
  if (POST_CHECK_STATUSES.includes(s)) return 'post-check';
  return null;
}

// Accepts either a bare key ("SC-963") or a full ticket URL
// ("https://prime-online.atlassian.net/browse/SC-963?...") so pasting a
// link copied straight from the browser's address bar just works.
function extractIssueKey(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/browse\/([A-Za-z][A-Za-z0-9_]*-\d+)/i);
  return (urlMatch ? urlMatch[1] : trimmed).toUpperCase();
}

function getErrorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'response' in e) {
    const res = (e as any).response;
    const status = res?.status ?? '?';
    const detail = res?.data?.errorMessages?.join(', ') ?? res?.data?.message ?? res?.statusText ?? '';
    return detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}`;
  }
  return e instanceof Error ? e.message : String(e);
}

interface PlaywrightCheckSession {
  kind: 'playwright';
  testType: string;
  testFile: string;
  checkItems: string[];
  testResult: TestRunResult;
  phase: CheckPhase;
  geo?: string;
}

interface SiteVsSiteSession {
  kind: 'visual';
  visualKind: 'site-vs-site';
  checkItems: string[];
  phase: CheckPhase;
  result: VisualCompareResult;
  qaBuffer: Buffer;
  prodBuffer: Buffer;
  geo?: string;
}

interface AssetVsSiteSession {
  kind: 'visual';
  visualKind: 'asset-vs-site';
  checkItems: string[];
  phase: CheckPhase;
  result: VisualCompareResult;
  geo?: string;
  siteBuffers: Buffer[];
}

type CheckSession = PlaywrightCheckSession | SiteVsSiteSession | AssetVsSiteSession;

// In-memory only — a POC-scale hold between "Check" and "Commit" on the same
// running GUI process. Screenshot paths/buffers are server-local, so they
// never need to round-trip through the browser between these two steps.
const checkSessions = new Map<string, CheckSession>();

// jira.uploadAttachment() takes a file path, not a buffer — visual-compare's
// screenshots live only in memory (captureFullPageScreenshot returns a
// Buffer), so they're written to a temp file just long enough to upload,
// then cleaned up either way.
async function uploadBufferAsAttachment(jira: JiraClient, key: string, buffer: Buffer, filename: string) {
  const tmpPath = path.join(os.tmpdir(), `jira-checker-${key}-${filename}`);
  fs.writeFileSync(tmpPath, buffer);
  try {
    return await jira.uploadAttachment(key, tmpPath);
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

// Express doesn't catch a throw from an async route handler on its own — an
// unexpected error (anything not already wrapped in its own try/catch below)
// would otherwise leave the request hanging forever with no response ever
// sent, so the GUI's spinner just spins indefinitely with no error shown.
// Every route is registered through this so that can't happen.
function wrapAsync(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    handler(req, res).catch(err => {
      console.error('[jira-checker] Unhandled error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: `Unexpected error: ${getErrorMessage(err)}` });
      }
    });
  };
}

export function registerJiraCheckerRoutes(app: Express): void {

  // ── Load a ticket, interpret it, decide whether it's ready to check ───────
  app.get('/jira/ticket', wrapAsync(async (req, res) => {
    const key = extractIssueKey(String(req.query.key ?? ''));
    if (!key) {
      res.status(400).json({ error: 'Missing ticket key' });
      return;
    }

    let jira: JiraClient;
    try {
      jira = new JiraClient();
    } catch (e) {
      res.status(500).json({ error: getErrorMessage(e) });
      return;
    }

    let ticket;
    try {
      ticket = await jira.getTicket(key);
    } catch (e) {
      res.status(404).json({ error: `Could not fetch ${key}: ${getErrorMessage(e)}` });
      return;
    }

    const base = {
      key,
      summary: ticket.summary,
      status: ticket.status,
      priority: ticket.priority,
    };

    // Set whenever interpretTicket() returns null (missing API key, API
    // failure, or malformed AI response — see ticket-interpreter.ts) so an
    // empty testCases array reads as "AI interpretation failed" rather than
    // silently looking identical to "nothing to draft," which no longer
    // exists as a real outcome now that every ticket is supposed to get one.
    const TEST_CASE_FAILURE_WARNING = 'Could not draft a test case — the AI interpreter failed or is unavailable (check ANTHROPIC_API_KEY / server logs).';

    const phase = detectPhase(ticket.status);
    if (!phase) {
      // Still worth interpreting even for a status JIRA Checker won't run
      // against — a QA engineer reading a Backlog/In Progress ticket still
      // benefits from a drafted test case to plan around.
      const earlyInterpreted = await interpretTicket(ticket.summary, ticket.description, false, key);
      res.json({
        ...base,
        ready: false,
        holdable: false,
        reason: `Ticket status is "${ticket.status}" — JIRA Checker only runs against "Ready For QA" (pre-check), `
          + `or "Production QA" / "Approved" (post-check).`,
        testCases: earlyInterpreted?.testCases ?? [],
        testCasesWarning: earlyInterpreted ? undefined : TEST_CASE_FAILURE_WARNING,
      });
      return;
    }

    // BRAND comes deterministically from Jira's own project key — never
    // guessed by AI — since a ticket's project already tells you its brand
    // with certainty (SC-963 is Slingo because it's in the SC project, full
    // stop). Only GEO still needs to come from the ticket's own text.
    const resolvedBrand = resolveBrandFromProjectKey(ticket.projectKey);

    // Keyword first (Option A, no AI needed) for testType specifically, but
    // the AI interpreter now always runs regardless — it's the only source
    // of the drafted test cases every ticket must get (see testCases below),
    // not just a testType fallback.
    let testType: string | null = parseTestType(ticket.description);
    let checkItems: string[] = [];
    let params: Record<string, string> = {};
    let confidence: 'high' | 'low' = 'high';
    let visualCheckKind: VisualCheckKind = 'none';
    let testCases: DraftedTestCase[] = [];

    const hasImageAttachment = ticket.attachments.some(a => a.mimeType?.startsWith('image/'));
    const firstImageAttachment = ticket.attachments.find(a => a.mimeType?.startsWith('image/')) ?? null;

    const interpreted = await interpretTicket(ticket.summary, ticket.description, hasImageAttachment, key);
    if (interpreted) {
      testType = testType ?? interpreted.testType;
      checkItems = interpreted.checkItems;
      params = interpreted.params;
      confidence = interpreted.confidence;
      visualCheckKind = interpreted.visualCheckKind;
      testCases = interpreted.testCases;
    }
    const testCasesWarning = interpreted ? undefined : TEST_CASE_FAILURE_WARNING;
    if (resolvedBrand) params.BRAND = resolvedBrand;

    // Computed independent of whether testType matched — a ticket can BOTH
    // name a page that resolves to a functional spec AND actually need an
    // AI-vision check instead (confirmed live both ways: LP1-445 matches
    // "contact us" by page name but is really an untranslated-content bug;
    // SC-963 matches nothing but has a brand-new image attached to check).
    const brandEntry = resolvedBrand && params.GEO ? getBrandEntry(resolvedBrand, params.GEO) : null;
    const siteUrlForPhase = brandEntry ? (phase === 'pre-check' ? brandEntry.qaUrl : brandEntry.liveUrl ?? brandEntry.qaUrl) : null;

    let visualCheckOption: VisualCheckOption | null = null;
    if (visualCheckKind === 'site-vs-site' && brandEntry?.qaUrl && brandEntry?.liveUrl) {
      visualCheckOption = { kind: 'site-vs-site', qaUrl: brandEntry.qaUrl, liveUrl: brandEntry.liveUrl };
    } else if (visualCheckKind === 'asset-vs-site' && firstImageAttachment && siteUrlForPhase) {
      visualCheckOption = {
        kind: 'asset-vs-site',
        attachmentUrl: firstImageAttachment.content,
        attachmentFilename: firstImageAttachment.filename,
        siteUrl: siteUrlForPhase,
      };
    }

    if (!testType) {
      // No Playwright spec matches at all — but if this can be checked with
      // an AI-vision compare instead (whichever kind actually fits), offer
      // that rather than treating a clear, well-specified ticket as unclear.
      if (visualCheckOption) {
        res.json({
          ...base,
          ready: true,
          mode: 'visual',
          phase,
          checkItems,
          confidence,
          params,
          visualCheck: visualCheckOption,
          testCases,
          testCasesWarning,
        });
        return;
      }

      const clarification =
        `Hi team, JIRA Checker couldn't confidently determine an automated test type for ${key} from the current description.\n\n` +
        `Could you clarify:\n` +
        `  - What should be tested (e.g. login, registration, a specific page or component)?\n` +
        (resolvedBrand ? '' : `  - Which brand is affected? (couldn't resolve one from project "${ticket.projectKey}")\n`) +
        `  - Which GEO is affected?\n\n` +
        `Supported automated test types: ${SUPPORTED_TEST_TYPES.join(', ')}.\n` +
        `Once clarified, this ticket can be re-checked (or checked visually, if this is about a content mismatch or a new asset).`;
      res.json({
        ...base,
        ready: false,
        holdable: true,
        reason: 'Could not determine a supported test type from this ticket\'s description, and no visual check (content compare or asset check) is available yet either.',
        clarificationComment: clarification,
        testCases,
        testCasesWarning,
      });
      return;
    }

    const testFile = resolveTestFile(testType);
    if (!testFile) {
      res.json({
        ...base,
        ready: false,
        holdable: false,
        reason: `AI matched test type "${testType}", but no spec file is mapped for it yet.`,
        testCases,
        testCasesWarning,
      });
      return;
    }

    if (!resolvedBrand) {
      res.json({
        ...base,
        ready: false,
        holdable: true,
        reason: `Ticket's project "${ticket.projectKey}" doesn't map to a known brand.`,
        clarificationComment:
          `Hi team, JIRA Checker matched ${key} to the "${testType}" test, but its project ("${ticket.projectKey}") `
          + `doesn't map to a known brand. Could you confirm which brand this ticket belongs to?`,
        testCases,
        testCasesWarning,
      });
      return;
    }

    if (!params.GEO) {
      res.json({
        ...base,
        ready: false,
        holdable: true,
        reason: `Matched "${testType}" for brand ${resolvedBrand}, but no GEO could be determined from the ticket.`,
        clarificationComment:
          `Hi team, JIRA Checker matched ${key} to the "${testType}" test for ${resolvedBrand}, but couldn't tell which `
          + `GEO/market is affected. Could you confirm the GEO so the correct QA environment can be checked?`,
        testCases,
        testCasesWarning,
      });
      return;
    }

    if (!getQAUrl(params.BRAND, params.GEO)) {
      res.json({
        ...base,
        ready: false,
        holdable: true,
        reason: `No QA URL is configured for brand "${params.BRAND}" GEO "${params.GEO}".`,
        clarificationComment:
          `Hi team, JIRA Checker matched ${key} to the "${testType}" test, but there's no QA URL configured for `
          + `${params.BRAND} ${params.GEO} yet. Could you confirm the correct brand/GEO, or flag this so it can be added?`,
        testCases,
        testCasesWarning,
      });
      return;
    }

    res.json({
      ...base,
      ready: true,
      mode: 'functional',
      phase,
      testType,
      testFile,
      checkItems,
      confidence,
      params,
      testCases,
      testCasesWarning,
      // Present when the ticket ALSO reads as needing an AI-vision check
      // (e.g. LP1-445's content mismatch, or a new-asset ticket that
      // happens to also name a page matching a functional spec) —
      // surfaced as a secondary, explicitly recommended option rather than
      // silently picking one path, since which check actually matches the
      // real bug is a judgment call.
      visualCheckRecommended: visualCheckKind !== 'none' && !!visualCheckOption,
      visualCheck: visualCheckOption,
    });
  }));

  // ── Run the real Playwright spec mapped to this test type ─────────────────
  app.post('/jira/check', wrapAsync(async (req, res) => {
    // Reset per-request so a ticket lacking BRAND/GEO/tag params can never
    // silently inherit a PREVIOUS ticket's env vars — this process is
    // long-running and these are read by the spawned Playwright test, so a
    // stale value here means the wrong site gets checked with no visible
    // error. Cleared unconditionally before applying this request's params.
    delete process.env.TEST_BRAND;
    delete process.env.TEST_GEO;
    delete process.env.TEST_ENV;
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('QA_')) delete process.env[k];
    }

    const { testType, testFile, checkItems, params } = req.body ?? {};
    const key = extractIssueKey(String(req.body?.key ?? ''));
    const phase: CheckPhase = req.body?.phase === 'post-check' ? 'post-check' : 'pre-check';
    if (!key || !testType || !testFile) {
      res.status(400).json({ error: 'Missing key, testType, or testFile' });
      return;
    }

    // Same param -> env wiring agent.ts does before spawning the test.
    if (params?.BRAND && params?.GEO) {
      const qaUrl = getQAUrl(params.BRAND, params.GEO);
      if (qaUrl) {
        params.QA_BASE_URL = qaUrl;
        process.env.TEST_BRAND = params.BRAND;
        process.env.TEST_GEO = params.GEO;
        process.env.TEST_ENV = 'qa';
      }
    }
    for (const [k, v] of Object.entries(params ?? {})) {
      process.env[`QA_${k}`] = String(v);
    }

    let testResult: TestRunResult;
    try {
      testResult = runPlaywrightTest(testType, testFile);
    } catch (e) {
      res.status(500).json({ error: `Test runner failed: ${getErrorMessage(e)}` });
      return;
    }

    checkSessions.set(key, { kind: 'playwright', testType, testFile, checkItems: checkItems ?? [], testResult, phase, geo: params?.GEO });

    // Real inline images, not just a count — this is what actually posts to
    // Jira on Commit, so the preview should show it, not describe it.
    // Videos aren't embedded here (webm files are typically tens of MB;
    // impractical as base64 over JSON) — just named, with the real link
    // only resolvable once Commit has actually uploaded them.
    const screenshots = testResult.screenshotPaths.map(p => {
      const ext = path.extname(p).toLowerCase();
      const mime = MIME_BY_EXT[ext] ?? 'image/png';
      const dataUri = `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
      return { filename: path.basename(p), dataUri };
    });
    const videoFilenames = testResult.videoPaths.map(p => path.basename(p));

    res.json({
      success: testResult.success,
      passed: testResult.passed,
      failed: testResult.failed,
      skipped: testResult.skipped,
      durationMs: testResult.durationMs,
      errors: testResult.errors,
      screenshots,
      videoFilenames,
      preview: commentPreviewText(testResult, checkItems ?? [], phase, { geo: params?.GEO }),
    });
  }));

  // ── Run an AI-assisted visual check — kind depends on the ticket ──────────
  app.post('/jira/compare', wrapAsync(async (req, res) => {
    const key = extractIssueKey(String(req.body?.key ?? ''));
    const checkItems: string[] = Array.isArray(req.body?.checkItems) ? req.body.checkItems : [];
    const phase: CheckPhase = req.body?.phase === 'post-check' ? 'post-check' : 'pre-check';
    const visualCheck: VisualCheckOption | undefined = req.body?.visualCheck;
    const geo: string | undefined = req.body?.geo;
    if (!key || !visualCheck) {
      res.status(400).json({ error: 'Missing key or visualCheck' });
      return;
    }

    if (visualCheck.kind === 'site-vs-site') {
      const { qaUrl, liveUrl } = visualCheck;
      let qaBuffer: Buffer;
      let prodBuffer: Buffer;
      try {
        [qaBuffer, prodBuffer] = await Promise.all([
          captureFullPageScreenshot(qaUrl),
          captureFullPageScreenshot(liveUrl),
        ]);
      } catch (e) {
        res.status(500).json({ error: `Screenshot capture failed: ${getErrorMessage(e)}` });
        return;
      }

      const result = await compareVisual(
        'site-vs-site',
        { buffer: qaBuffer, mimeType: 'image/png' },
        [{ buffer: prodBuffer, mimeType: 'image/png' }],
      );
      if ('error' in result) {
        res.status(500).json({ error: result.error });
        return;
      }

      checkSessions.set(key, { kind: 'visual', visualKind: 'site-vs-site', checkItems, phase, result, qaBuffer, prodBuffer, geo });

      res.json({
        success: result.status === 'matched' || result.status === 'no_issues_found',
        status: result.status,
        findings: result.findings,
        breakdown: result.breakdown,
        screenshots: [
          { filename: 'qa-site.png', dataUri: `data:image/png;base64,${qaBuffer.toString('base64')}` },
          { filename: 'production-site.png', dataUri: `data:image/png;base64,${prodBuffer.toString('base64')}` },
        ],
        preview: visualCommentPreviewText('site-vs-site', result, checkItems, phase, { geo }),
      });
      return;
    }

    // asset-vs-site: reference image comes from the ticket's own Jira
    // attachment (the new mockup), checked against several frames of the
    // one live site — a carousel/rotating hero can hide a correctly-placed
    // asset in a single screenshot, same reasoning as the Visual Check tab.
    let jira: JiraClient;
    try {
      jira = new JiraClient();
    } catch (e) {
      res.status(500).json({ error: getErrorMessage(e) });
      return;
    }

    let assetBuffer: Buffer;
    let assetMimeType: string;
    let siteBuffers: Buffer[];
    try {
      const downloaded = await jira.downloadAttachment(visualCheck.attachmentUrl);
      assetBuffer = downloaded.buffer;
      assetMimeType = downloaded.mimeType;
      siteBuffers = await captureMultipleFrames(visualCheck.siteUrl);
    } catch (e) {
      res.status(500).json({ error: `Asset download or screenshot capture failed: ${getErrorMessage(e)}` });
      return;
    }

    const result = await compareVisual(
      'asset-vs-site',
      { buffer: assetBuffer, mimeType: assetMimeType },
      siteBuffers.map(buf => ({ buffer: buf, mimeType: 'image/png' as const })),
    );
    if ('error' in result) {
      res.status(500).json({ error: result.error });
      return;
    }

    checkSessions.set(key, { kind: 'visual', visualKind: 'asset-vs-site', checkItems, phase, result, siteBuffers, geo });

    res.json({
      success: result.status === 'matched' || result.status === 'no_issues_found',
      status: result.status,
      findings: result.findings,
      breakdown: result.breakdown,
      screenshots: [
        { filename: visualCheck.attachmentFilename, dataUri: `data:${assetMimeType};base64,${assetBuffer.toString('base64')}` },
        ...siteBuffers.map((buf, i) => ({ filename: `site-frame-${i}.png`, dataUri: `data:image/png;base64,${buf.toString('base64')}` })),
      ],
      preview: visualCommentPreviewText('asset-vs-site', result, checkItems, phase, { geo }),
    });
  }));

  // ── Cancel a pending Check result without committing it ────────────────────
  app.post('/jira/check/cancel', (req, res) => {
    const key = extractIssueKey(String(req.body?.key ?? ''));
    checkSessions.delete(key);
    res.json({ cancelled: true });
  });

  // ── Human-gated: post the comment, upload evidence, transition the ticket ─
  app.post('/jira/commit', wrapAsync(async (req, res) => {
    const key = extractIssueKey(String(req.body?.key ?? ''));
    const session = checkSessions.get(key);
    if (!session) {
      res.status(400).json({ error: 'No pending Check result for this ticket — run Check first.' });
      return;
    }

    let jira: JiraClient;
    try {
      jira = new JiraClient();
    } catch (e) {
      res.status(500).json({ error: getErrorMessage(e) });
      return;
    }

    const warnings: string[] = [];

    // Only the pre-check flow passes through an "In Review" holding state —
    // post-check goes straight from Production QA/Approved to Closed either
    // way, per the Reporting Protocol (§5.3/§5.4).
    if (session.phase === 'pre-check') {
      try {
        await jira.transitionTicket(key, TRANSITION_IN_REVIEW);
      } catch (e) {
        warnings.push(`Could not transition to In Review: ${getErrorMessage(e)}`);
      }
    }

    let success: boolean;
    let commentAdf: object;

    if (session.kind === 'playwright') {
      const attachments: { thumbnailUrl: string; filename: string }[] = [];
      for (const screenshotPath of session.testResult.screenshotPaths) {
        try {
          const att = await jira.uploadAttachment(key, screenshotPath);
          attachments.push({ thumbnailUrl: att.thumbnailUrl, filename: att.filename });
        } catch (e) {
          warnings.push(`Could not upload screenshot ${screenshotPath}: ${getErrorMessage(e)}`);
        }
      }

      const videos: VideoAttachment[] = [];
      for (const videoPath of session.testResult.videoPaths) {
        try {
          const att = await jira.uploadAttachment(key, videoPath);
          videos.push({ contentUrl: att.contentUrl, filename: att.filename });
        } catch (e) {
          warnings.push(`Could not upload video ${videoPath}: ${getErrorMessage(e)}`);
        }
      }

      success = session.testResult.success;
      commentAdf = buildCommentAdf(session.testResult, attachments, session.checkItems, session.phase, videos, { geo: session.geo });
    } else if (session.visualKind === 'site-vs-site') {
      const attachments: { thumbnailUrl: string; filename: string }[] = [];
      try {
        const qaAtt = await uploadBufferAsAttachment(jira, key, session.qaBuffer, 'qa-site.png');
        attachments.push({ thumbnailUrl: qaAtt.thumbnailUrl, filename: qaAtt.filename });
      } catch (e) {
        warnings.push(`Could not upload QA screenshot: ${getErrorMessage(e)}`);
      }
      try {
        const prodAtt = await uploadBufferAsAttachment(jira, key, session.prodBuffer, 'production-site.png');
        attachments.push({ thumbnailUrl: prodAtt.thumbnailUrl, filename: prodAtt.filename });
      } catch (e) {
        warnings.push(`Could not upload Production screenshot: ${getErrorMessage(e)}`);
      }

      success = session.result.status === 'matched' || session.result.status === 'no_issues_found';
      commentAdf = buildVisualCommentAdf('site-vs-site', session.result, attachments, session.checkItems, session.phase, { geo: session.geo });
    } else {
      const attachments: { thumbnailUrl: string; filename: string }[] = [];
      for (let i = 0; i < session.siteBuffers.length; i++) {
        try {
          const att = await uploadBufferAsAttachment(jira, key, session.siteBuffers[i], `site-frame-${i}.png`);
          attachments.push({ thumbnailUrl: att.thumbnailUrl, filename: att.filename });
        } catch (e) {
          warnings.push(`Could not upload site frame ${i}: ${getErrorMessage(e)}`);
        }
      }

      success = session.result.status === 'matched' || session.result.status === 'no_issues_found';
      commentAdf = buildVisualCommentAdf('asset-vs-site', session.result, attachments, session.checkItems, session.phase, { geo: session.geo });
    }

    try {
      await jira.addCommentAdf(key, commentAdf);
    } catch (e) {
      res.status(500).json({ error: `Comment failed, ticket left as-is: ${getErrorMessage(e)}`, warnings });
      return;
    }

    let finalTransition: string;
    let finalStatusLabel: string;
    if (session.phase === 'post-check') {
      // Post-check always closes the original ticket — a fail's defect is
      // meant to be tracked on a new, separately-filed ticket (not yet
      // automated here), never by reopening this one.
      finalTransition = TRANSITION_POST_RELEASE_CLOSED;
      finalStatusLabel = 'Closed';
      if (!success) {
        warnings.push('Post-check FAILED — file a new defect ticket for the issues found (not yet automated); this ticket is being closed per protocol, not reopened.');
      }
    } else {
      finalTransition = success ? TRANSITION_APPROVED : TRANSITION_QA_REJECTED;
      finalStatusLabel = success ? 'Approved' : 'QA Rejected';
    }

    try {
      await jira.transitionTicket(key, finalTransition);
    } catch (e) {
      res.status(500).json({
        error: `Comment posted, but transition to ${finalStatusLabel} failed: ${getErrorMessage(e)}`,
        warnings,
      });
      return;
    }

    checkSessions.delete(key);
    res.json({ committed: true, status: finalStatusLabel, warnings });
  }));

  // ── Human-gated: post a clarification comment and place the ticket On Hold ─
  app.post('/jira/hold', wrapAsync(async (req, res) => {
    const key = extractIssueKey(String(req.body?.key ?? ''));
    const comment = String(req.body?.comment ?? '').trim();
    if (!key || !comment) {
      res.status(400).json({ error: 'Missing key or comment' });
      return;
    }

    let jira: JiraClient;
    try {
      jira = new JiraClient();
    } catch (e) {
      res.status(500).json({ error: getErrorMessage(e) });
      return;
    }

    try {
      await jira.addComment(key, comment);
    } catch (e) {
      res.status(500).json({ error: `Comment failed: ${getErrorMessage(e)}` });
      return;
    }

    try {
      await jira.transitionTicket(key, TRANSITION_ON_HOLD);
    } catch (e) {
      res.status(500).json({ error: `Comment posted, but transition to On Hold failed: ${getErrorMessage(e)}` });
      return;
    }

    res.json({ held: true });
  }));
}

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
import { JiraClient, JiraComment } from '../src/jira-client';
import { parseTestType } from '../src/requirements-parser';
import { interpretTicket, VisualCheckKind, DraftedTestCase } from '../src/ticket-interpreter';
import { resolveTestFile, runPlaywrightTest, SUPPORTED_TEST_TYPES, TestRunResult } from '../src/test-runner';
import { getQAUrl, getLiveUrl, getBrandEntry, resolveBrandFromProjectKey } from '../helpers/brand-urls';
import {
  buildCommentAdf, commentPreviewText, adfDocToPreviewText,
  adfDoc, adfPara, adfBold, adfText, adfBulletList,
  adfRule, evidenceImages, remarksNodes, retestNodes, retestAllFixed, POST_CHECK_FAIL_SENTENCE,
  CheckPhase, VideoAttachment, CommentContext, RetestContext,
} from '../src/jira-comment';
import {
  parseQaComments, findSamePassComment, detectRetest, buildReadiness,
  RetestInfo, ReadinessItem,
} from './jira-checker-support';
import {
  draftBugTickets, normaliseBugEdit, checkBugEdit, buildBugFields,
} from './jira-checker-bug';
import { captureFullPageScreenshot, captureMultipleFrames } from './screenshot-capture';
import { compareVisual, VisualCompareResult } from './visual-compare';
import { annotateEvidence, todayDdMmYyyy } from '../src/evidence-annotate';

// What a "visual check" needs varies by kind — situational, not fixed:
// site-vs-site needs two live URLs (QA vs Production); asset-vs-site needs
// a reference image (from the ticket's own Jira attachment) plus the one
// live site to check it against. Computed once in GET /jira/ticket, reused
// as-is by both the primary "Ready" response and the secondary
// "recommended alongside a functional match" response.
type VisualCheckOption =
  | { kind: 'site-vs-site'; qaUrl: string; liveUrl: string }
  | { kind: 'asset-vs-site'; attachmentUrl: string; attachmentFilename: string; siteUrl: string };

const TRANSITION_IN_REVIEW  = process.env.JIRA_TRANSITION_IN_REVIEW  ?? '71';
const TRANSITION_APPROVED   = process.env.JIRA_TRANSITION_APPROVED   ?? '101';
// Transition 81 is In Review → Reopened (see .env.example); the env var name is
// a legacy label.
const TRANSITION_REOPENED = process.env.JIRA_TRANSITION_QA_REJECTED ?? '81';
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
const VISUAL_LABELS: Record<'site-vs-site' | 'asset-vs-site', { scopeFallback: string }> = {
  'site-vs-site': {
    scopeFallback: 'QA vs Production content/visual comparison',
  },
  'asset-vs-site': {
    scopeFallback: 'New/changed asset renders correctly on the live site',
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
    adfPara(adfBold(`${headerLabel} (${today})`)),
    adfPara(adfBold('Scope Checked')),
    adfBulletList(...scopeItems),
    adfPara(adfBold('Platform and GEOs Checked')),
    adfBulletList(
      `GEO: ${ctx.geo || '(not resolved — see ticket)'}`,
      `Platform: ${ctx.platform || 'Desktop'} — AI-assisted visual check (${visualKind})`,
    ),
    adfPara(adfBold('Overall Result')),
  ];

  // A re-test's verdict also needs every flagged issue marked fixed.
  const passed = ctx.retest ? success && retestAllFixed(ctx.retest) : success;
  nodes.push(adfPara(adfText(passed ? '✅ ' : '❌ '), adfBold(passed ? 'PASS' : 'FAIL')));

  // Documentation is the record of what passed (Standing Rules #6/#12), with
  // its screenshots inline underneath (#13) — present on every comment that
  // has at least one passing item, after a divider.
  const passedRows = result.breakdown.filter(r => r.match);
  const rowLine = (r: { field: string; assetValue: string; siteValue: string }) =>
    `${r.field}: ${r.assetValue} | ${r.siteValue} ✅`;

  if (ctx.retest) {
    nodes.push(...retestNodes(passed, phase, ctx.retest, attachments, result.findings[0]?.title ?? 'see evidence'));
  } else if (success) {
    nodes.push(
      adfPara(adfText(`No issues were identified during ${phase === 'post-check' ? 'post-checking' : 'pre-checking'}.`)),
      adfRule(),
      adfPara(adfBold('Documentation')),
      adfBulletList(
        visualKind === 'site-vs-site'
          ? 'No meaningful visual/content differences found between QA and Production.'
          : 'The asset is present and matches on the live site.',
        ...passedRows.map(rowLine),
      ),
      ...evidenceImages(attachments),
    );
  } else {
    // One bullet per defect, stated as a factual mismatch, evidence directly
    // underneath. The post-check FAIL sentence is fixed wording; a pre-check
    // FAIL has no closing line (Standing Rules #7/#12).
    const findingLines = result.findings.length
      ? result.findings.map(f => `[${f.severity.toUpperCase()}] ${f.title} — ${f.description}${f.location ? ` (${f.location})` : ''}`)
      : ['Visual mismatch detected — see evidence.'];
    if (phase === 'post-check') nodes.push(adfPara(adfText(POST_CHECK_FAIL_SENTENCE)));
    nodes.push(adfBulletList(...findingLines), ...evidenceImages(attachments));
    if (passedRows.length > 0) {
      nodes.push(adfRule(), adfPara(adfBold('Documentation')), adfBulletList(...passedRows.map(rowLine)));
    }
  }

  nodes.push(...remarksNodes(ctx));

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

// Carried by every session kind: Remarks lines for the comment, and — when this
// pass is a re-test — which of the flagged issues are now fixed.
interface SessionExtras {
  remarks?: string[];
  retest?: RetestContext;
  // New bug tickets already created for this pass, by draft id — a retry after
  // a partial failure never files a duplicate.
  createdTickets?: Record<string, { key: string; url: string }>;
}

interface PlaywrightCheckSession extends SessionExtras {
  kind: 'playwright';
  testType: string;
  testFile: string;
  checkItems: string[];
  testResult: TestRunResult;
  phase: CheckPhase;
  geo?: string;
  // The site the test ran against — drawn into each screenshot's caption.
  url?: string;
}

interface SiteVsSiteSession extends SessionExtras {
  kind: 'visual';
  visualKind: 'site-vs-site';
  checkItems: string[];
  phase: CheckPhase;
  result: VisualCompareResult;
  qaBuffer: Buffer;
  prodBuffer: Buffer;
  qaUrl: string;
  liveUrl: string;
  geo?: string;
}

interface AssetVsSiteSession extends SessionExtras {
  kind: 'visual';
  visualKind: 'asset-vs-site';
  checkItems: string[];
  phase: CheckPhase;
  result: VisualCompareResult;
  geo?: string;
  siteBuffers: Buffer[];
  siteUrl: string;
}

type CheckSession = PlaywrightCheckSession | SiteVsSiteSession | AssetVsSiteSession;

function visualSuccess(r: VisualCompareResult): boolean {
  return r.status === 'matched' || r.status === 'no_issues_found';
}

// The check's own outcome, before any re-test judgement.
function automatedSuccess(s: CheckSession): boolean {
  return s.kind === 'playwright' ? s.testResult.success : visualSuccess(s.result);
}

// The verdict that gets posted: a re-test only passes when every flagged issue
// is fixed (Standing Rules #8 — unverified counts as not fixed).
function sessionSuccess(s: CheckSession): boolean {
  return s.retest ? automatedSuccess(s) && retestAllFixed(s.retest) : automatedSuccess(s);
}

// What failed, one entry per item, for the new bug ticket(s) a post-check FAIL
// files. A re-test files only what is still failing; if every flagged issue is
// fixed but the automated check itself failed, that failure is what's filed.
function failingItems(s: CheckSession): string[] {
  const stillFailing = s.retest ? s.retest.flagged.filter((_, i) => !s.retest!.fixed[i]) : [];
  if (stillFailing.length > 0) return stillFailing;
  if (s.kind === 'playwright') {
    return s.testResult.errors.length ? s.testResult.errors : ['Test failed — no error details captured'];
  }
  return s.result.findings.length
    ? s.result.findings.map(f => `${f.title} — ${f.description}${f.location ? ` (${f.location})` : ''}`)
    : ['Visual mismatch detected — see evidence'];
}

// Every screenshot of a pass with its Standing Rules #13 annotation drawn in:
// green/red border and a caption bar (verdict, date, URL, measured viewport).
// One function builds them, so the preview, the comment and any new bug ticket
// always carry the same images. A screenshot that can't be annotated is kept
// as it was and named in `warnings` — evidence is never dropped.
interface EvidenceImage { filename: string; buffer: Buffer }

async function annotatedEvidence(s: CheckSession): Promise<{ images: EvidenceImage[]; warnings: string[] }> {
  const verdict = sessionSuccess(s) ? 'pass' : 'fail';
  const date = todayDdMmYyyy();
  const warnings: string[] = [];
  const draw = async (raw: Buffer, filename: string, label: string | undefined, url: string | undefined): Promise<EvidenceImage> => {
    const out = await annotateEvidence(raw, { verdict, label, url, geo: s.geo, platform: 'Desktop', date });
    if (out.error) warnings.push(`Could not annotate ${filename}, so it is attached as captured: ${out.error}`);
    // The annotated image is always a PNG, whatever the source format was.
    return { filename: out.error ? filename : filename.replace(/\.[^.]+$/, '') + '.png', buffer: out.buffer };
  };

  const images: EvidenceImage[] = [];
  if (s.kind === 'playwright') {
    for (const p of s.testResult.screenshotPaths) {
      images.push(await draw(fs.readFileSync(p), path.basename(p), undefined, s.url));
    }
  } else if (s.visualKind === 'site-vs-site') {
    images.push(await draw(s.qaBuffer, 'qa-site.png', 'QA site', s.qaUrl));
    images.push(await draw(s.prodBuffer, 'production-site.png', 'Production site', s.liveUrl));
  } else {
    for (let i = 0; i < s.siteBuffers.length; i++) {
      images.push(await draw(s.siteBuffers[i], `site-frame-${i}.png`, `Live site, frame ${i + 1} of ${s.siteBuffers.length}`, s.siteUrl));
    }
  }
  return { images, warnings };
}

// Uploads the annotated screenshots for the comment. A failed upload becomes a
// warning and the comment still posts; the Standing Rules' "stop after three
// failed attempts" is not implemented — each image is tried once.
async function uploadEvidence(
  jira: JiraClient,
  key: string,
  s: CheckSession,
  warnings: string[],
): Promise<{ thumbnailUrl: string; filename: string }[]> {
  const { images, warnings: annotateWarnings } = await annotatedEvidence(s);
  warnings.push(...annotateWarnings);
  const attachments: { thumbnailUrl: string; filename: string }[] = [];
  for (const img of images) {
    try {
      const att = await uploadBufferAsAttachment(jira, key, img.buffer, img.filename);
      attachments.push({ thumbnailUrl: att.thumbnailUrl, filename: att.filename });
    } catch (e) {
      warnings.push(`Could not upload screenshot ${img.filename}: ${getErrorMessage(e)}`);
    }
  }
  return attachments;
}

// The evidence a new ticket carries: the same screenshots the comment shows.
async function attachSessionEvidence(jira: JiraClient, ticketKey: string, s: CheckSession): Promise<string[]> {
  const failed: string[] = [];
  const { images } = await annotatedEvidence(s);
  for (const img of images) {
    try { await uploadBufferAsAttachment(jira, ticketKey, img.buffer, img.filename); }
    catch (e) { failed.push(`${img.filename} (${getErrorMessage(e)})`); }
  }
  return failed;
}

function sessionCtx(s: CheckSession): CommentContext {
  return { geo: s.geo, remarks: s.remarks, retest: s.retest };
}

function sessionPreview(s: CheckSession): string {
  if (s.kind === 'playwright') return commentPreviewText(s.testResult, s.checkItems, s.phase, sessionCtx(s));
  return visualCommentPreviewText(s.visualKind, s.result, s.checkItems, s.phase, sessionCtx(s));
}

// Default re-test state: every flagged issue fixed only if the automated check
// passed; the QA engineer can adjust each one before committing.
function retestFromBody(body: unknown, automated: boolean): RetestContext | undefined {
  const flagged = (body as { flagged?: unknown } | undefined)?.flagged;
  if (!Array.isArray(flagged) || flagged.length === 0) return undefined;
  const lines = flagged.map(String);
  return { flagged: lines, fixed: lines.map(() => automated) };
}

// Post-check runs against the live site, logged out (Post-Check Standard,
// Protocol §5.5) — say so in Remarks (Standing Rules #12 default line).
function postCheckRemarks(phase: CheckPhase, geo: string | undefined): string[] | undefined {
  return phase === 'post-check' ? [`The page was checked on the live ${geo ? `${geo} ` : ''}site, logged out.`] : undefined;
}

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

    // Every comment on the ticket, read in full before the pass (Post-Check
    // Standard hard rule #1: a prior comment's verdict line is not its
    // disposition). A failure to read them is surfaced, never silent.
    let comments: JiraComment[] = [];
    let myAccountId = '';
    let priorWarning: string | undefined;
    try {
      [comments, myAccountId] = await Promise.all([
        jira.getComments(key),
        jira.getMyself().then(m => m.accountId),
      ]);
    } catch (e) {
      priorWarning = `Could not read the ticket's prior comments: ${getErrorMessage(e)} — read them in Jira before checking.`;
    }
    const qaComments = parseQaComments(comments);
    const priorComments = comments.map(c => ({
      id: c.id, author: c.authorName, created: c.created, text: c.bodyText,
    }));
    const priors = { priorComments, priorWarning };

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
        ...priors,
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

    // Post-check runs on the live site, pre-check on QA (Protocol §5.1–§5.5).
    const envUrl = resolvedBrand && params.GEO
      ? (phase === 'post-check' ? getLiveUrl(resolvedBrand, params.GEO) : getQAUrl(resolvedBrand, params.GEO))
      : null;
    const retest: RetestInfo | null = detectRetest(ticket.status, phase, qaComments);
    const samePass = myAccountId ? findSamePassComment(comments, myAccountId, phase) : null;
    const readiness: ReadinessItem[] = buildReadiness({
      description: ticket.description,
      attachmentCount: ticket.attachments.length,
      phase,
      status: ticket.status,
      brand: resolvedBrand,
      geo: params.GEO,
      envUrl,
    });
    // Everything the Checker adds on top of the basic ticket facts.
    const extra = () => ({
      ...priors,
      readiness,
      retest,
      samePass: samePass ? { id: samePass.id, created: samePass.created, header: samePass.header } : null,
    });

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
          ...extra(),
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
        ...extra(),
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
        ...extra(),
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
        ...extra(),
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
        ...extra(),
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

    if (!envUrl) {
      const envWord = phase === 'post-check' ? 'live' : 'QA';
      res.json({
        ...base,
        ...extra(),
        ready: false,
        holdable: true,
        reason: `No ${envWord} URL is configured for brand "${params.BRAND}" GEO "${params.GEO}".`,
        clarificationComment:
          `Hi team, JIRA Checker matched ${key} to the "${testType}" test, but there's no ${envWord} URL configured for `
          + `${params.BRAND} ${params.GEO} yet. Could you confirm the correct brand/GEO, or flag this so it can be added?`,
        testCases,
        testCasesWarning,
      });
      return;
    }

    res.json({
      ...base,
      ...extra(),
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

    // Same param -> env wiring agent.ts does before spawning the test — except
    // a post-check runs against the LIVE site, logged out, not QA (Post-Check
    // Standard; Protocol §5.3–§5.5).
    if (params?.BRAND && params?.GEO) {
      const isLive = phase === 'post-check';
      const envUrl = isLive ? getLiveUrl(params.BRAND, params.GEO) : getQAUrl(params.BRAND, params.GEO);
      if (isLive && !envUrl) {
        res.status(400).json({ error: `No live URL is configured for ${params.BRAND} ${params.GEO} — a post-check can't run against QA.` });
        return;
      }
      if (envUrl) {
        params.QA_BASE_URL = envUrl;
        process.env.TEST_BRAND = params.BRAND;
        process.env.TEST_GEO = params.GEO;
        process.env.TEST_ENV = isLive ? 'live' : 'qa';
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

    const session: PlaywrightCheckSession = {
      kind: 'playwright', testType, testFile, checkItems: checkItems ?? [], testResult, phase, geo: params?.GEO,
      url: params?.QA_BASE_URL,
      remarks: postCheckRemarks(phase, params?.GEO),
      retest: retestFromBody(req.body?.retest, testResult.success),
    };
    checkSessions.set(key, session);

    // Real inline images, not just a count — this is what actually posts to
    // Jira on Commit, so the preview should show it, not describe it.
    // Videos aren't embedded here (webm files are typically tens of MB;
    // impractical as base64 over JSON) — just named, with the real link
    // only resolvable once Commit has actually uploaded them.
    // Shown annotated (border + caption bar), exactly as it will be posted.
    const evidence = await annotatedEvidence(session);
    const screenshots = evidence.images.map(img => ({
      filename: img.filename,
      dataUri: `data:image/png;base64,${img.buffer.toString('base64')}`,
    }));
    const videoFilenames = testResult.videoPaths.map(p => path.basename(p));

    res.json({
      success: sessionSuccess(session),
      automatedSuccess: testResult.success,
      retest: session.retest ?? null,
      passed: testResult.passed,
      failed: testResult.failed,
      skipped: testResult.skipped,
      durationMs: testResult.durationMs,
      errors: testResult.errors,
      screenshots,
      evidenceWarnings: evidence.warnings,
      videoFilenames,
      preview: sessionPreview(session),
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

      const session: SiteVsSiteSession = {
        kind: 'visual', visualKind: 'site-vs-site', checkItems, phase, result, qaBuffer, prodBuffer, qaUrl, liveUrl, geo,
        retest: retestFromBody(req.body?.retest, visualSuccess(result)),
      };
      checkSessions.set(key, session);
      const evidence = await annotatedEvidence(session);

      res.json({
        success: sessionSuccess(session),
        automatedSuccess: visualSuccess(result),
        retest: session.retest ?? null,
        status: result.status,
        findings: result.findings,
        breakdown: result.breakdown,
        screenshots: evidence.images.map(img => ({ filename: img.filename, dataUri: `data:image/png;base64,${img.buffer.toString('base64')}` })),
        evidenceWarnings: evidence.warnings,
        preview: sessionPreview(session),
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

    const session: AssetVsSiteSession = {
      kind: 'visual', visualKind: 'asset-vs-site', checkItems, phase, result, siteBuffers, siteUrl: visualCheck.siteUrl, geo,
      remarks: postCheckRemarks(phase, geo),
      retest: retestFromBody(req.body?.retest, visualSuccess(result)),
    };
    checkSessions.set(key, session);
    const evidence = await annotatedEvidence(session);

    res.json({
      success: sessionSuccess(session),
      automatedSuccess: visualSuccess(result),
      retest: session.retest ?? null,
      status: result.status,
      findings: result.findings,
      breakdown: result.breakdown,
      screenshots: [
        { filename: visualCheck.attachmentFilename, dataUri: `data:${assetMimeType};base64,${assetBuffer.toString('base64')}` },
        ...evidence.images.map(img => ({ filename: img.filename, dataUri: `data:image/png;base64,${img.buffer.toString('base64')}` })),
      ],
      evidenceWarnings: evidence.warnings,
      preview: sessionPreview(session),
    });
  }));

  // ── Re-test: mark each flagged issue fixed / still failing ───────────────
  // Rebuilds the draft comment so the preview and the verdict follow the
  // QA engineer's per-issue judgement (Standing Rules #8: Overall Result is
  // PASS only when every flagged issue is fixed).
  app.post('/jira/retest/state', (req, res) => {
    const key = extractIssueKey(String(req.body?.key ?? ''));
    const session = checkSessions.get(key);
    const fixed = req.body?.fixed;
    if (!session?.retest) {
      res.status(400).json({ error: 'No pending re-test for this ticket — run Check first.' });
      return;
    }
    if (!Array.isArray(fixed) || fixed.length !== session.retest.flagged.length) {
      res.status(400).json({ error: 'fixed must list one true/false per flagged issue' });
      return;
    }
    session.retest.fixed = fixed.map(v => v === true);
    res.json({ success: sessionSuccess(session), preview: sessionPreview(session), retest: session.retest });
  });

  // Developers to assign a new bug to — looked up by name, never a guessed
  // account id (Bug Ticket Standard). Read-only.
  app.get('/jira/users', wrapAsync(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) { res.json({ users: [] }); return; }
    try {
      res.json({ users: await new JiraClient().searchUsers(q) });
    } catch (e) {
      res.status(502).json({ error: `Could not search Jira: ${getErrorMessage(e)}` });
    }
  }));

  // ── Post-check FAIL: draft the new bug ticket(s) (read-only) ──────────────
  // Related failures are grouped into one ticket; "split" drafts one per
  // failure (Protocol §5.4). Nothing is written here — creation happens only
  // inside the single approval on /jira/commit.
  app.post('/jira/bug-draft', wrapAsync(async (req, res) => {
    const key = extractIssueKey(String(req.body?.key ?? ''));
    const session = checkSessions.get(key);
    if (!session || session.phase !== 'post-check' || sessionSuccess(session)) {
      res.status(400).json({ error: 'A bug ticket is only drafted for a post-check that found issues — run Check first.' });
      return;
    }

    let jira: JiraClient;
    let ticket;
    try {
      jira = new JiraClient();
      ticket = await jira.getTicket(key);
    } catch (e) {
      res.status(500).json({ error: `Could not read ${key}: ${getErrorMessage(e)}` });
      return;
    }

    const brand = resolveBrandFromProjectKey(ticket.projectKey) ?? ticket.projectKey;
    const geo = session.geo ?? '';
    const liveUrl = geo ? getLiveUrl(brand, geo) : null;
    const drafts = draftBugTickets({
      originalKey: key,
      originalSummary: ticket.summary,
      brand,
      geo: geo || '(GEO not resolved)',
      platform: 'Desktop',
      liveUrl,
      scopeItems: session.checkItems,
      failingItems: failingItems(session),
      split: req.body?.split === true,
    });

    const flags: string[] = [];
    const ASSIGNEES = ['Boaz', 'Oleg', 'Gerline'];
    try {
      const [versions, fields, nameMatches] = await Promise.all([
        jira.getProjectVersions(ticket.projectKey),
        jira.getIssueTypeFields(ticket.projectKey, 'Bug'),
        Promise.all(ASSIGNEES.map(n => jira.searchUsers(n))),
      ]);
      if (!fields) flags.push(`Jira space ${ticket.projectKey} has no "Bug" work type.`);
      const next = versions.find(v => /next/i.test(v.name) && !v.archived) ?? null;
      if (!next) flags.push(`No "Next" Fix Version found in ${ticket.projectKey} — set it after creating.`);
      const priorityOptions = fields?.fields?.priority?.allowedValues ?? [];
      const assigneeOptions: Array<{ accountId: string; displayName: string }> = [];
      ASSIGNEES.forEach((name, i) => {
        const hits = (nameMatches[i] ?? []).filter(u => u.displayName.toLowerCase().includes(name.toLowerCase()));
        if (hits.length === 1) assigneeOptions.push(hits[0]);
        else flags.push(hits.length === 0 ? `Could not find "${name}" in Jira — use the search box.` : `Found ${hits.length} people matching "${name}" — use the search box to pick the right one.`);
      });
      flags.push('Affects Version and the x.xx-post label come from the version shown in the site footer (e.g. "V: 2.19.0") — choose the matching version and enter the label. They are never guessed.');
      if (!liveUrl) flags.push(`No live URL is configured for ${brand} ${geo || '(GEO unknown)'} — enter the page URL in Steps to Replicate.`);
      res.json({
        project: { key: ticket.projectKey },
        drafts,
        options: {
          priorityOptions,
          defaultPriority: priorityOptions.find(p => /^normal$/i.test(p)) ?? priorityOptions.find(p => /^medium$/i.test(p)) ?? priorityOptions[0] ?? '',
          versionOptions: versions.filter(v => !v.archived).map(v => ({ id: v.id, name: v.name })),
          fixVersionId: next?.id ?? '',
          assigneeOptions,
        },
        flags,
      });
    } catch (e) {
      res.status(502).json({ error: `Could not read Jira for the ticket options: ${getErrorMessage(e)}` });
    }
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

    // One QA comment per pass: a comment from this account for this phase and
    // date already on the ticket is revised in place, never duplicated
    // (Post-Check Standard hard rule #4). Posting needs an explicit
    // "revise existing" from the caller; a read failure is warned, not fatal.
    let existing: { id: string; header: string; created: string } | null = null;
    try {
      const [comments, me] = await Promise.all([jira.getComments(key), jira.getMyself()]);
      // A re-test is its own pass — it never revises the comment it is re-testing.
      existing = session.retest ? null : findSamePassComment(comments, me.accountId, session.phase);
    } catch (e) {
      warnings.push(`Could not check for an existing comment for this pass: ${getErrorMessage(e)} — check the ticket for a duplicate.`);
    }
    const reviseExisting = existing !== null && req.body?.reviseExisting === true;
    if (existing && !reviseExisting) {
      res.status(409).json({
        duplicate: true,
        commentId: existing.id,
        error: `This ticket already has a "${existing.header}" comment from this pass. One QA comment per pass — revise it in place instead of posting a second.`,
      });
      return;
    }

    // A post-check that found issues files new linked bug ticket(s) as part of
    // this same approval (Post-Check Standard, procedure step 5): validated up
    // front so nothing is written if any draft fails the standard, created
    // BEFORE the comment so a failed creation leaves the original untouched.
    const filesTickets = session.phase === 'post-check' && !sessionSuccess(session) && !reviseExisting;
    const skipTickets = req.body?.skipTickets === true;
    const ticketEdits = (Array.isArray(req.body?.tickets) ? req.body.tickets : []).map((t: any) => ({
      id: String(t?.id ?? ''), edit: normaliseBugEdit(t),
    }));
    let originalProject = '';
    let originalBrand = '';
    if (filesTickets) {
      if (ticketEdits.length === 0 && !skipTickets) {
        res.status(422).json({
          needsTickets: true,
          error: 'This post-check found issues. Draft the new bug ticket(s) and approve them with the comment, or choose to file them by hand.',
        });
        return;
      }
      try {
        originalProject = (await jira.getTicket(key)).projectKey;
        originalBrand = resolveBrandFromProjectKey(originalProject) ?? originalProject;
      } catch (e) {
        res.status(500).json({ error: `Could not read ${key}: ${getErrorMessage(e)}. Nothing was changed.` });
        return;
      }
      const problems = ticketEdits.flatMap((t: { id: string; edit: ReturnType<typeof normaliseBugEdit> }) =>
        checkBugEdit(originalBrand, t.edit).problems.map(p => `${t.id}: ${p}`));
      if (problems.length) {
        res.status(422).json({ error: 'A bug ticket draft does not meet the standard yet. Nothing was sent to Jira.', problems });
        return;
      }
    }

    const createdNow: Array<{ id: string; key: string; url: string; attachFailed: string[]; linkError?: string }> = [];
    if (filesTickets && !skipTickets) {
      session.createdTickets = session.createdTickets ?? {};
      for (const t of ticketEdits as Array<{ id: string; edit: ReturnType<typeof normaliseBugEdit> }>) {
        if (session.createdTickets[t.id]) continue; // already filed on an earlier attempt
        try {
          const created = await jira.createIssue(buildBugFields(originalProject, t.edit));
          session.createdTickets[t.id] = created;
          const entry: typeof createdNow[number] = { id: t.id, ...created, attachFailed: [] };
          try { await jira.linkIssues(created.key, key); } catch (e) { entry.linkError = getErrorMessage(e); }
          entry.attachFailed = await attachSessionEvidence(jira, created.key, session);
          createdNow.push(entry);
        } catch (e) {
          const detail = (e as any)?.response?.data ? JSON.stringify((e as any).response.data) : getErrorMessage(e);
          res.status(502).json({
            error: `Jira did not create bug ticket "${t.id}": ${detail}. The comment was not posted and ${key} was not closed — ${Object.keys(session.createdTickets).length} ticket(s) already created are kept and will not be duplicated on retry.`,
            created: Object.values(session.createdTickets),
          });
          return;
        }
      }
      for (const c of createdNow) {
        if (c.linkError) warnings.push(`${c.key} was created but could not be linked to ${key}: ${c.linkError} — link it by hand.`);
        if (c.attachFailed.length) warnings.push(`${c.key}: could not attach ${c.attachFailed.join(', ')}.`);
      }
    }

    // Only the pre-check flow passes through an "In Review" holding state —
    // post-check goes straight from Production QA/Approved to Closed either
    // way, per the Reporting Protocol (§5.3/§5.4). A revision leaves the
    // ticket's status alone: it already moved when the comment was first posted.
    if (session.phase === 'pre-check' && !reviseExisting) {
      try {
        await jira.transitionTicket(key, TRANSITION_IN_REVIEW);
      } catch (e) {
        warnings.push(`Could not transition to In Review: ${getErrorMessage(e)}`);
      }
    }

    let success: boolean;
    let commentAdf: object;

    if (session.kind === 'playwright') {
      const attachments = await uploadEvidence(jira, key, session, warnings);

      const videos: VideoAttachment[] = [];
      for (const videoPath of session.testResult.videoPaths) {
        try {
          const att = await jira.uploadAttachment(key, videoPath);
          videos.push({ contentUrl: att.contentUrl, filename: att.filename });
        } catch (e) {
          warnings.push(`Could not upload video ${videoPath}: ${getErrorMessage(e)}`);
        }
      }

      success = sessionSuccess(session);
      commentAdf = buildCommentAdf(session.testResult, attachments, session.checkItems, session.phase, videos, sessionCtx(session));
    } else if (session.visualKind === 'site-vs-site') {
      const attachments = await uploadEvidence(jira, key, session, warnings);

      success = sessionSuccess(session);
      commentAdf = buildVisualCommentAdf('site-vs-site', session.result, attachments, session.checkItems, session.phase, sessionCtx(session));
    } else {
      const attachments = await uploadEvidence(jira, key, session, warnings);

      success = sessionSuccess(session);
      commentAdf = buildVisualCommentAdf('asset-vs-site', session.result, attachments, session.checkItems, session.phase, sessionCtx(session));
    }

    try {
      if (reviseExisting && existing) {
        await jira.updateCommentAdf(key, existing.id, commentAdf);
      } else {
        await jira.addCommentAdf(key, commentAdf);
      }
    } catch (e) {
      res.status(500).json({ error: `Comment failed, ticket left as-is: ${getErrorMessage(e)}`, warnings });
      return;
    }

    if (reviseExisting) {
      // Revised in place — status already moved on the first post, so it is
      // not transitioned again.
      checkSessions.delete(key);
      warnings.push('The existing comment was revised in place; the ticket status was left unchanged.');
      res.json({ committed: true, revised: true, status: 'unchanged', warnings });
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
        warnings.push(skipTickets
          ? 'Post-check FAILED and no bug ticket was drafted — file the new ticket(s) by hand and link them to this one; this ticket is being closed per protocol, not reopened.'
          : 'Post-check FAILED — this ticket is being closed per protocol, not reopened; the new bug ticket(s) track the issues.');
      }
    } else {
      finalTransition = success ? TRANSITION_APPROVED : TRANSITION_REOPENED;
      finalStatusLabel = success ? 'Approved' : 'Reopened';
      if (!success) {
        warnings.push('Pre-check FAILED — ticket is now Reopened. Assign it to the developer (Boaz by default; confirm with the QA PIC first) — not yet automated.');
      }
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

    const filed = Object.values(session.createdTickets ?? {});
    checkSessions.delete(key);
    res.json({ committed: true, status: finalStatusLabel, warnings, tickets: filed });
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

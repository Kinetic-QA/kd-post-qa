// "Create JIRA ticket" popup backend — PROOF OF CONCEPT.
//
// Drafts one bug ticket per Triage finding, following the QKB Confluence
// standards (fetched live every time via confluence-client, never copied
// here): QA Reporting Protocols & Guidelines 2026 (page 281935875, §4) and
// the Bug Ticket Standard (page 291209218, ten-paragraph Description).
//
// NOTHING IS WRITTEN TO JIRA by this module. Every Jira call here is a
// read-only lookup (who am I, project versions, create-screen fields), and
// /jira-create only ever returns the exact payload it WOULD send (dryRun).
// Jira writes need explicit per-action approval (Bug Ticket Standard,
// "Non-negotiable cross-cutting rules") — real creation is a separate step.
import type { Express } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { BRAND_URLS } from '../helpers/brand-urls';
import { JiraClient } from '../src/jira-client';
import { getConfluencePageText, getConfluencePageVersion } from '../src/confluence-client';
import { MODEL } from './visual-compare';

const PROTOCOL_PAGE_ID = '281935875';      // QA Reporting Protocols & Guidelines 2026
const BUG_STANDARD_PAGE_ID = '291209218';  // Bug Ticket Standard

// GUI brand code -> Jira project key. Only the 12 consumer-brand spaces —
// never CMS/FF/DEV/KDP/PRM/RR etc. Keys verified live against the Jira
// project list 2026-10-06; two differ from the brand code (LP1, ICE36).
// GSP (GC Safer Play) is a separate project and deliberately NOT GC's.
export const BRAND_TO_JIRA_PROJECT: Record<string, { key: string; name: string }> = {
  GC:  { key: 'GC',    name: 'GentingCasino' },
  MC:  { key: 'MC',    name: 'MegaCasino' },
  SC:  { key: 'SC',    name: 'Slingo' },
  SNG: { key: 'SNG',   name: 'SpinGenie' },
  LMS: { key: 'LMS',   name: 'LuckyMeSlots' },
  PC:  { key: 'PC',    name: 'PrimeCasino' },
  PSC: { key: 'PSC',   name: 'PrimeScratchCards' },
  PSL: { key: 'PSL',   name: 'PrimeSlots' },
  SG:  { key: 'SG',    name: 'SimbaGames' },
  ZI:  { key: 'ZI',    name: 'ZingoBingo' },
  LP:  { key: 'LP1',   name: 'lord-ping' },
  I36: { key: 'ICE36', name: 'Ice36' },
};

export type FindingEvidence = { platform: 'Desktop' | 'Mobile'; screenshot: string | null; errorContext: string | null };
export type Finding = {
  id: string;
  geo: string;
  title: string;
  specFile: string;
  platforms: Array<'Desktop' | 'Mobile'>;
  status: 'failed' | 'flaky';
  errorMessage: string | null;
  errorLocation: string | null;
  evidence: FindingEvidence[];
};

type Deps = {
  isValidBrand: (brand: string) => boolean;
  isValidDateStr: (dateStr: string) => boolean;
  findFinding: (brand: string, dateStr: string, geo: string, title: string) => Promise<Finding | null>;
};

const SECTION_KEYS = [
  'summaryOfBug', 'affectedGeo', 'affectedPlatform', 'affectedPages', 'environment',
  'stepsToReplicate', 'actualResult', 'expectedResult', 'impactNotes', 'ccQaTeam',
] as const;
type SectionKey = typeof SECTION_KEYS[number];

// The Description, in the Bug Ticket Standard's fixed order. Labels are the
// standard's own wording.
const SECTION_LABELS: Record<SectionKey, string> = {
  summaryOfBug: 'Summary of Bug',
  affectedGeo: 'Affected GEO',
  affectedPlatform: 'Affected Platform',
  affectedPages: 'Affected Pages',
  environment: 'Environment',
  stepsToReplicate: 'Steps to Replicate',
  actualResult: 'Actual Result',
  expectedResult: 'Expected Result',
  impactNotes: 'Impact/Notes',
  ccQaTeam: 'CC',
};

const testsRoot = (): string => path.join(process.cwd(), 'tests');
const reportsRoot = (): string => path.join(process.cwd(), 'Test Reports');

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function readTextSafe(file: string | null, maxChars: number): string {
  if (!file) return '';
  try {
    const resolved = path.resolve(file);
    if (!isInside(reportsRoot(), resolved)) return '';
    return fs.readFileSync(resolved, 'utf8').slice(0, maxChars);
  } catch {
    return '';
  }
}

// The test's own source — its steps and assertions are the best available
// description of what "expected" means and how to reproduce it.
function readTestSnippet(specFile: string, testTitle: string): string {
  try {
    const file = path.resolve(testsRoot(), specFile);
    if (!isInside(testsRoot(), file)) return '';
    const src = fs.readFileSync(file, 'utf8');
    const at = src.indexOf(testTitle);
    const start = at >= 0 ? at : Math.max(src.indexOf(testTitle.split(':')[0]), 0);
    return src.slice(start, start + 4500);
  } catch {
    return '';
  }
}

const hostOf = (url: string): string => {
  try { return new URL(url).host.toLowerCase(); } catch { return ''; }
};

// QA vs Live is read from the evidence itself (the page snapshot's own URLs)
// against the brand's known QA/live hosts — not assumed, because pre-live
// markets (e.g. SNG/MC AB) run against QA and the Protocol treats the two
// differently (§4.8).
function resolveEnvironment(brand: string, geo: string, pageSnapshot: string): { env: 'QA' | 'Live' | 'Unknown'; baseUrl: string | null } {
  const entry = BRAND_URLS.find(e => e.brand === brand && e.geo === geo);
  if (!entry) return { env: 'Unknown', baseUrl: null };
  const snapshot = pageSnapshot.toLowerCase();
  const qaHost = hostOf(entry.qaUrl ?? '');
  const liveHost = hostOf(entry.liveUrl ?? '');
  if (qaHost && snapshot.includes(qaHost) && qaHost !== liveHost) return { env: 'QA', baseUrl: entry.qaUrl };
  if (liveHost && snapshot.includes(liveHost)) return { env: 'Live', baseUrl: entry.liveUrl };
  return { env: 'Unknown', baseUrl: null };
}

// Same detection the ticket draft uses, for the Triage table's QA/Live tag
// and Review's wording — one rule, so the tag and the ticket can't disagree.
export function findingEnvironment(brand: string, f: Finding): 'QA' | 'Live' | 'Unknown' {
  const snapshot = f.evidence.map(e => readTextSafe(e.errorContext, 3500)).find(Boolean) ?? '';
  return resolveEnvironment(brand, f.geo, snapshot).env;
}

function extractJson(raw: string): any {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  return JSON.parse(start !== -1 && end > start ? raw.slice(start, end + 1) : raw);
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

// Protocol §4.3-4.7 only (summary format, required info, expected/actual,
// evidence, multi-scope) — the rest of that page is about other workflows.
// Returns null when the section can't be found — the caller must flag that,
// never fall back to some other part of the page (an earlier version did, and
// silently sent the AI the Requirement Review chapter instead of §4).
function protocolIssueSection(text: string): string | null {
  const from = text.search(/(^|\n)4\.3 /);
  if (from < 0) return null;
  const rest = text.slice(from);
  const to = rest.slice(1).search(/\n4\.8 /);
  return (to >= 0 ? rest.slice(0, to + 1) : rest.slice(0, 12000)).trim();
}

// These two pages are long; the client's default 8,000-char cut-off dropped
// most of the Protocol (everything from §3.2 on, i.e. all of §4).
const STANDARDS_MAX_CHARS = 60000;

// ── Change warning ───────────────────────────────────────────────────────
// The AI draft reads the standards live, but the CHECKS in this file (title
// format, section order and labels, Fix Version "Next", steps opening with a
// URL, COM-vs-UK, no trailing status tag) were written by hand from these
// pages as they stood on the date below. If a page has been edited since,
// those checks may no longer match it — so the popup warns instead of
// letting the code drift silently.
//
// WHEN YOU UPDATE THE CHECKS: re-read the page, change the code to match,
// THEN bump the version number here (and the date). Never bump it without
// re-reading — that would just silence the warning.
//
// Open on the QA PIC's side (not decided by this code, re-check when these
// pages change): the Protocol §4.9 default assignee ("Boaz") vs the Bug
// Ticket Standard's reporter-as-assignee (this file uses the reporter), and
// Actual-vs-Expected order (the Protocol contradicts itself; this file uses
// Actual first, as the Bug Ticket Standard does).
export const CHECKS_WRITTEN_AGAINST = {
  asOf: '2026-10-07',
  pages: [
    { id: BUG_STANDARD_PAGE_ID, title: 'Bug Ticket Standard', version: 3 },
    { id: PROTOCOL_PAGE_ID, title: 'QA Reporting Protocols & Guidelines 2026', version: 3 },
    { id: '281870363', title: 'Kinetic Digital — Brands & GEO Mapping', version: 2 }, // basis of the COM-vs-UK rule
  ],
};

// One plain-language warning per page that has changed since the checks were
// written. Silent when nothing changed, or when a version can't be read (the
// text fetch has its own warning for an unreachable Confluence).
export async function standardsDriftFlags(baseline = CHECKS_WRITTEN_AGAINST): Promise<string[]> {
  const current = await Promise.all(baseline.pages.map(p => getConfluencePageVersion(p.id)));
  const flags: string[] = [];
  baseline.pages.forEach((p, i) => {
    const now = current[i];
    if (!now || now.number === p.version) return;
    const when = now.when ? new Date(now.when).toISOString().slice(0, 10) : 'recently';
    flags.push(
      `"${p.title}" has been edited${now.by ? ` by ${now.by}` : ''} on ${when} (version ${p.version} → ${now.number}) since this popup's checks were written on ${baseline.asOf}. ` +
      'The draft below follows the new text, but the checks that run when you press Create may be out of date — read the page and tell whoever maintains this popup before relying on them.',
    );
  });
  return flags;
}

function adfText(text: string, bold = false): any {
  return bold ? { type: 'text', text, marks: [{ type: 'strong' }] } : { type: 'text', text };
}
const adfPara = (...content: any[]): any => ({ type: 'paragraph', content });

// ADF for the Description: one bold label paragraph then its content, each as
// its own block. Steps are a real numbered list followed by an empty
// paragraph — ADF has no "list absorbs the next line" trap (that is a
// ProseMirror editor behaviour, not an API one).
function buildDescriptionAdf(sections: Record<SectionKey, string>): any {
  const content: any[] = [];
  for (const key of SECTION_KEYS) {
    const value = sections[key] ?? '';
    content.push(adfPara(adfText(`${SECTION_LABELS[key]}${key === 'ccQaTeam' ? ':' : ''}`, true), ...(key === 'ccQaTeam' ? [adfText(` ${value}`)] : [])));
    if (key === 'ccQaTeam') continue;
    if (key === 'stepsToReplicate') {
      const steps = value.split('\n').map(s => s.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
      content.push({
        type: 'orderedList',
        content: steps.map(s => ({ type: 'listItem', content: [adfPara(adfText(s))] })),
      });
      content.push(adfPara());
    } else {
      for (const line of value.split('\n').filter(l => l.trim())) content.push(adfPara(adfText(line)));
    }
  }
  return { type: 'doc', version: 1, content };
}

export function registerJiraTicketRoutes(app: Express, deps: Deps): void {
  // Evidence screenshot for the popup thumbnail, resolved by finding + platform
  // (never a client-supplied path) and confined to Test Reports/.
  app.get('/triage-evidence', async (req, res) => {
    const brand = String(req.query.brand ?? '');
    const dateStr = String(req.query.dateStr ?? '');
    const platform = String(req.query.platform ?? '');
    if (!deps.isValidBrand(brand) || !deps.isValidDateStr(dateStr)) { res.status(400).end(); return; }
    const finding = await deps.findFinding(brand, dateStr, String(req.query.geo ?? ''), String(req.query.title ?? ''));
    const shot = finding?.evidence.find(e => e.platform === platform)?.screenshot;
    if (!shot) { res.status(404).end(); return; }
    const resolved = path.resolve(shot);
    if (!isInside(reportsRoot(), resolved) || !fs.existsSync(resolved)) { res.status(404).end(); return; }
    res.sendFile(resolved);
  });

  app.post('/jira-draft', async (req, res) => {
    const brand = String(req.body?.brand ?? '');
    const dateStr = String(req.body?.dateStr ?? '');
    const geo = String(req.body?.geo ?? '');
    const title = String(req.body?.title ?? '');
    if (!deps.isValidBrand(brand) || !deps.isValidDateStr(dateStr)) {
      res.status(400).json({ error: 'Invalid brand or date.' });
      return;
    }
    const project = BRAND_TO_JIRA_PROJECT[brand];
    if (!project) {
      res.status(400).json({ error: `No Jira space is mapped for brand ${brand}.` });
      return;
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set — add it to .env to draft tickets.' });
      return;
    }
    const finding = await deps.findFinding(brand, dateStr, geo, title);
    if (!finding) {
      res.status(404).json({ error: 'That finding is not part of this run.' });
      return;
    }

    const flags: string[] = [];

    // ── Live standards + read-only Jira lookups, in parallel ──────────────
    const [protocolText, bugStandardText, jiraLookups, driftFlags] = await Promise.all([
      getConfluencePageText(PROTOCOL_PAGE_ID, undefined, STANDARDS_MAX_CHARS),
      getConfluencePageText(BUG_STANDARD_PAGE_ID, undefined, STANDARDS_MAX_CHARS),
      (async () => {
        try {
          const jira = new JiraClient();
          const [me, versions, fields] = await Promise.all([
            jira.getMyself(),
            jira.getProjectVersions(project.key),
            jira.getIssueTypeFields(project.key, 'Bug'),
          ]);
          return { me, versions, fields, error: null as string | null };
        } catch (e) {
          return { me: null, versions: [], fields: null, error: e instanceof Error ? e.message : String(e) };
        }
      })(),
      standardsDriftFlags(),
    ]);
    // First in the list: it affects how far to trust everything else below.
    flags.unshift(...driftFlags);
    if (!bugStandardText) flags.push('Could not read the Bug Ticket Standard from Confluence — the draft was written without it. Check it against the standard before creating.');
    const protocolIssues = protocolText ? protocolIssueSection(protocolText) : null;
    if (!protocolIssues) flags.push('Could not read the issue-reporting section (§4) of QA Reporting Protocols & Guidelines from Confluence — the draft was written without it.');
    if (jiraLookups.error) flags.push(`Could not read Jira (${jiraLookups.error}) — project, priority, versions and assignee below are unconfirmed.`);
    else if (!jiraLookups.fields) flags.push(`Jira space ${project.key} has no "Bug" work type.`);

    // ── Evidence the AI is allowed to reason from ────────────────────────
    const errorContext = finding.evidence.map(e => readTextSafe(e.errorContext, 3500)).find(Boolean) ?? '';
    const testSnippet = readTestSnippet(finding.specFile, finding.title);
    const { env, baseUrl } = resolveEnvironment(brand, geo, errorContext);
    if (env === 'Unknown') flags.push('Could not tell from the evidence whether this was the QA or the live site — set Environment yourself.');

    const evidence = finding.evidence
      .filter(e => e.screenshot)
      .map(e => ({
        platform: e.platform,
        url: `/triage-evidence?${new URLSearchParams({ brand, dateStr, geo, title, platform: e.platform }).toString()}`,
      }));
    if (evidence.length === 0) flags.push('No screenshot was captured for this failure — attach evidence by hand (Protocol §4.6: state why if none).');

    const platformText = finding.platforms.join(', ');
    const prompt = `You are drafting ONE Jira bug ticket for a QA engineer, from an automated regression test failure. Follow the team's official standards below exactly.

=== BUG TICKET STANDARD (Confluence, live) ===
${bugStandardText ?? '(unavailable)'}

=== QA REPORTING PROTOCOL §4.3-4.7 (Confluence, live) ===
${protocolIssues ?? '(unavailable)'}

=== THE FAILURE ===
Brand: ${brand}   GEO: ${geo}   Platform(s) that failed: ${platformText}   Environment: ${env}
Base URL for this brand/GEO/environment: ${baseUrl ?? '(unknown)'}
Test: ${finding.title}
Test file: ${finding.specFile}
Error: ${finding.errorMessage ?? '(none captured)'}
Error location: ${finding.errorLocation ?? '(unknown)'}

--- The test's own code (its steps and assertions show what the page is expected to do) ---
${testSnippet || '(unavailable)'}

--- Playwright's page snapshot + error details at the moment of failure ---
${errorContext || '(unavailable)'}

Write the ticket content as ONLY a JSON object (no prose before/after):
{
  "pageFeature": "the page or feature, 1-4 words, e.g. 'Help Page'",
  "issue": "what is wrong, a short phrase for the ticket title, e.g. 'FAQ accordion is missing' — a bug description, not the test name",
  "summaryOfBug": "one or two plain sentences describing the defect",
  "affectedPages": [ { "name": "page name", "url": "full URL" } ],
  "stepsToReplicate": ["step 2", "step 3", "..."],
  "actualResult": "what currently happens, observable behaviour only, no guessed cause",
  "expectedResult": "what should happen",
  "impactNotes": "short context, or 'None'",
  "needsHumanCheck": ["anything you INFERRED rather than saw in the evidence"]
}
Rules:
- Use ONLY URLs that appear in the evidence above or are the base URL plus a path you can see in the evidence/test code. Never invent a domain.
- stepsToReplicate: do NOT include the opening URL step — it is added for you. Write the remaining steps as short imperative sentences from the test's own steps. Include only the steps needed to reach and observe the defect — no filler such as 'confirm you are logged out'.
- Describe what a USER sees, not selectors or test internals (no CSS selectors, no 'locator', no 'timeout').
- expectedResult must come from what the test asserts; if the requirement itself is not stated anywhere above, say so in needsHumanCheck.
- impactNotes is for user-facing impact and useful context only. Never mention the test code, skip guards, selectors or how the automation works.
- Do not add examples, names, numbers or wording that do not appear in the evidence above (for instance, do not list example payment providers or quote page text you were not given). If a detail would help but is not in the evidence, leave it out.
- Do not mention ISTQB or any testing-theory terminology.
- Plain language a non-developer teammate can follow.`;

    let ai: any;
    try {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1800,
        messages: [{ role: 'user', content: prompt }],
      });
      const raw = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n').trim();
      ai = extractJson(raw);
    } catch (e) {
      res.status(502).json({ error: `Could not draft the ticket: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }

    // ── Deterministic parts (not left to the AI) ─────────────────────────
    const pages: Array<{ name: string; url: string }> = (Array.isArray(ai.affectedPages) ? ai.affectedPages : [])
      .map((p: any) => ({ name: str(p?.name), url: str(p?.url) }))
      .filter((p: { name: string; url: string }) => p.url);
    // A URL on a host other than this brand's QA/live host is a hallucination
    // risk — drop to the base URL rather than ship an invented link.
    const okHost = baseUrl ? hostOf(baseUrl) : '';
    const safePages = pages.filter(p => !okHost || hostOf(p.url) === okHost);
    if (pages.length !== safePages.length) flags.push('The AI proposed a page URL on an unexpected site; it was removed — check Affected Pages.');
    if (safePages.length === 0 && baseUrl) {
      safePages.push({ name: str(ai.pageFeature) || 'Page', url: baseUrl });
      flags.push('No page URL could be confirmed from the evidence; the site home URL was used — set the exact page.');
    }
    const firstStepUrl = safePages[0]?.url ?? baseUrl ?? '[URL]';
    const steps = [
      `Go to ${firstStepUrl} as a logged-out user (GEO: ${geo}, ${platformText}).`,
      ...(Array.isArray(ai.stepsToReplicate) ? ai.stepsToReplicate.map(str).filter(Boolean) : []),
    ];

    const needsHumanCheck: string[] = (Array.isArray(ai.needsHumanCheck) ? ai.needsHumanCheck : []).map(str).filter(Boolean);

    // Title: exactly three segments, "[Brand + Geo] - [Page/Feature] - [Issue]",
    // no trailing status tags (Protocol §4.3 / Bug Ticket Standard).
    const summary = `${brand} ${geo} - ${str(ai.pageFeature) || 'Page'} - ${str(ai.issue) || 'Issue found by regression test'}`;

    // Fix Version: the project's option with "Next" in its name (Protocol §4.9 step 11).
    const next = jiraLookups.versions.find(v => /next/i.test(v.name) && !v.archived) ?? null;
    if (!next && !jiraLookups.error) flags.push(`No "Next" Fix Version found in ${project.key} — set it after creating.`);

    // Priority: "Normal" per Protocol §4.9; Jira's own scheme may call it Medium.
    const priorityOptions = jiraLookups.fields?.fields?.priority?.allowedValues ?? [];
    const priority = priorityOptions.find(p => /^normal$/i.test(p)) ?? priorityOptions.find(p => /^medium$/i.test(p)) ?? priorityOptions[0] ?? null;

    if (env === 'QA') {
      flags.push('Found on the QA site. Per Protocol §4.8, a pre-check issue is normally reported as a comment on the ORIGINAL task (set to Reopened), not as a new bug. Only create a new bug if that is what you intend.');
    }
    flags.push('Affects Version and the x.xx-post label need the version shown in the site footer (e.g. "V: 2.19.0") — enter it below. They are never guessed.');

    res.json({
      project,
      issueType: 'Bug',
      summary,
      sections: {
        summaryOfBug: str(ai.summaryOfBug),
        affectedGeo: geo,
        affectedPlatform: platformText,
        affectedPages: safePages.map(p => `${p.name}: ${p.url}`).join('\n'),
        environment: env === 'Unknown' ? '' : env === 'QA' ? 'QA (staging)' : 'Live (production)',
        stepsToReplicate: steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
        actualResult: str(ai.actualResult),
        expectedResult: str(ai.expectedResult),
        impactNotes: str(ai.impactNotes) || 'None',
        ccQaTeam: 'QA Team',
      } satisfies Record<SectionKey, string>,
      environment: env,
      fields: {
        priority,
        priorityOptions,
        assignee: jiraLookups.me,
        fixVersion: next ? { id: next.id, name: next.name } : null,
        versionOptions: jiraLookups.versions.filter(v => !v.archived).map(v => ({ id: v.id, name: v.name })),
        brandCode: brand,
      },
      needsHumanCheck,
      flags,
      evidence,
    });
  });

  // DRY RUN ONLY. Validates the edited draft against the standard and returns
  // the exact Jira payload it would send. Never contacts Jira's write API.
  app.post('/jira-create', (req, res) => {
    const brand = String(req.body?.brand ?? '');
    const draft = req.body?.draft;
    if (!deps.isValidBrand(brand) || !draft || typeof draft !== 'object') {
      res.status(400).json({ error: 'Invalid request.' });
      return;
    }
    if (req.body?.dryRun !== true) {
      res.status(501).json({ error: 'Real ticket creation is not enabled yet — this is the proof of concept. Nothing was sent to Jira.' });
      return;
    }
    const project = BRAND_TO_JIRA_PROJECT[brand];
    if (!project) { res.status(400).json({ error: `No Jira space is mapped for brand ${brand}.` }); return; }

    const sections = {} as Record<SectionKey, string>;
    for (const key of SECTION_KEYS) sections[key] = str(draft.sections?.[key]);
    const summary = str(draft.summary);

    // Checks against the written standard — problems are reported, not
    // silently fixed; the person decides.
    const problems: string[] = [];
    if (!summary) problems.push('Summary is empty.');
    else if ((summary.match(/ - /g) ?? []).length < 2) problems.push('Summary should be "[Brand + Geo] - [Page/Feature] - [Issue]" (three parts).');
    if (/\b(TEST|TEST RUN)\b/i.test(summary.split(' - ').slice(3).join(' - '))) problems.push('Summary has a trailing status tag — the standard allows exactly three parts.');
    for (const key of SECTION_KEYS) if (!sections[key]) problems.push(`"${SECTION_LABELS[key]}" is empty.`);
    if (sections.stepsToReplicate && !/https?:\/\//i.test(sections.stepsToReplicate.split('\n')[0] ?? '')) problems.push('Steps to Replicate must open with a real URL.');
    if (/^com$/i.test(sections.affectedGeo.trim()) && ['GC', 'SC', 'SNG'].includes(brand)) problems.push(`${brand}'s .com site is the UK site — Affected GEO should say UK, not COM.`);
    const priority = str(draft.priority);
    const assigneeId = str(draft.assigneeAccountId);
    if (!assigneeId) problems.push('No assignee.');

    const fixVersionId = str(draft.fixVersionId);
    const affectsVersionId = str(draft.affectsVersionId);
    const labels: string[] = (Array.isArray(draft.labels) ? draft.labels : []).map(str).filter(Boolean);

    const fields: Record<string, unknown> = {
      project: { key: project.key },
      issuetype: { name: 'Bug' },
      summary,
      description: buildDescriptionAdf(sections),
      assignee: { accountId: assigneeId },
      ...(priority ? { priority: { name: priority } } : {}),
      ...(labels.length ? { labels } : {}),
      ...(fixVersionId ? { fixVersions: [{ id: fixVersionId }] } : {}),
      ...(affectsVersionId ? { versions: [{ id: affectsVersionId }] } : {}),
    };
    const unset: string[] = [];
    if (!fixVersionId) unset.push('Fix Version');
    if (!affectsVersionId) unset.push('Affects Version');
    if (!labels.length) unset.push('Labels');

    const attachments: string[] = (Array.isArray(draft.evidencePlatforms) ? draft.evidencePlatforms : []).map(str).filter(Boolean);

    res.json({
      dryRun: true,
      sent: false,
      note: 'DRY RUN — nothing was sent to Jira.',
      ok: problems.length === 0,
      problems,
      unsetFieldsToFlagInRemarks: unset,
      wouldPostTo: `POST ${(process.env.JIRA_BASE_URL ?? '').replace(/\/$/, '')}/rest/api/3/issue`,
      payload: { fields },
      thenAttach: attachments.map(p => `${p} screenshot (uploaded to the new ticket after it is created)`),
    });
  });
}

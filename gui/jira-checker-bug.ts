// JIRA Checker — new bug ticket for a post-check FAIL.
//
// Per the QA Reporting Protocols §5.4 and the Post-Check Standard (procedure
// step 5), a post-check that finds issues files a NEW linked Jira ticket for
// what failed (related failures grouped into one ticket, unrelated ones
// separate) and the original ticket moves to Closed — never reopened. The
// ticket's Description follows the Bug Ticket Standard (page 291209218, v5):
// ten paragraphs in a fixed order, "Steps to Replicate" a numbered list opening
// with a real URL, Actual before Expected, Fix Version "[Brand] Next", an
// x.xx-post label, and the assignee chosen by the person (Boaz by default,
// always asked).
//
// Pure functions only — no Jira calls. jira-checker.ts does the reads and the
// (approved) writes. This file deliberately does not import the Triage ticket
// popup's code (gui/jira-ticket.ts): that side stays untouched.

export const BUG_SECTION_KEYS = [
  'summaryOfBug', 'affectedGeo', 'affectedPlatform', 'affectedPages', 'environment',
  'stepsToReplicate', 'actualResult', 'expectedResult', 'impactNotes', 'ccQaTeam',
] as const;
export type BugSectionKey = typeof BUG_SECTION_KEYS[number];

export const BUG_SECTION_LABELS: Record<BugSectionKey, string> = {
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

export interface BugDraft {
  id: string;
  summary: string;
  sections: Record<BugSectionKey, string>;
  failingItems: string[];   // which failures this ticket covers
  needsHumanCheck: string[]; // anything inferred rather than observed
}

export interface BugDraftInput {
  originalKey: string;
  originalSummary: string;
  brand: string;            // brand code, e.g. "SC"
  geo: string;
  platform: string;         // e.g. "Desktop"
  liveUrl: string | null;
  scopeItems: string[];     // what the original ticket asked to check
  failingItems: string[];   // one entry per failed item
  split: boolean;           // one ticket per failure instead of one grouped ticket
}

const stripTrailingDot = (s: string): string => s.replace(/[\s.]+$/, '');

// " - " separates the three summary parts, so it cannot appear inside one.
const inPart = (t: string): string => t.replace(/ - /g, ' – ');

// Drafts built only from what the check actually recorded — nothing is
// invented. Page/feature and issue wording are starting points the QA engineer
// edits; anything inferred is listed in needsHumanCheck so it is never taken
// as verified.
export function draftBugTickets(i: BugDraftInput): BugDraft[] {
  const groups: string[][] = i.split ? i.failingItems.map(f => [f]) : [i.failingItems];
  return groups.map((items, n) => {
    const pageFeature = inPart(stripTrailingDot(i.scopeItems[0] ?? 'Page'));
    const issue = items.length === 1 ? inPart(stripTrailingDot(items[0])) : `${items.length} issues found at post-check`;
    const stepsUrl = i.liveUrl ?? '[URL]';
    const steps = [
      `Go to ${stepsUrl} as a logged-out user (GEO: ${i.geo}, ${i.platform}).`,
      ...items.map(it => `Check: ${stripTrailingDot(it)}.`),
    ];
    const needsHumanCheck = [
      'Steps to Replicate beyond the opening URL are taken from the failed check items — confirm they reproduce the issue.',
      'Expected Result is taken from the original ticket\'s check items — confirm it against the approved design or spec.',
    ];
    needsHumanCheck.push('Affected Pages names the page from the check item — confirm the page name and URL.');
    if (!i.liveUrl) needsHumanCheck.push('No live URL is configured for this brand/GEO — enter the page URL.');
    return {
      id: `bug-${n + 1}`,
      summary: `${i.brand} ${i.geo} - ${pageFeature} - ${issue}`,
      sections: {
        summaryOfBug: `Found during the post-check of ${i.originalKey} (${i.originalSummary}). ${items.map(stripTrailingDot).join('. ')}.`,
        affectedGeo: i.geo,
        affectedPlatform: i.platform,
        affectedPages: i.liveUrl ? `${pageFeature}: ${i.liveUrl}` : pageFeature,
        environment: 'Live (production)',
        stepsToReplicate: steps.map((s, k) => `${k + 1}. ${s}`).join('\n'),
        actualResult: items.map(stripTrailingDot).join('\n'),
        expectedResult: i.scopeItems.length ? i.scopeItems.map(stripTrailingDot).join('\n') : '',
        impactNotes: `Found on the live site during the post-check of ${i.originalKey}.`,
        ccQaTeam: 'QA Team',
      },
      failingItems: items,
      needsHumanCheck,
    };
  });
}

// ── Validation + Jira payload (Bug Ticket Standard, Protocol §4.3) ──────────

export interface BugDraftEdit {
  summary: string;
  sections: Record<BugSectionKey, string>;
  priority: string;
  assigneeAccountId: string;
  fixVersionId: string;
  affectsVersionId: string;
  labels: string[];
}

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function normaliseBugEdit(raw: unknown): BugDraftEdit {
  const r = (raw ?? {}) as Record<string, any>;
  const sections = {} as Record<BugSectionKey, string>;
  for (const k of BUG_SECTION_KEYS) sections[k] = s(r.sections?.[k]);
  return {
    summary: s(r.summary),
    sections,
    priority: s(r.priority),
    assigneeAccountId: s(r.assigneeAccountId),
    fixVersionId: s(r.fixVersionId),
    affectsVersionId: s(r.affectsVersionId),
    labels: (Array.isArray(r.labels) ? r.labels : []).map(s).filter(Boolean),
  };
}

// Problems block creation; `unset` lists fields left blank that the standard
// expects, which are flagged but never guessed.
export function checkBugEdit(brand: string, e: BugDraftEdit): { problems: string[]; unset: string[] } {
  const problems: string[] = [];
  if (!e.summary) problems.push('Summary is empty.');
  else if ((e.summary.match(/ - /g) ?? []).length < 2) problems.push('Summary should be "[Brand + Geo] - [Page/Feature] - [Issue]" (three parts).');
  else if (e.summary.split(' - ').length > 3) problems.push('Summary has more than three parts — no trailing status tags (Protocol §4.3).');
  for (const k of BUG_SECTION_KEYS) if (!e.sections[k]) problems.push(`"${BUG_SECTION_LABELS[k]}" is empty.`);
  const firstStep = e.sections.stepsToReplicate.split('\n')[0] ?? '';
  if (e.sections.stepsToReplicate && !/https?:\/\//i.test(firstStep)) problems.push('Steps to Replicate must open with a real URL.');
  if (/^com$/i.test(e.sections.affectedGeo) && ['GC', 'SC', 'SNG'].includes(brand)) {
    problems.push(`${brand}'s .com site is the UK site — Affected GEO should say UK, not COM.`);
  }
  if (!e.assigneeAccountId) problems.push('No assignee — choose the developer (Boaz by default; the person is always asked).');
  const unset: string[] = [];
  if (!e.fixVersionId) unset.push('Fix Version');
  if (!e.affectsVersionId) unset.push('Affects Version');
  if (!e.labels.length) unset.push('Labels (x.xx-post)');
  return { problems, unset };
}

const text = (t: string, bold = false): object => (bold ? { type: 'text', text: t, marks: [{ type: 'strong' }] } : { type: 'text', text: t });
const para = (...c: object[]): object => ({ type: 'paragraph', content: c });

// Each section its own paragraph with a bold label; Steps a real numbered list
// closed by an empty paragraph so Actual Result is never absorbed into it
// (Bug Ticket Standard, "Editor trap").
export function buildBugDescriptionAdf(sections: Record<BugSectionKey, string>): object {
  const content: object[] = [];
  for (const k of BUG_SECTION_KEYS) {
    const value = sections[k] ?? '';
    if (k === 'ccQaTeam') {
      content.push(para(text(`${BUG_SECTION_LABELS[k]}:`, true), text(` ${value}`)));
      continue;
    }
    content.push(para(text(BUG_SECTION_LABELS[k], true)));
    if (k === 'stepsToReplicate') {
      const steps = value.split('\n').map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
      content.push({ type: 'orderedList', content: steps.map(st => ({ type: 'listItem', content: [para(text(st))] })) });
      content.push(para());
    } else {
      for (const line of value.split('\n').filter(l => l.trim())) content.push(para(text(line)));
    }
  }
  return { type: 'doc', version: 1, content };
}

export function buildBugFields(projectKey: string, e: BugDraftEdit): Record<string, unknown> {
  return {
    project: { key: projectKey },
    issuetype: { name: 'Bug' },
    summary: e.summary,
    description: buildBugDescriptionAdf(e.sections),
    assignee: { accountId: e.assigneeAccountId },
    ...(e.priority ? { priority: { name: e.priority } } : {}),
    ...(e.labels.length ? { labels: e.labels } : {}),
    ...(e.fixVersionId ? { fixVersions: [{ id: e.fixVersionId }] } : {}),
    ...(e.affectsVersionId ? { versions: [{ id: e.affectsVersionId }] } : {}),
  };
}

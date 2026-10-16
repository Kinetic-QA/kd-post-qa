// Shared ADF comment builder — used by both the CLI agent (src/agent.ts) and
// the JIRA Checker GUI tab (gui/jira-checker.ts) so the two front doors to
// the same Jira automation always post an identical house-style comment.
//
// Shape follows the "Jira Comment Format Reference (reconstructed)"
// (Confluence page 283344898, authored by Reyn 2026-09-15 from QA Reporting
// Protocols §4/§5/§7, Standing Rules #6-8/#12/#13, and QA Role & Working
// Conventions §4 — a reconstruction, not the lost original, but the current
// authoritative source): shared skeleton (Pre/Post-Checked header, Scope
// Checked, Platform and GEOs Checked, Overall Result heading + separate
// verdict line), phase-specific verdict blocks, and evidence conventions.
// Not a live Confluence fetch like ticket-interpreter.ts's use of Standing
// Rules/Test Case Standard — this builds a structural ADF document
// deterministically rather than via an AI call, so the format is
// transcribed into code once rather than re-interpreted by AI on every
// post (which would risk a malformed comment shape on a bad AI response).
// Re-sync this file by hand if the Confluence page changes.
import type { TestRunResult } from './test-runner';

export function adfDoc(...content: object[]) {
  return { type: 'doc', version: 1, content };
}
export function adfPara(...inlines: object[]) {
  return { type: 'paragraph', content: inlines };
}
export function adfText(text: string) {
  return { type: 'text', text };
}
export function adfBold(text: string) {
  return { type: 'text', text, marks: [{ type: 'strong' }] };
}
export function adfBulletList(...items: string[]) {
  return {
    type: 'bulletList',
    content: items.map(i => ({
      type: 'listItem',
      content: [adfPara(adfText(i))],
    })),
  };
}
export function adfImage(thumbnailUrl: string) {
  return {
    type: 'mediaSingle',
    attrs: { layout: 'center' },
    content: [{
      type: 'media',
      attrs: { type: 'external', url: thumbnailUrl },
    }],
  };
}
export function adfRule() {
  return { type: 'rule' };
}
export function adfLink(text: string, url: string) {
  return { type: 'text', text, marks: [{ type: 'link', attrs: { href: url } }] };
}

export type CheckPhase = 'pre-check' | 'post-check';

export interface VideoAttachment {
  contentUrl: string;
  filename: string;
}

export interface CommentContext {
  geo?: string;
  platform?: string; // default 'Desktop' — automated Playwright runs are desktop-only today
  // Itemised notes for the Remarks section (Standing Rules #12) — an inferred
  // GEO/URL, how a check was carried out. Omitted entirely when empty; never
  // padded in just to exist.
  remarks?: string[];
  // Set when this pass is a re-test: the issues an earlier QA comment flagged,
  // and which of them are now fixed (Standing Rules #8).
  retest?: RetestContext;
}

export interface RetestContext {
  flagged: string[];
  fixed: boolean[]; // same length/order as flagged
}

// A re-test passes only when EVERY flagged issue is fixed; an issue that was
// not verified counts as not fixed (Standing Rules #8).
export function retestAllFixed(r: RetestContext | undefined): boolean {
  return !r || (r.flagged.length > 0 && r.flagged.every((_, i) => r.fixed[i] === true));
}

// Everything under the Overall Result verdict line for a re-test comment.
// PASS: each flagged line copied whole with "← ✅ FIXED", under Documentation.
// FAIL: still-failing items first with what is observed now, then any fixed
// ones under a divider, Documentation-style.
export function retestNodes(
  success: boolean,
  phase: CheckPhase,
  retest: RetestContext,
  attachments: { thumbnailUrl: string }[],
  observed: string,
): object[] {
  const fixedLines = retest.flagged.filter((_, i) => retest.fixed[i]).map(l => `${l} ← ✅ FIXED`);
  const failing = retest.flagged.filter((_, i) => !retest.fixed[i]);
  const fixedBlock = fixedLines.length > 0
    ? [adfRule(), adfPara(adfBold('Documentation')), adfBulletList(...fixedLines)]
    : [];

  if (success) {
    return [
      adfPara(adfText(`No issues were identified during ${phase === 'post-check' ? 'post-checking' : 'pre-checking'}.`)),
      ...fixedBlock,
      adfPara(adfText('Each flagged issue was re-checked and is now considered fixed.')),
      ...evidenceImages(attachments),
    ];
  }
  return [
    ...(phase === 'post-check' ? [adfPara(adfText(POST_CHECK_FAIL_SENTENCE))] : []),
    adfBulletList(...failing.map(l => `${l} — still failing: ${observed}`)),
    ...evidenceImages(attachments),
    ...fixedBlock,
  ];
}

// Shared "Platform and GEOs Checked" bullet pair — same two-line shape
// (GEO: <x> / Platform: <y>) the format reference specifies for every
// comment, functional or visual.
function platformGeoBullets(ctx: CommentContext = {}): object {
  return adfBulletList(
    `GEO: ${ctx.geo || '(not resolved — see ticket)'}`,
    `Platform: ${ctx.platform || 'Desktop'}`,
  );
}

// Fixed wording from the QA Reporting Protocols §7.5 / Standing Rules #12.
export const POST_CHECK_FAIL_SENTENCE = 'There are still issues found in the post-check. We will file a ticket for this.';

// Screenshots go inline in the comment body, directly under the item they
// evidence (Standing Rules #13) — images only, never a separate caption line
// underneath (the caption is drawn inside the image itself).
export function evidenceImages(attachments: { thumbnailUrl: string }[]): object[] {
  return attachments.map(att => adfImage(att.thumbnailUrl));
}

// Remarks sits at the very bottom, as itemised bullets; left out entirely
// when there is nothing to note (Standing Rules #12).
export function remarksNodes(ctx: CommentContext = {}): object[] {
  const items = (ctx.remarks ?? []).filter(r => r.trim());
  return items.length > 0 ? [adfPara(adfBold('Remarks')), adfBulletList(...items)] : [];
}

export function buildCommentAdf(
  result: TestRunResult,
  attachments: { thumbnailUrl: string; filename: string }[],
  checkItems: string[],
  phase: CheckPhase = 'pre-check',
  videos: VideoAttachment[] = [],
  ctx: CommentContext = {},
): object {
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const testLabel = result.testType.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const scopeItems = checkItems.length > 0 ? checkItems : [`${testLabel} Flow`];
  const headerLabel = phase === 'post-check' ? 'Post-Checked' : 'Pre-Checked';
  const phaseWord = phase === 'post-check' ? 'post-checking' : 'pre-checking';

  // Shared skeleton, all cases: header, Scope Checked, Platform and GEOs
  // Checked, then "Overall Result" as its own heading (the verdict itself
  // is a separate line, not folded into the same bold run).
  const nodes: object[] = [
    adfPara(adfBold(`${headerLabel} (${today})`)),
    adfPara(adfBold('Scope Checked')),
    adfBulletList(...scopeItems),
    adfPara(adfBold('Platform and GEOs Checked')),
    platformGeoBullets(ctx),
    adfPara(adfBold('Overall Result')),
  ];

  // A re-test's verdict also needs every flagged issue marked fixed.
  const passed = ctx.retest ? result.success && retestAllFixed(ctx.retest) : result.success;

  if (ctx.retest) {
    nodes.push(
      adfPara(adfText(passed ? '✅ ' : '❌ '), adfBold(passed ? 'PASS' : 'FAIL')),
      ...retestNodes(passed, phase, ctx.retest, attachments, result.errors[0] ?? 'see evidence'),
    );
  } else if (result.success) {
    // Documentation is the record of what passed and is on every comment that
    // has at least one passing item — pre-check and post-check alike
    // (Standing Rules #6/#12) — with its screenshots inline underneath.
    nodes.push(
      adfPara(adfText(`✅ `), adfBold('PASS')),
      adfPara(adfText(`No issues were identified during ${phaseWord}.`)),
      adfRule(),
      adfPara(adfBold('Documentation')),
      checkItems.length > 0
        ? adfBulletList(...checkItems)
        : adfBulletList(`${testLabel} flow confirmed working.`),
      ...evidenceImages(attachments),
    );
  } else {
    // One bullet per defect, stated as a factual mismatch, evidence directly
    // underneath. The post-check FAIL closing sentence is fixed wording; a
    // pre-check FAIL has no closing line (Standing Rules #7).
    const errItems = result.errors.length
      ? result.errors
      : ['Test failed — no error details captured'];

    nodes.push(
      adfPara(adfText(`❌ `), adfBold('FAIL')),
      ...(phase === 'post-check' ? [adfPara(adfText(POST_CHECK_FAIL_SENTENCE))] : []),
      adfBulletList(...errItems),
      ...evidenceImages(attachments),
    );
  }

  if (videos.length > 0) {
    nodes.push(adfPara(adfBold('Screen recording')));
    for (const vid of videos) {
      nodes.push(adfPara(adfLink(vid.filename, vid.contentUrl)));
    }
  }

  nodes.push(...remarksNodes(ctx));

  return adfDoc(...nodes);
}

// Plain-text render of any ADF doc built by adfDoc() — shared by every
// preview (Playwright-based and visual-compare-based alike) so there's one
// renderer, not one per comment type.
export function adfDocToPreviewText(doc: { content: any[] }): string {
  const lines: string[] = [];
  for (const node of doc.content) {
    if (node.type === 'paragraph') {
      lines.push((node.content ?? []).map((n: any) => n.text ?? '').join(''));
    } else if (node.type === 'bulletList') {
      for (const item of node.content ?? []) {
        const text = (item.content?.[0]?.content ?? []).map((n: any) => n.text ?? '').join('');
        lines.push(`  • ${text}`);
      }
    } else if (node.type === 'mediaSingle') {
      lines.push('  [screenshot]');
    } else if (node.type === 'rule') {
      lines.push('----------------------------------------');
    }
  }
  return lines.join('\n');
}

// Plain-text render of the same comment, for the GUI's pre-Commit preview —
// screenshots aren't uploaded yet at preview time, so attachments are never
// passed here (Commit builds the real ADF version, with attachments, itself).
export function commentPreviewText(result: TestRunResult, checkItems: string[], phase: CheckPhase = 'pre-check', ctx: CommentContext = {}): string {
  return adfDocToPreviewText(buildCommentAdf(result, [], checkItems, phase, [], ctx) as { content: any[] });
}

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

export function buildCommentAdf(
  result: TestRunResult,
  attachments: { thumbnailUrl: string; filename: string }[],
  checkItems: string[],
  phase: CheckPhase = 'pre-check',
  videos: VideoAttachment[] = [],
  ctx: CommentContext = {},
): object {
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const duration = (result.durationMs / 1000).toFixed(1);
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

  if (result.success) {
    nodes.push(
      adfPara(adfText(`✅ `), adfBold('PASS')),
      adfPara(adfText(`No issues were identified during ${phaseWord}.`)),
      adfPara(adfText(`(${result.passed} test(s) passed in ${duration}s.)`)),
    );
    // Post-check clean-pass house format adds a Documentation section,
    // separated by a rule, per the standing rule confirmed 2026-09-11
    // (SC-941/SC-942) — a clean post-check reads as a fresh writeup, never
    // a callback to the pre-check bullets.
    if (phase === 'post-check') {
      nodes.push(adfRule(), adfPara(adfBold('Documentation')));
      for (const item of scopeItems) {
        nodes.push(adfPara(adfText(`${item} — confirmed present/working on live.`)));
      }
    } else if (videos.length > 0) {
      nodes.push(adfPara(adfBold('Screen recording')));
      for (const vid of videos) {
        nodes.push(adfPara(adfLink(vid.filename, vid.contentUrl)));
      }
    }
  } else {
    // Per the format reference's pre-check-defect shape: one bullet per
    // defect, stated as a factual mismatch — no separate "Issue Summary" /
    // "Failed Reason" headers duplicating the same information.
    const errItems = result.errors.length
      ? result.errors
      : ['Test failed — no error details captured'];

    nodes.push(
      adfPara(adfText(`❌ `), adfBold('FAIL')),
      adfBulletList(...errItems),
      adfPara(adfText(`(${result.failed} test(s) failed in ${duration}s during automated ${phaseWord}.)`)),
      phase === 'post-check'
        // Per the Reporting Protocol §5.4 — a post-check defect is tracked on
        // a NEW linked ticket; the original is closed, never reopened.
        ? adfPara(adfText('We will file a new ticket for the issues found.'))
        : adfPara(adfText('Action required: Please investigate the failure and re-run after fix.')),
    );
  }

  // Screenshots ideally sit directly under the bullet they evidence (per
  // the format reference) — not implemented here since nothing in this
  // automated flow maps a given screenshot to a specific checkItem/defect
  // bullet; they're grouped under one Evidence section instead.
  if (attachments.length > 0) {
    nodes.push(adfPara(adfBold('Evidence:')));
    for (const att of attachments) {
      nodes.push(adfPara(adfText(att.filename)));
      nodes.push(adfImage(att.thumbnailUrl));
    }
  }

  if (videos.length > 0 && !(result.success && phase !== 'post-check')) {
    // Already rendered as "Screen recording" above for the one case the
    // format reference names explicitly (pre-check, clean pass); every
    // other case (fail, post-check) just links the video as evidence.
    nodes.push(adfPara(adfBold('Video evidence:')));
    for (const vid of videos) {
      nodes.push(adfPara(adfLink(vid.filename, vid.contentUrl)));
    }
  }

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

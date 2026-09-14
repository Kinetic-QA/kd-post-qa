// Shared ADF comment builder — used by both the CLI agent (src/agent.ts) and
// the JIRA Checker GUI tab (gui/jira-checker.ts) so the two front doors to
// the same Jira automation always post an identical house-style comment.
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

export function buildCommentAdf(
  result: TestRunResult,
  attachments: { thumbnailUrl: string; filename: string }[],
  checkItems: string[],
  phase: CheckPhase = 'pre-check',
  videos: VideoAttachment[] = [],
): object {
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const duration = (result.durationMs / 1000).toFixed(1);
  const testLabel = result.testType.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const scopeItems = checkItems.length > 0 ? checkItems : [`${testLabel} Flow`];
  const headerLabel = phase === 'post-check' ? 'Post-Checked' : 'Pre-Checked';
  const phaseWord = phase === 'post-check' ? 'post-checking' : 'pre-checking';

  const nodes: object[] = [];

  if (result.success) {
    nodes.push(
      adfPara(adfBold(`${headerLabel} (${today})`)),
      adfPara(adfBold('Scope Checked:')),
      adfBulletList(...scopeItems),
      adfPara(adfBold('Platform and GEOs checked:')),
      adfBulletList('Desktop', 'N/A (Automated QA)'),
      adfPara(adfBold('Overall Result: ✅ PASS')),
      adfPara(adfText(
        `${result.passed} test(s) passed in ${duration}s. No issues were identified during ${phaseWord}.`
      )),
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
    }
  } else {
    const errItems = result.errors.length
      ? result.errors
      : ['Test failed — no error details captured'];

    nodes.push(
      adfPara(adfBold(`${headerLabel} (${today})`)),
      adfPara(adfBold('Scope Checked:')),
      adfBulletList(`${testLabel} Flow`),
      adfPara(adfBold('Affected GEOs and Platform:')),
      adfBulletList('Desktop', 'N/A (Automated QA)'),
      adfPara(adfBold('Overall Result: ❌ FAIL')),
      adfPara(adfBold('Scope Checked:')),
      adfBulletList(...scopeItems),
      adfPara(adfBold('Issue Summary:')),
      adfPara(adfText(
        `${testLabel} test failed during automated ${phaseWord}. `
        + `${result.failed} test(s) failed in ${duration}s.`
      )),
      adfPara(adfBold('Failed Reason:')),
      adfBulletList(...errItems),
    );
    nodes.push(
      phase === 'post-check'
        // Per the Reporting Protocol §5.4 — a post-check defect is tracked on
        // a NEW linked ticket; the original is closed, never reopened.
        ? adfPara(adfText('We will file a new ticket for the issues found.'))
        : adfPara(adfText('Action required: Please investigate the failure and re-run after fix.')),
    );
  }

  if (attachments.length > 0) {
    nodes.push(adfPara(adfBold('Evidence:')));
    for (const att of attachments) {
      nodes.push(adfPara(adfText(att.filename)));
      nodes.push(adfImage(att.thumbnailUrl));
    }
  }

  if (videos.length > 0) {
    // Jira doesn't inline-render video the way it does images — link to the
    // uploaded attachment instead of trying to embed a player.
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
export function commentPreviewText(result: TestRunResult, checkItems: string[], phase: CheckPhase = 'pre-check'): string {
  return adfDocToPreviewText(buildCommentAdf(result, [], checkItems, phase) as { content: any[] });
}

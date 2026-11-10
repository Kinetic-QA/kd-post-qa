/**
 * Unit tests for the JIRA Checker comment shape (src/jira-comment.ts and the
 * visual-check builder in gui/jira-checker.ts) against QA Lessons — Standing
 * Rules #6, #7, #8, #12 and the QA Reporting Protocols §7.
 * Run with: npx playwright test -c gui/tests/playwright.config.ts
 *
 * These are pure logic tests — no browser, no Jira API needed.
 */

import { test, expect } from '@playwright/test';
import {
  buildCommentAdf, adfDocToPreviewText, postCheckRemarks, commentDate, SCOPE_PLACEHOLDER, POST_CHECK_FAIL_SENTENCE,
} from '../../src/jira-comment';
import { findSamePassComment, todayHeaderDate } from '../jira-checker-support';
import type { JiraComment } from '../../src/jira-client';
import type { CheckedRun } from '../../src/jira-comment';
import { buildVisualCommentAdf } from '../jira-checker';
import type { VisualCompareResult } from '../visual-compare';

const IMG = (n: number) => ({ thumbnailUrl: `https://jira.example/img${n}.png`, filename: `img${n}.png` });

function run(overrides: Partial<CheckedRun> = {}): CheckedRun {
  return {
    success: true, testType: 'google analytics', testFile: 'x.spec.ts', durationMs: 1,
    passed: 2, failed: 0, skipped: 0, errors: [], screenshotPaths: [], videoPaths: [],
    ...overrides,
  };
}

const text = (doc: object) => adfDocToPreviewText(doc as { content: any[] });
const nodeTypes = (doc: object) => (doc as { content: { type: string }[] }).content.map(n => n.type);

test.describe('functional checks', () => {
  test('Scope Checked lists the ticket pages; Documentation lists the check statements', () => {
    const doc = buildCommentAdf(run(), [], ['GA tag present', 'dataLayer initialised'], 'pre-check', [], {
      geo: 'AB', scopePages: ['Homepage', 'Promotions'],
    });
    const out = text(doc);
    const [beforeDoc, afterDoc] = out.split('Documentation');
    expect(beforeDoc).toContain('  • Homepage\n  • Promotions');
    expect(beforeDoc).not.toContain('GA tag present');
    expect(afterDoc).toContain('• GA tag present');
    expect(afterDoc).toContain('• dataLayer initialised');
  });

  test('with no pages named, Scope Checked shows a placeholder, never a check statement or test label', () => {
    const out = text(buildCommentAdf(run(), [], ['GA tag present'], 'pre-check', [], { geo: 'AB' }));
    const scope = out.split('Platform and GEOs Checked')[0];
    expect(scope).toContain(SCOPE_PLACEHOLDER);
    expect(scope).not.toContain('GA tag present');
    expect(scope).not.toContain('Google Analytics Flow');
  });

  test('a screenshot sits under its bullet when there is one per bullet, otherwise after the list', () => {
    const paired = buildCommentAdf(run(), [IMG(1), IMG(2)], ['one', 'two'], 'pre-check', [], { scopePages: ['Homepage'] });
    expect(text(paired)).toContain('  • one\n      [screenshot]\n  • two\n      [screenshot]');

    const unpaired = buildCommentAdf(run(), [IMG(1)], ['one', 'two'], 'pre-check', [], { scopePages: ['Homepage'] });
    expect(text(unpaired)).toContain('  • one\n  • two\n  [screenshot]');
  });

  test('a FAIL keeps Documentation for what passed, after a divider, before Remarks', () => {
    const doc = buildCommentAdf(
      run({ success: false, passed: 1, failed: 1, errors: ['CTA does not redirect'], passedTests: ['Banner is shown'] }),
      [], ['x'], 'pre-check', [], { scopePages: ['Homepage'], remarks: ['A note.'] },
    );
    const out = text(doc);
    expect(out).toContain('❌ FAIL');
    expect(out).toContain('• CTA does not redirect');
    expect(out.indexOf('CTA does not redirect')).toBeLessThan(out.indexOf('----'));
    expect(out.indexOf('----')).toBeLessThan(out.indexOf('Documentation'));
    expect(out.indexOf('Banner is shown')).toBeLessThan(out.indexOf('Remarks'));
  });

  test('a FAIL with nothing passed has no Documentation section', () => {
    const out = text(buildCommentAdf(run({ success: false, passed: 0, failed: 1, errors: ['Broken'] }), [], [], 'pre-check', [], {}));
    expect(out).not.toContain('Documentation');
  });

  test('a post-check FAIL carries the fixed sentence', () => {
    const out = text(buildCommentAdf(run({ success: false, errors: ['Broken'] }), [], [], 'post-check', [], {}));
    expect(out).toContain(POST_CHECK_FAIL_SENTENCE);
    expect(out).toContain('Post-Checked');
  });
});

test.describe('header date', () => {
  test('the header date is written as 16 October 2026', () => {
    expect(commentDate(new Date(2026, 9, 16))).toBe('16 October 2026');
    expect(commentDate(new Date(2026, 0, 5))).toBe('5 January 2026');
    const out = text(buildCommentAdf(run(), [], [], 'post-check', [], {}));
    expect(out).toContain(`Post-Checked (${commentDate()})`);
  });

  test('a prior comment dated in the long format is recognised as today\'s pass', () => {
    const today = new Date(2026, 9, 16);
    const comment = {
      id: '1', authorAccountId: 'me', authorName: 'Me', created: '', bodyText: 'Post-Checked (16 October 2026)\nOverall Result\nPASS',
    } as unknown as JiraComment;
    expect(findSamePassComment([comment], 'me', 'post-check', todayHeaderDate(today))?.id).toBe('1');
    expect(findSamePassComment([comment], 'me', 'pre-check', todayHeaderDate(today))).toBeNull();
  });
});

test.describe('re-test comments', () => {
  const retest = { flagged: ['CTA links to Promotions', 'Terms are missing'], fixed: [true, true] };

  test('PASS: each flagged line copied whole, FIXED in bold, a short note, no extra closing sentence', () => {
    const doc = buildCommentAdf(run(), [], [], 'pre-check', [], { scopePages: ['Homepage'], retest });
    const out = text(doc);
    expect(out).toContain('• CTA links to Promotions ← ✅ FIXED\n    This was re-checked and is now considered fixed.');
    expect(out).toContain('• Terms are missing ← ✅ FIXED');
    expect(out).not.toContain('Each flagged issue was re-checked');
    expect(JSON.stringify(doc)).toContain('{"type":"text","text":"FIXED","marks":[{"type":"strong"}]}');
  });

  test('FAIL: a partial fix stays FAIL, with the fixed line under a divider', () => {
    const doc = buildCommentAdf(run({ success: false, errors: ['x'] }), [], [], 'pre-check', [], {
      scopePages: ['Homepage'], retest: { flagged: retest.flagged, fixed: [true, false] },
    });
    const out = text(doc);
    expect(out).toContain('❌ FAIL');
    expect(out).toContain('• Terms are missing — still failing');
    expect(out.indexOf('still failing')).toBeLessThan(out.indexOf('Documentation'));
    expect(out).toContain('• CTA links to Promotions ← ✅ FIXED');
  });
});

test.describe('post-check Remarks', () => {
  test('default lines are the two from Standing Rules #12, in order', () => {
    expect(postCheckRemarks('post-check', 'UK')).toEqual([
      'The platform was taken from the pre-check.',
      'The page was checked on the live UK site, logged out.',
    ]);
  });

  test('a pre-check has none', () => {
    expect(postCheckRemarks('pre-check', 'UK')).toBeUndefined();
  });
});

test.describe('visual checks', () => {
  const result = (overrides: Partial<VisualCompareResult> = {}): VisualCompareResult => ({
    status: 'matched', bestFrameIndex: 0, boundingBox: null, breakdown: [], findings: [], model: 'm', ...overrides,
  });

  test('Platform line is just the platform, with no tool wording', () => {
    const out = text(buildVisualCommentAdf('site-vs-site', result(), [], 'pre-check', { geo: 'UK', scopePages: ['Homepage'] }));
    expect(out).toContain('  • Platform: Desktop');
    expect(out).not.toContain('AI-assisted');
  });

  test('Scope Checked uses the ticket pages', () => {
    const out = text(buildVisualCommentAdf('asset-vs-site', result(), [], 'pre-check', { scopePages: ['Homepage — carousel'] }));
    expect(out.split('Platform and GEOs Checked')[0]).toContain('  • Homepage — carousel');
  });

  test('defects have no severity tag and confirmed fields read as plain sentences', () => {
    const out = text(buildVisualCommentAdf(
      'asset-vs-site',
      result({
        status: 'issue_found',
        findings: [{ severity: 'major', title: 'CTA text differs', description: 'The button says Join, not Play.', location: 'homepage banner' }],
        breakdown: [{ field: 'Headline', assetValue: 'Big Win', siteValue: 'Big Win', match: true }],
      }),
      [], 'pre-check', { scopePages: ['Homepage'] },
    ));
    expect(out).toContain('• CTA text differs — The button says Join, not Play. (homepage banner)');
    expect(out).not.toMatch(/\[(CRITICAL|MAJOR|MINOR)\]/i);
    expect(out).toContain('• Headline matches: Big Win');
    expect(out).not.toContain('✅');
  });

  test('a clean pass has the divider and Documentation', () => {
    const doc = buildVisualCommentAdf('site-vs-site', result(), [], 'post-check', { scopePages: ['Homepage'], remarks: postCheckRemarks('post-check', 'UK') });
    expect(nodeTypes(doc)).toContain('rule');
    expect(text(doc)).toContain('No issues were identified during post-checking.');
    expect(text(doc)).toContain('The platform was taken from the pre-check.');
  });
});

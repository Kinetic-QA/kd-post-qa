/**
 * JIRA QA Agent
 * ─────────────
 * Usage:
 *   npx ts-node src/agent.ts SC-913
 *   npx ts-node src/agent.ts SC-913 --dry-run
 *
 * Flow:
 *   1. Fetch ticket from JIRA
 *   2. Parse description → extract Test Type
 *   3. Resolve Test Type → matching Playwright spec file
 *   4. Transition → "In Review"
 *   5. Run the Playwright test suite
 *   6. Upload evidence screenshots as Jira attachments
 *   7. Post comment with findings
 *   8. If pass → Transition → "Approved"
 *      If fail → leave in "In Review" and report failure
 *
 * Test type detection (two modes):
 *   Option A — Keyword (no API key needed):
 *     Add "Test Type: login" to the ticket description.
 *   Option B — AI Interpreter (requires ANTHROPIC_API_KEY in .env):
 *     Write a free-form description; Claude reads it and picks the right test.
 *     Option A is always tried first; Option B is the fallback.
 *
 * Supported test types:
 *   login, registration, search, blog search, feedback form,
 *   sidebar navigation, footer navigation, game category navigation,
 *   game info modal, contact us
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { JiraClient } from './jira-client';
import { parseTestType } from './requirements-parser';
import { interpretTicket } from './ticket-interpreter';
import { resolveTestFile, runPlaywrightTest, SUPPORTED_TEST_TYPES, TestRunResult } from './test-runner';

const TRANSITION_IN_REVIEW = process.env.JIRA_TRANSITION_IN_REVIEW ?? '71';
const TRANSITION_APPROVED  = process.env.JIRA_TRANSITION_APPROVED  ?? '101';

function getErrorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'response' in e) {
    const res = (e as any).response;
    const status = res?.status ?? '?';
    const detail = res?.data?.errorMessages?.join(', ') ?? res?.data?.message ?? res?.statusText ?? '';
    return detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}`;
  }
  return e instanceof Error ? e.message : String(e);
}

// ─── ADF helpers ─────────────────────────────────────────────────────────────

function adfDoc(...content: object[]) {
  return { type: 'doc', version: 1, content };
}
function adfPara(...inlines: object[]) {
  return { type: 'paragraph', content: inlines };
}
function adfText(text: string) {
  return { type: 'text', text };
}
function adfBold(text: string) {
  return { type: 'text', text, marks: [{ type: 'strong' }] };
}
function adfBulletList(...items: string[]) {
  return {
    type: 'bulletList',
    content: items.map(i => ({
      type: 'listItem',
      content: [adfPara(adfText(i))],
    })),
  };
}
function adfImage(thumbnailUrl: string) {
  return {
    type: 'mediaSingle',
    attrs: { layout: 'center' },
    content: [{
      type: 'media',
      attrs: { type: 'external', url: thumbnailUrl },
    }],
  };
}

// ─── Comment builder ─────────────────────────────────────────────────────────

function buildCommentAdf(
  result: TestRunResult,
  attachments: { thumbnailUrl: string; filename: string }[],
): object {
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const duration = (result.durationMs / 1000).toFixed(1);
  const testLabel = result.testType.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const nodes: object[] = [];

  if (result.success) {
    nodes.push(
      adfPara(adfBold(`Pre-Checked (${today})`)),
      adfPara(adfBold('Scope Checked:')),
      adfBulletList(`${testLabel} Flow`),
      adfPara(adfBold('Platform and GEOs checked:')),
      adfBulletList('Desktop', 'N/A (Automated QA)'),
      adfPara(adfBold('Overall Result: ✅ PASS')),
      adfPara(adfText(
        `${result.passed} test(s) passed in ${duration}s. No issues were identified during pre-checking.`
      )),
    );
  } else {
    const errItems = result.errors.length
      ? result.errors
      : ['Test failed — no error details captured'];

    nodes.push(
      adfPara(adfBold(`Pre-Checked (${today})`)),
      adfPara(adfBold('Scope Checked:')),
      adfBulletList(`${testLabel} Flow`),
      adfPara(adfBold('Affected GEOs and Platform:')),
      adfBulletList('Desktop', 'N/A (Automated QA)'),
      adfPara(adfBold('Overall Result: ❌ FAIL')),
      adfPara(adfBold('Issue Summary:')),
      adfPara(adfText(
        `${testLabel} test failed during automated pre-check. `
        + `${result.failed} test(s) failed in ${duration}s.`
      )),
      adfPara(adfBold('Failed Reason:')),
      adfBulletList(...errItems),
      adfPara(adfText('Action required: Please investigate the failure and re-run after fix.')),
    );
  }

  if (attachments.length > 0) {
    nodes.push(adfPara(adfBold('Evidence:')));
    for (const att of attachments) {
      nodes.push(adfPara(adfText(att.filename)));
      nodes.push(adfImage(att.thumbnailUrl));
    }
  }

  return adfDoc(...nodes);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const issueKey = args.find(a => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');

  if (!issueKey) {
    console.error('Usage: npx ts-node src/agent.ts <JIRA-TICKET-KEY> [--dry-run]');
    console.error('Example: npx ts-node src/agent.ts SC-913');
    process.exit(1);
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  JIRA QA AGENT — ${issueKey}${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`${'═'.repeat(50)}\n`);

  const jira = new JiraClient();

  // 1. Fetch ticket
  console.log(`[1/7] Fetching ${issueKey}...`);
  let ticket;
  try {
    ticket = await jira.getTicket(issueKey);
  } catch (e) {
    console.error(`[FAIL] Could not fetch ticket: ${getErrorMessage(e)}`);
    process.exit(1);
  }
  console.log(`      Title:  ${ticket.summary}`);
  console.log(`      Status: ${ticket.status}`);

  // Guard: only process tickets in "Ready for QA"
  const status = ticket.status.toLowerCase();
  if (status === 'approved') {
    console.log('\n[SKIP] Ticket is already Approved. Nothing to do.\n');
    return;
  }
  if (status === 'in review') {
    console.log('\n[SKIP] Ticket is already In Review. Move back to Ready for QA first.\n');
    process.exit(1);
  }
  if (status !== 'ready for qa') {
    console.error(`\n[FAIL] Expected "Ready for QA" but found "${ticket.status}".`);
    process.exit(1);
  }

  // 2. Parse Test Type from description — keyword first, AI fallback second
  console.log(`\n[2/7] Parsing ticket description for Test Type...`);
  let rawTestType = parseTestType(ticket.description);

  if (!rawTestType) {
    console.log('      No "Test Type:" keyword found. Trying AI interpreter...');
    rawTestType = await interpretTicket(ticket.summary, ticket.description);
    if (rawTestType) {
      console.log(`      AI matched: "${rawTestType}"`);
    }
  }

  if (!rawTestType) {
    console.error(`[FAIL] Could not determine test type from ticket.`);
    console.error(`       Option A — add a line to the ticket description:  Test Type: login`);
    console.error(`       Option B — set ANTHROPIC_API_KEY in .env for AI interpretation`);
    console.error(`       Supported types: ${SUPPORTED_TEST_TYPES.join(', ')}`);
    process.exit(1);
  }

  const testFile = resolveTestFile(rawTestType);
  if (!testFile) {
    console.error(`[FAIL] Unknown test type: "${rawTestType}"`);
    console.error(`       Supported types: ${SUPPORTED_TEST_TYPES.join(', ')}`);
    process.exit(1);
  }

  console.log(`      Test Type: ${rawTestType}`);
  console.log(`      Test File: ${testFile}`);

  if (dryRun) {
    console.log('\n[3/7] [DRY RUN] Would transition to In Review');
    console.log(`\n[4/7] [DRY RUN] Would run: npx playwright test ${testFile}`);
    console.log('\n[5/7] [DRY RUN] Would upload evidence screenshots');
    console.log('\n[6/7] [DRY RUN] Would post comment with findings');
    console.log('\n[7/7] [DRY RUN] Would transition to Approved (if test passed)');
    console.log('\n[AGENT] Dry run complete — no changes made.\n');
    return;
  }

  // 3. Transition → In Review
  console.log(`\n[3/7] Transitioning to In Review...`);
  try {
    await jira.transitionTicket(issueKey, TRANSITION_IN_REVIEW);
    console.log('      Done.');
  } catch (e) {
    console.error(`[FAIL] Transition to In Review failed: ${getErrorMessage(e)}`);
    process.exit(1);
  }

  // 4. Run Playwright test
  console.log(`\n[4/7] Running Playwright test: ${testFile}`);
  let testResult: TestRunResult;
  try {
    testResult = runPlaywrightTest(rawTestType, testFile);
  } catch (e) {
    console.error(`[FAIL] Test runner threw unexpectedly: ${getErrorMessage(e)}`);
    process.exit(1);
  }

  const resultIcon = testResult.success ? '✅ PASS' : '❌ FAIL';
  console.log(`      Result:  ${resultIcon} (${(testResult.durationMs / 1000).toFixed(1)}s)`);
  console.log(`      Passed:  ${testResult.passed}`);
  console.log(`      Failed:  ${testResult.failed}`);
  if (testResult.skipped > 0) console.log(`      Skipped: ${testResult.skipped}`);
  if (testResult.errors.length > 0) {
    console.log(`      Errors:`);
    testResult.errors.forEach(err => console.log(`        • ${err.substring(0, 120)}`));
  }

  // 5. Upload evidence screenshots
  const attachments: { thumbnailUrl: string; filename: string }[] = [];
  if (testResult.screenshotPaths.length > 0) {
    console.log(`\n[5/7] Uploading ${testResult.screenshotPaths.length} screenshot(s)...`);
    for (const screenshotPath of testResult.screenshotPaths) {
      try {
        const att = await jira.uploadAttachment(issueKey, screenshotPath);
        attachments.push({ thumbnailUrl: att.contentUrl, filename: att.filename });
        console.log(`      Uploaded: ${att.filename}`);
      } catch (e) {
        console.warn(`      [WARN] Could not upload screenshot ${screenshotPath}: ${getErrorMessage(e)}`);
      }
    }
  } else {
    console.log(`\n[5/7] No screenshots to upload.`);
  }

  // 6. Post comment with findings
  console.log(`\n[6/7] Posting findings comment...`);
  const commentAdf = buildCommentAdf(testResult, attachments);
  try {
    await jira.addCommentAdf(issueKey, commentAdf);
    console.log('      Done.');
  } catch (e) {
    console.error(`[FAIL] Comment failed: ${getErrorMessage(e)}`);
    console.error(`       Ticket is in "In Review" but comment was NOT posted.`);
    process.exit(1);
  }

  // 7. Approve or leave in review
  if (testResult.success) {
    console.log(`\n[7/7] Transitioning to Approved...`);
    try {
      await jira.transitionTicket(issueKey, TRANSITION_APPROVED);
      console.log('      Done.');
    } catch (e) {
      console.error(`[FAIL] Transition to Approved failed: ${getErrorMessage(e)}`);
      console.error(`       Ticket is in "In Review" with comment posted, but was NOT approved.`);
      process.exit(1);
    }
    console.log(`\n[AGENT] ${issueKey} → All steps complete. ✅\n`);
  } else {
    console.log(`\n[7/7] Test FAILED — leaving ticket in "In Review" for manual review.`);
    console.log(`\n[AGENT] ${issueKey} → Test failed. Ticket left in "In Review". ❌\n`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('[AGENT] Unexpected error:', getErrorMessage(e));
  process.exit(1);
});

/**
 * JIRA QA Agent
 * ─────────────
 * Usage:
 *   npx ts-node src/agent.ts SC-913
 *   npx ts-node src/agent.ts SC-913 --dry-run
 *   npx ts-node src/agent.ts SC-913 --url https://www.slingo.com
 *
 * Flow:
 *   1. Fetch ticket from JIRA
 *   2. Parse description → extract URL, username, password
 *   3. Transition → "In Review"
 *   4. Run Playwright login test against qa.slingo.com
 *   5. Post comment with findings
 *   6. If pass → Transition → "Approved"
 *      If fail → leave in "In Review" and report failure
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { JiraClient } from './jira-client';
import { parseCredentials } from './requirements-parser';
import { runLoginTest, BrowserTestResult, StepResult } from './browser-runner';

const TRANSITION_IN_REVIEW = process.env.JIRA_TRANSITION_IN_REVIEW ?? '71';
const TRANSITION_APPROVED  = process.env.JIRA_TRANSITION_APPROVED  ?? '101';
const QA_BASE_URL          = process.env.QA_BASE_URL ?? 'https://qa.slingo.com';

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

// ─── Comment builder (returns ADF) ───────────────────────────────────────────

function buildCommentAdf(
  result: BrowserTestResult,
  targetUrl: string,
  attachments: { loggedIn?: { thumbnailUrl: string; filename: string }; loggedOut?: { thumbnailUrl: string; filename: string } },
): object {
  const icon = (s: StepResult) => s.status === 'pass' ? '✅' : s.status === 'fail' ? '❌' : '⏭️';
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const duration = (result.durationMs / 1000).toFixed(1);

  const stepItems = result.steps.map(s => `${icon(s)} ${s.step}${s.detail ? ` — ${s.detail}` : ''}`);

  const nodes: object[] = [];

  if (result.success) {
    nodes.push(
      adfPara(adfBold(`Pre-Checked (${today})`)),
      adfPara(adfBold('Scope Checked:')),
      adfBulletList('Login Flow', 'Logout Flow'),
      adfPara(adfBold('URL: '), adfText(targetUrl)),
      adfPara(adfBold('Platform and GEOs checked:')),
      adfBulletList('Desktop', 'N/A (Automated QA)'),
      adfPara(adfBold('Overall Result: ✅ PASS')),
      adfPara(adfText('No issues were identified during pre-checking. Login and logout completed successfully.')),
      adfPara(adfBold(`Steps Executed (${duration}s):`)),
      adfBulletList(...stepItems),
    );
  } else {
    const failedItems = result.steps
      .filter(s => s.status === 'fail')
      .map(s => `${s.step}${s.detail ? `: ${s.detail}` : ''}`);

    nodes.push(
      adfPara(adfBold(`Pre-Checked (${today})`)),
      adfPara(adfBold('Scope Checked:')),
      adfBulletList('Login Flow', 'Logout Flow'),
      adfPara(adfBold('URL: '), adfText(targetUrl)),
      adfPara(adfBold('Affected GEOs and Platform:')),
      adfBulletList('Desktop', 'N/A (Automated QA)'),
      adfPara(adfBold('Overall Result: ❌ FAIL')),
      adfPara(adfBold('Issue Summary:')),
      adfPara(adfText('Login flow test failed during automated pre-check.')),
      adfPara(adfBold('Failed Step(s):')),
      adfBulletList(...(failedItems.length ? failedItems : [result.error ?? 'Unknown error'])),
      adfPara(adfBold(`All Steps Executed (${duration}s):`)),
      adfBulletList(...stepItems),
      adfPara(adfText('Action required: Please investigate the failure and re-run after fix.')),
    );
  }

  // Embed screenshots inline as images — logged out first (starting state), then logged in (proof)
  if (attachments.loggedIn || attachments.loggedOut) {
    nodes.push(adfPara(adfBold('Evidence:')));
    if (attachments.loggedOut) {
      nodes.push(adfPara(adfText(`Logged Out (before) — ${attachments.loggedOut.filename}`)));
      nodes.push(adfImage(attachments.loggedOut.thumbnailUrl));
    }
    if (attachments.loggedIn) {
      nodes.push(adfPara(adfText(`Logged In (after) — ${attachments.loggedIn.filename}`)));
      nodes.push(adfImage(attachments.loggedIn.thumbnailUrl));
    }
  }

  return adfDoc(...nodes);
}

async function main() {
  const args = process.argv.slice(2);
  const issueKey = args.find(a => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const urlFlagIdx = args.findIndex(a => a === '--url');
  const urlOverride = urlFlagIdx !== -1 ? args[urlFlagIdx + 1] : undefined;

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
  console.log(`[1/6] Fetching ${issueKey}...`);
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

  // 2. Parse credentials from description
  console.log(`\n[2/6] Parsing ticket description for credentials...`);
  const creds = parseCredentials(ticket.description);
  const targetUrl = urlOverride ?? creds.targetUrl ?? QA_BASE_URL;
  if (urlOverride) console.log(`      URL overridden via --url flag`);
  const username  = creds.username;
  const password  = creds.password;

  if (!username || !password) {
    console.error(`[FAIL] Could not extract credentials from ticket description.`);
    console.error(`       Description must contain lines like:`);
    console.error(`         Username: user@example.com`);
    console.error(`         Password: yourpassword`);
    process.exit(1);
  }
  console.log(`      URL:      ${targetUrl}`);
  console.log(`      Username: ${username}`);
  console.log(`      Password: ${'*'.repeat(password.length)}`);

  if (dryRun) {
    console.log('\n[3/6] [DRY RUN] Would transition to In Review');
    console.log(`\n[4/6] [DRY RUN] Would run Playwright login test`);
    console.log(`      Target: ${targetUrl}`);
    console.log(`      User:   ${username}`);
    console.log('\n[5/6] [DRY RUN] Would post comment with findings');
    console.log('\n[6/6] [DRY RUN] Would transition to Approved (if test passed)');
    console.log('\n[AGENT] Dry run complete — no changes made.\n');
    return;
  }

  // 3. Transition → In Review
  console.log(`\n[3/6] Transitioning to In Review...`);
  try {
    await jira.transitionTicket(issueKey, TRANSITION_IN_REVIEW);
    console.log('      Done.');
  } catch (e) {
    console.error(`[FAIL] Transition to In Review failed: ${getErrorMessage(e)}`);
    process.exit(1);
  }

  // 4. Run browser test
  console.log(`\n[4/6] Running Playwright login test...`);
  console.log(`      Opening ${targetUrl} in browser...`);
  let testResult: BrowserTestResult;
  try {
    testResult = await runLoginTest(targetUrl, username, password);
  } catch (e) {
    console.error(`[FAIL] Browser test threw unexpectedly: ${getErrorMessage(e)}`);
    process.exit(1);
  }

  const resultIcon = testResult.success ? '✅ PASS' : '❌ FAIL';
  console.log(`      Result: ${resultIcon} (${(testResult.durationMs / 1000).toFixed(1)}s)`);
  testResult.steps.forEach(s => {
    const icon = s.status === 'pass' ? '✅' : s.status === 'fail' ? '❌' : '⏭️';
    console.log(`        ${icon} ${s.step}${s.detail ? `: ${s.detail}` : ''}`);
  });
  if (testResult.error) {
    console.log(`      Error: ${testResult.error}`);
  }
  if (testResult.screenshotPath) {
    console.log(`      Screenshot: ${testResult.screenshotPath}`);
  }

  // 4b. Upload evidence screenshots as Jira attachments
  const attachmentMeta: {
    loggedIn?: { thumbnailUrl: string; filename: string };
    loggedOut?: { thumbnailUrl: string; filename: string };
  } = {};
  if (testResult.screenshotLoggedIn || testResult.screenshotLoggedOut) {
    console.log(`\n[4b] Uploading evidence screenshots...`);
    for (const [key, filePath] of [
      ['loggedIn', testResult.screenshotLoggedIn],
      ['loggedOut', testResult.screenshotLoggedOut],
    ] as const) {
      if (!filePath) continue;
      try {
        const att = await jira.uploadAttachment(issueKey, filePath);
        attachmentMeta[key] = { thumbnailUrl: att.contentUrl, filename: att.filename };
        console.log(`      ${key}: ${att.filename} → ${att.thumbnailUrl}`);
      } catch (e) {
        console.warn(`      [WARN] Could not upload ${key} screenshot: ${getErrorMessage(e)}`);
      }
    }
  }

  // 5. Post comment with findings
  console.log(`\n[5/6] Posting findings comment...`);
  const commentAdf = buildCommentAdf(testResult, targetUrl, attachmentMeta);
  try {
    await jira.addCommentAdf(issueKey, commentAdf);
    console.log('      Done.');
  } catch (e) {
    console.error(`[FAIL] Comment failed: ${getErrorMessage(e)}`);
    console.error(`       Ticket is in "In Review" but comment was NOT posted.`);
    process.exit(1);
  }

  // 6. Approve if test passed
  if (testResult.success) {
    console.log(`\n[6/6] Transitioning to Approved...`);
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
    console.log(`\n[6/6] Test FAILED — leaving ticket in "In Review" for manual review.`);
    console.log(`\n[AGENT] ${issueKey} → Test failed. Ticket left in "In Review". ❌\n`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('[AGENT] Unexpected error:', getErrorMessage(e));
  process.exit(1);
});

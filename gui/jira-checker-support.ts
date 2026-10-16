// JIRA Checker support — read-only analysis the Checker runs before a pass:
// what prior QA comments say, whether the ticket is ready (Protocol §2.2), and
// whether this pass is a re-test (Standing Rules #8, Protocol §5.5/§5.6).
// Pure functions, no Jira calls — jira-checker.ts fetches, this interprets.
import type { JiraComment } from '../src/jira-client';
import type { CheckPhase } from '../src/jira-comment';

// ── Prior QA comments ────────────────────────────────────────────────────────

export interface PriorQaComment {
  id: string;
  created: string;
  authorName: string;
  header: string;            // e.g. "Pre-Checked (16/10/2026)"
  phase: CheckPhase;
  verdict: 'pass' | 'fail' | 'unknown';
  flaggedIssues: string[];   // the defect bullets under a FAIL Overall Result
  text: string;
}

const QA_HEADER = /^(Pre|Post)-Checked\s*\(([^)]*)\)/i;

// Section lines that end the defect bullets under "Overall Result".
const SECTION_END = /^(Documentation|Remarks|Screen recording)\b/i;

export function parseQaComment(c: JiraComment): PriorQaComment | null {
  const lines = c.bodyText.split('\n').map(l => l.trim());
  const first = lines.find(l => l.length > 0) ?? '';
  const m = first.match(QA_HEADER);
  if (!m) return null;

  const resultIdx = lines.findIndex(l => /^Overall Result\b/i.test(l));
  let verdict: PriorQaComment['verdict'] = 'unknown';
  const flaggedIssues: string[] = [];
  if (resultIdx >= 0) {
    const after = lines.slice(resultIdx + 1);
    const verdictLine = after.find(l => l.length > 0) ?? '';
    if (/FAIL/i.test(verdictLine)) verdict = 'fail';
    else if (/PASS/i.test(verdictLine)) verdict = 'pass';
    if (verdict === 'fail') {
      for (const l of after) {
        if (SECTION_END.test(l)) break;
        if (l.startsWith('- ')) {
          // A FIXED tag only appears in a Documentation list; defensive strip.
          flaggedIssues.push(l.slice(2).replace(/\s*←\s*✅\s*FIXED\s*$/i, '').trim());
        }
      }
    }
  }

  return {
    id: c.id,
    created: c.created,
    authorName: c.authorName,
    header: first,
    phase: m[1].toLowerCase() === 'post' ? 'post-check' : 'pre-check',
    verdict,
    flaggedIssues: flaggedIssues.filter(Boolean),
    text: c.bodyText,
  };
}

export function parseQaComments(comments: JiraComment[]): PriorQaComment[] {
  return comments.map(parseQaComment).filter((c): c is PriorQaComment => c !== null);
}

// DD/MM/YYYY, the date format the comment headers use.
export function todayHeaderDate(now = new Date()): string {
  return now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// One QA comment per pass: an existing comment from this account, for this
// phase, dated today, is the one to revise in place rather than duplicate.
export function findSamePassComment(
  comments: JiraComment[],
  myAccountId: string,
  phase: CheckPhase,
  today = todayHeaderDate(),
): PriorQaComment | null {
  for (const c of [...comments].reverse()) {
    if (c.authorAccountId !== myAccountId) continue;
    const q = parseQaComment(c);
    if (q && q.phase === phase && q.header.includes(`(${today})`)) return q;
  }
  return null;
}

// ── Re-test detection ────────────────────────────────────────────────────────

export interface RetestInfo {
  variant: 'pre-check re-test' | 'live re-test';
  priorCommentId: string;
  priorHeader: string;
  flaggedIssues: string[];
}

// A re-test is a pass whose job is to check the issues an earlier QA comment
// flagged. Pre-check re-test: ticket back in Ready For QA after a pre-check
// FAIL. Live re-test: ticket in Production QA after a pre-check FAIL went
// live. A ticket whose latest QA comment is a post-check is a bug raised from
// a post-check — no re-test is run on those (Standing Rules #8).
export function detectRetest(status: string, phase: CheckPhase, qaComments: PriorQaComment[]): RetestInfo | null {
  const latest = qaComments[qaComments.length - 1];
  if (!latest || latest.phase !== 'pre-check' || latest.verdict !== 'fail' || latest.flaggedIssues.length === 0) {
    return null;
  }
  const s = status.toLowerCase();
  if (phase === 'pre-check' && s === 'ready for qa') {
    return { variant: 'pre-check re-test', priorCommentId: latest.id, priorHeader: latest.header, flaggedIssues: latest.flaggedIssues };
  }
  if (phase === 'post-check' && s === 'production qa') {
    return { variant: 'live re-test', priorCommentId: latest.id, priorHeader: latest.header, flaggedIssues: latest.flaggedIssues };
  }
  return null;
}

// ── Readiness checklist (Protocol §2.2) ──────────────────────────────────────

export type ReadinessLevel = 'ok' | 'warn' | 'fail';

export interface ReadinessItem {
  label: string;
  level: ReadinessLevel;
  detail: string;
}

export interface ReadinessInput {
  description: string;
  attachmentCount: number;
  phase: CheckPhase;
  status: string;
  brand: string | null;
  geo: string | undefined;
  envUrl: string | null; // QA URL for pre-check, live URL for post-check
}

const TO_FOLLOW = /\b(to follow|tbc|tbd|to be confirmed|to be advised)\b/i;
const HAS_LINK = /https?:\/\//i;

// Only what can be read straight off the ticket — the judgement calls in the
// Protocol's checklist (requirements match references, no ambiguity) stay with
// the QA engineer; the checklist surfaces what is checkable and leaves the
// "To Follow" decision (pause vs on hold) to a human.
export function buildReadiness(i: ReadinessInput): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  const desc = i.description.trim();

  items.push(desc.length >= 20
    ? { label: 'Jira description exists', level: 'ok', detail: 'A description is present.' }
    : { label: 'Jira description exists', level: 'fail', detail: 'The description is empty or too short to tell what is being implemented.' });

  const toFollow = desc.match(TO_FOLLOW);
  items.push(toFollow
    ? { label: 'No unresolved "To Follow" items', level: 'warn', detail: `The description mentions "${toFollow[0]}" — confirm nothing is still pending before testing (Protocol §2.2: pause or on hold).` }
    : { label: 'No unresolved "To Follow" items', level: 'ok', detail: 'No "To Follow"/TBC/TBD wording found in the description.' });

  items.push(i.brand
    ? { label: 'Brand identified', level: 'ok', detail: i.brand }
    : { label: 'Brand identified', level: 'fail', detail: 'The ticket\'s Jira project does not map to a known brand.' });

  items.push(i.geo
    ? { label: 'GEO identified', level: 'ok', detail: i.geo }
    : { label: 'GEO identified', level: 'fail', detail: 'No GEO could be determined from the ticket.' });

  const envWord = i.phase === 'post-check' ? 'Live' : 'QA';
  items.push(i.envUrl
    ? { label: `${envWord} URL available`, level: 'ok', detail: i.envUrl }
    : { label: `${envWord} URL available`, level: 'fail', detail: `No ${envWord.toLowerCase()} URL is configured for this brand/GEO.` });

  const hasRef = i.attachmentCount > 0 || HAS_LINK.test(desc);
  items.push(hasRef
    ? { label: 'Reference available', level: 'ok', detail: i.attachmentCount > 0 ? `${i.attachmentCount} attachment(s) on the ticket.` : 'A link is present in the description.' }
    : { label: 'Reference available', level: 'warn', detail: 'No attachment or link found — confirm the ticket needs no design, asset or document.' });

  const expectedStatus = i.phase === 'post-check' ? 'Production QA / Approved' : 'Ready For QA';
  items.push({ label: 'Status matches the check', level: 'ok', detail: `"${i.status}" — ${expectedStatus} expected for a ${i.phase}.` });

  return items;
}

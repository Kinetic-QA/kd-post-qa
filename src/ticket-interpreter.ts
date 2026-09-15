import Anthropic from '@anthropic-ai/sdk';
import { SUPPORTED_TEST_TYPES } from './test-runner';
import { getConfluencePageText, getConfluencePageChildren } from './confluence-client';

const MODEL = 'claude-sonnet-4-6';

// "QA Lessons — Standing Rules" in Confluence space QKB — Reyn's JIRA QA
// Helper knowledge base. Fetched live (cached 10 min) on every interpret
// call so a rule Reyn adds/changes on Confluence takes effect here without
// a redeploy — this is the actual point of consolidating onto one KB
// instead of each person's tool carrying its own frozen copy of the rules.
const STANDING_RULES_PAGE_ID = '282001429';

// "KD QA Test Case & Jira Workflow (Skill)" — describes the house test-case
// / Jira-comment workflow Reyn's separate Claude Skill follows. Always
// pulled in full since it's the workflow reference for how tickets should
// be interpreted, not situational context.
const KD_QA_WORKFLOW_SKILL_PAGE_ID = '281968663';

// "Test Case Standard (ISTQB CTFL v4.0 / IEEE 829)" — the real house
// standard Reyn authored 2026-09-15 (page id resolved live from the tiny
// link he shared: /wiki/x/BIDeE -> 283017220). Defines required fields, the
// TC-<ticket number>-<NNN> ID format, edge-case screening categories, and
// statuses. Always fetched live and appended to the prompt rather than
// transcribed into code, so an edit to the standard takes effect here
// without a redeploy — same reasoning as Standing Rules.
const TEST_CASE_STANDARD_PAGE_ID = '283017220';

// "Verification Techniques (reconstructed)" — also authored/rebuilt by Reyn
// 2026-09-15 (explicitly a partial reconstruction, not the lost original).
// Governs how a check should actually be performed (rendered text vs DOM
// text, real viewport measurement vs a device label, proving a mechanism
// rather than logging a symptom, etc.) — directly relevant to how "steps"
// and "expected" results should be worded so a drafted test case is
// genuinely verifiable, not just plausible-sounding. Always included for
// the same live-fetch reason as the other two standards above.
const VERIFICATION_TECHNIQUES_PAGE_ID = '283115527';

// Root of Reyn's "JIRA QA Helper — Knowledge Base" (Confluence space QKB).
// On every interpret call, its direct child pages are listed live (title
// only, cheap) and any whose title shares a keyword with the ticket text
// get their full content pulled in too — so a new/renamed KB page shows up
// automatically without touching this file, and irrelevant pages (e.g. a
// different brand's project doc set) aren't wasted context on every ticket.
const JIRA_QA_HELPER_ROOT_PAGE_ID = '281968642';
const ALWAYS_INCLUDED_PAGE_IDS = new Set([
  STANDING_RULES_PAGE_ID, KD_QA_WORKFLOW_SKILL_PAGE_ID, TEST_CASE_STANDARD_PAGE_ID, VERIFICATION_TECHNIQUES_PAGE_ID,
]);
const TITLE_STOPWORDS = new Set([
  'page', 'pages', 'jira', 'confluence', 'documents', 'document', 'summary',
  'skill', 'workflow', 'knowledge', 'base', 'project', 'sheet', 'export',
  'complete', 'agent', 'instructions', 'guidelines', 'protocols', 'reporting',
]);
const MAX_EXTRA_KB_PAGES = 3;

function titleKeywords(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 4 && !TITLE_STOPWORDS.has(w));
}

/**
 * Beyond the two always-included pages above, finds other KB pages under
 * the JIRA QA Helper root whose title keywords appear in this ticket's own
 * text (e.g. a "GC Safer Play" project doc only gets pulled in for a ticket
 * that actually mentions GC / Safer Play / GSP), and returns their content
 * labeled by title. Fails soft — an empty Confluence response just means no
 * extra context, never an error.
 */
async function getRelevantExtraKbSections(ticketText: string): Promise<{ title: string; text: string }[]> {
  const lowerTicket = ticketText.toLowerCase();
  const children = await getConfluencePageChildren(JIRA_QA_HELPER_ROOT_PAGE_ID);
  const relevant = children.filter(c => {
    if (ALWAYS_INCLUDED_PAGE_IDS.has(c.id)) return false;
    const keywords = titleKeywords(c.title);
    return keywords.length > 0 && keywords.some(kw => lowerTicket.includes(kw));
  });

  const picked = relevant.slice(0, MAX_EXTRA_KB_PAGES);
  const texts = await Promise.all(picked.map(page => getConfluencePageText(page.id)));
  return picked
    .map((page, i) => ({ title: page.title, text: texts[i] }))
    .filter((s): s is { title: string; text: string } => !!s.text);
}

// Which kind of AI-vision check (if any) actually fits this ticket —
// situational, not a single fixed fallback. Confirmed live both ways can be
// wrong for the wrong ticket: LP1-445 ("Contact Us Page Not Matched QA vs
// Prod") needs 'site-vs-site' (a content/translation mismatch); SC-963
// ("App Install Toaster — change the image") needs 'asset-vs-site' (a new
// image attached to the ticket, to be checked against the live page) — a
// generic "compare QA to Production" would be the wrong tool for SC-963,
// which isn't a QA-vs-Prod mismatch at all, it's a brand-new asset rollout.
export type VisualCheckKind = 'asset-vs-site' | 'site-vs-site' | 'none';

export interface TestCaseStep {
  step: string;
  expected: string;
}

// Shaped after the house "Test Case Standard (ISTQB CTFL v4.0 / IEEE 829)"
// required-fields table (Confluence page 283017220) — everything that's
// knowable before execution. The on-execution fields the standard also
// defines (actualResult, status, evidence) aren't part of a draft, since
// they don't exist until a human or the Check/Compare flow actually runs
// this case.
//
// Drafted for EVERY ticket regardless of whether an automated Playwright
// spec or AI-vision check can actually run against it — a ticket can be
// automatable via Playwright AND still get cases here (the drafted steps
// are what the automated spec is effectively checking, made human-readable
// per the standard's "keep ISTQB terminology out of anything team-visible"
// rule), or have no automated path at all (unknown brand, unmapped spec,
// etc.) and still get a usable test case a human can execute today.
export interface DraftedTestCase {
  testCaseId: string;          // TC-<ticket number>-<NNN>, sequential within the ticket
  title: string;
  requirementReference: string; // the acceptance criterion / ticket text this case traces to
  brandGeo: string;
  platform: string;             // "Desktop", "Mobile", or "Desktop & Mobile"
  environment: string;          // "QA" or "Production"
  preconditions: string[];
  testData: string[];           // exact values (accounts, codes, URLs) — empty if none apply
  steps: TestCaseStep[];
  notes: string;                // caveats, or "" if none
  automatable: boolean;
}

export interface InterpretedTicket {
  testType: string | null;          // one of SUPPORTED_TEST_TYPES, or null if no automated spec fits
  checkItems: string[];             // 2–5 plain-English verification statements
  confidence: 'high' | 'low';      // high = clear match, low = best guess
  params: Record<string, string>;  // tag ID, GEO, and any other runtime values
  // Independent of testType — a ticket can match a page-name test type
  // (e.g. "contact us") purely by naming the page while actually needing an
  // AI-vision check instead (a structural Playwright spec checks links and
  // buttons, not translated copy or a newly attached image asset).
  visualCheckKind: VisualCheckKind;
  // Always produced, per the house standard's "one behaviour per case" rule
  // — a ticket touching more than one distinct behaviour gets more than one
  // case rather than one case with a list. See DraftedTestCase comment.
  testCases: DraftedTestCase[];
}

export async function interpretTicket(
  summary: string,
  description: string,
  hasImageAttachment = false,
  ticketKey = '',
): Promise<InterpretedTicket | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('      [WARN] ANTHROPIC_API_KEY not set — AI interpreter skipped.');
    return null;
  }

  const client = new Anthropic({ apiKey });

  const supportedList = SUPPORTED_TEST_TYPES.map(t => `"${t}"`).join(', ');
  // Independent fetches — parallelized so a cold cache (first ticket after
  // a restart, or every 10 min once the cache expires) doesn't stack up
  // several sequential Confluence round-trips before the ticket even loads.
  const [standingRules, workflowSkill, testCaseStandard, verificationTechniques, extraKbSections] = await Promise.all([
    getConfluencePageText(STANDING_RULES_PAGE_ID),
    getConfluencePageText(KD_QA_WORKFLOW_SKILL_PAGE_ID),
    getConfluencePageText(TEST_CASE_STANDARD_PAGE_ID),
    getConfluencePageText(VERIFICATION_TECHNIQUES_PAGE_ID),
    getRelevantExtraKbSections(`${summary}\n${description}`),
  ]);
  const ticketNumber = ticketKey.match(/-(\d+)$/)?.[1] ?? '000';

  const systemPrompt = `You are a QA analyst for an automated Playwright test suite covering gaming/casino websites.

Your job is to read a Jira ticket and return a single JSON object with these fields:

- "testType": the best matching test type from the supported list, or "none" if nothing fits
- "checkItems": array of 2–5 short plain-English strings describing exactly what will be verified
- "confidence": "high" if the match is clear, "low" if it is a best guess
- "params": object of key-value pairs extracted from the ticket needed at runtime
- "visualCheckKind": one of "asset-vs-site", "site-vs-site", or "none" — set this independently of "testType" (a ticket can BOTH name a page that matches a testType AND still need a visual/AI check instead, because a structural spec checking links/buttons won't catch either of these):
  - "asset-vs-site": the ticket is about a NEW or CHANGED visual asset — an image, banner, logo, promo graphic — being added/swapped on a page (e.g. "change the image", "replace banner", "new promo asset").${hasImageAttachment ? ' This ticket HAS an image attachment — that is strong evidence for "asset-vs-site" if the ticket describes a visual/asset change.' : ' This ticket has no image attachment, so "asset-vs-site" is unlikely unless a design reference (e.g. Figma) is clearly described as the source of truth.'}
  - "site-vs-site": the ticket is about QA content/copy/translation/layout not matching Production/live (e.g. "not matched QA vs Prod", "content not translated", "text is stale/wrong on QA").
  - "none": neither applies — an ordinary functional/behavioral ticket.
  Do not default to "site-vs-site" just because no functional testType fits — check whether "asset-vs-site" or "none" describes the ticket better first.
- "testCases": array of 1–4 test case objects, drafted for EVERY ticket regardless of whether "testType" or "visualCheckKind" matched anything — this is the actual point of the tool: a QA engineer must always get something they can execute, even for a ticket with no automated coverage or an unresolved brand/GEO. Follow the house Test Case Standard appended below for what each field means and how to screen edge cases — one behaviour per case; split into more than one object rather than listing multiple behaviours in one. Shape per case:
  {"testCaseId": string, "title": string, "requirementReference": string, "brandGeo": string, "platform": string, "environment": string, "preconditions": [string, ...], "testData": [string, ...], "steps": [{"step": string, "expected": string}, ...], "notes": string, "automatable": boolean}
  - "testCaseId": "TC-${ticketNumber}-NNN" — three digits, sequential starting at 001 within this ticket (e.g. "TC-${ticketNumber}-001", "TC-${ticketNumber}-002")
  - "title": one line naming the behaviour under test — not "Check homepage"
  - "requirementReference": the specific line/section of the ticket this case verifies
  - "brandGeo": brand + GEO this case applies to, or "Unknown — see ticket" if genuinely unresolved
  - "platform": "Desktop", "Mobile", or "Desktop & Mobile"
  - "environment": "QA" (pre-check) or "Production" (post-check) — infer from ticket status/context if stated, otherwise "QA"
  - "preconditions": required state before step 1 (logged in/out, GEO active, content published, etc.)
  - "testData": exact values needed (accounts, codes, URLs) — empty array if none apply
  - "steps": numbered, one action each, concrete enough for someone who has never seen the ticket to follow, paired with an observable expected result
  - "notes": environment caveats or "" if none
  - "automatable": true only if "testType" is a real match from the supported list above (a Playwright spec already exists) OR "visualCheckKind" is not "none" (an AI-vision check can run) — false whenever both are unmatched, meaning this case needs a fully manual run right now

Supported test types: ${supportedList}

Rules for "params" by test type:
- "google analytics": extract "TAG_ID" (Measurement ID, format G-XXXXXXX), "GEO" (market code, e.g. "AB", "UK", "COM")
- "meta pixel": extract "TAG_ID" (numeric Pixel ID) and "GEO"
- "tiktok pixel": extract "TAG_ID" (alphanumeric Pixel ID) and "GEO"
- "google tag manager": extract "TAG_ID" (container ID, format GTM-XXXXXXX) and "GEO"
- All other test types: extract "GEO" if it's identifiable; omit it if it isn't

Rules for "params" values:
- Only extract values explicitly stated in the ticket — never guess or invent
- "GEO" may appear in the ticket title as [BRAND GEO] (e.g. "[SNG AB]" → GEO=AB), or as an explicit field/table row elsewhere in the description (e.g. "GEO / market: UK", "Market: ES") — check both places
- "TAG_ID" must be the exact ID string as written in the ticket
- Do not extract "BRAND" — the caller already knows the brand authoritatively from the ticket's Jira project, so never guess it here

Rules for "checkItems":
- Be specific to what this ticket introduced or changed
- Write each as a verification statement (e.g. "GA tag G-XXXXXXX is present on the homepage")
- Do not write generic items like "page loads correctly"

Respond with ONLY valid JSON. No explanation, no markdown fences, no extra text.

Example for a GA ticket with title "[SNG AB] Google Analytics tag" (ticket SNG-123):
{"testType":"google analytics","checkItems":["GA tag G-ABC123 present on all pages","window.dataLayer initialized on all pages","gtag function defined and callable"],"confidence":"high","params":{"TAG_ID":"G-ABC123","GEO":"AB"},"visualCheckKind":"none","testCases":[{"testCaseId":"TC-123-001","title":"GA4 tag G-ABC123 fires on page load","requirementReference":"Ticket description: add GA4 tag G-ABC123 site-wide","brandGeo":"Slingo AB","platform":"Desktop & Mobile","environment":"QA","preconditions":["QA environment loaded","Browser dev tools / network tab available"],"testData":["Measurement ID: G-ABC123"],"steps":[{"step":"Open the homepage on QA and open browser dev tools","expected":"Page loads without console errors"},{"step":"Inspect window.dataLayer in the console","expected":"dataLayer is initialized and present"},{"step":"Check network requests for a call to Google Analytics with measurement ID G-ABC123","expected":"Request fires with the correct measurement ID"},{"step":"Navigate to at least one other page","expected":"A new pageview event fires with the same measurement ID"}],"notes":"","automatable":true}]}`
    + (standingRules
        ? `\n\n---\nCurrent QA Standing Rules (live from the team's Confluence knowledge base — these are practical lessons confirmed in production and take priority over general judgement; use them when writing "checkItems" and judging "confidence"):\n${standingRules}`
        : '')
    + (workflowSkill
        ? `\n\n---\nKD QA Test Case & Jira Workflow (live from the team's Confluence knowledge base — the house workflow/format for interpreting tickets and writing test cases; follow it when it's more specific than the general instructions above):\n${workflowSkill}`
        : '')
    + (testCaseStandard
        ? `\n\n---\nTest Case Standard (ISTQB CTFL v4.0 / IEEE 829) — the house standard for "testCases" (live from the team's Confluence knowledge base; this is the authoritative source for required fields, ID format, edge-case screening, and statuses — follow it exactly):\n${testCaseStandard}`
        : '')
    + (verificationTechniques
        ? `\n\n---\nVerification Techniques (live from the team's Confluence knowledge base — how a check should actually be performed; use this to write "steps" and "expected" results that are genuinely verifiable, not just plausible-sounding):\n${verificationTechniques}`
        : '')
    + extraKbSections.map(s =>
        `\n\n---\n${s.title} (live from the team's Confluence knowledge base — pulled in because it looked relevant to this specific ticket):\n${s.text}`
      ).join('');

  let raw: string;
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Ticket title: ${summary}\n\nDescription:\n${description}`,
      }],
    });

    raw = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')
      .trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`      [WARN] AI interpreter API call failed: ${msg}`);
    return null;
  }

  try {
    // Despite the "respond with ONLY JSON" instruction, Claude occasionally
    // wraps the response in a ```json fence (confirmed live) — extract the
    // outermost {...} object instead of assuming the whole response is bare
    // JSON, same defensive parsing gui/visual-compare.ts already uses.
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    const jsonSlice = jsonStart !== -1 && jsonEnd > jsonStart ? raw.slice(jsonStart, jsonEnd + 1) : raw;
    const parsed = JSON.parse(jsonSlice);
    const testType = parsed.testType?.trim().toLowerCase();
    const checkItems: string[] = Array.isArray(parsed.checkItems) ? parsed.checkItems : [];
    const confidence: 'high' | 'low' = parsed.confidence === 'low' ? 'low' : 'high';
    const params: Record<string, string> = parsed.params && typeof parsed.params === 'object'
      ? Object.fromEntries(
          (Object.entries(parsed.params) as [string, unknown][])
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        )
      : {};
    const validKinds: VisualCheckKind[] = ['asset-vs-site', 'site-vs-site', 'none'];
    const visualCheckKind: VisualCheckKind = validKinds.includes(parsed.visualCheckKind) ? parsed.visualCheckKind : 'none';
    const testCases = normalizeTestCases(parsed.testCases, ticketNumber);

    // A "none"/unmatched testType doesn't mean the interpretation failed —
    // checkItems and params (especially GEO) are still real and useful, e.g.
    // to offer an AI-vision check instead of a Playwright spec. Only an
    // actual API/parse failure (above) returns null.
    if (!testType || testType === 'none') {
      return { testType: null, checkItems, confidence, params, visualCheckKind, testCases };
    }

    const matched =
      SUPPORTED_TEST_TYPES.find(t => t === testType) ??
      SUPPORTED_TEST_TYPES.find(t => testType.includes(t) || t.includes(testType)) ??
      null;

    if (!matched) return { testType: null, checkItems, confidence, params, visualCheckKind, testCases };

    return { testType: matched, checkItems, confidence, params, visualCheckKind, testCases };
  } catch {
    console.warn('      [WARN] AI interpreter returned malformed JSON — skipping.');
    return null;
  }
}

// Claude occasionally omits a field or gets a shape slightly wrong even
// inside an otherwise-valid JSON response — normalize defensively so a
// glitch in "testCases" specifically doesn't nuke the entire interpretation
// (which the outer try/catch would otherwise do, since JSON.parse already
// succeeded by this point).
function normalizeTestCases(raw: unknown, ticketNumber: string): DraftedTestCase[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((r, i) => {
      const fallbackId = `TC-${ticketNumber}-${String(i + 1).padStart(3, '0')}`;
      const preconditions = Array.isArray(r.preconditions) ? r.preconditions.filter((p): p is string => typeof p === 'string') : [];
      const testData = Array.isArray(r.testData) ? r.testData.filter((d): d is string => typeof d === 'string') : [];
      const steps: TestCaseStep[] = Array.isArray(r.steps)
        ? r.steps
            .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
            .map(s => ({
              step: typeof s.step === 'string' ? s.step : '',
              expected: typeof s.expected === 'string' ? s.expected : '',
            }))
            .filter(s => s.step)
        : [];
      return {
        testCaseId: typeof r.testCaseId === 'string' && r.testCaseId ? r.testCaseId : fallbackId,
        title: typeof r.title === 'string' ? r.title : '',
        requirementReference: typeof r.requirementReference === 'string' ? r.requirementReference : '',
        brandGeo: typeof r.brandGeo === 'string' ? r.brandGeo : '',
        platform: typeof r.platform === 'string' ? r.platform : 'Desktop & Mobile',
        environment: typeof r.environment === 'string' ? r.environment : 'QA',
        preconditions,
        testData,
        steps,
        notes: typeof r.notes === 'string' ? r.notes : '',
        automatable: r.automatable === true,
      };
    });
}

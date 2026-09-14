import Anthropic from '@anthropic-ai/sdk';
import { SUPPORTED_TEST_TYPES } from './test-runner';
import { getConfluencePageText } from './confluence-client';

const MODEL = 'claude-sonnet-4-6';

// "QA Lessons — Standing Rules" in Confluence space QKB — Reyn's JIRA QA
// Helper knowledge base. Fetched live (cached 10 min) on every interpret
// call so a rule Reyn adds/changes on Confluence takes effect here without
// a redeploy — this is the actual point of consolidating onto one KB
// instead of each person's tool carrying its own frozen copy of the rules.
const STANDING_RULES_PAGE_ID = '282001429';

// Which kind of AI-vision check (if any) actually fits this ticket —
// situational, not a single fixed fallback. Confirmed live both ways can be
// wrong for the wrong ticket: LP1-445 ("Contact Us Page Not Matched QA vs
// Prod") needs 'site-vs-site' (a content/translation mismatch); SC-963
// ("App Install Toaster — change the image") needs 'asset-vs-site' (a new
// image attached to the ticket, to be checked against the live page) — a
// generic "compare QA to Production" would be the wrong tool for SC-963,
// which isn't a QA-vs-Prod mismatch at all, it's a brand-new asset rollout.
export type VisualCheckKind = 'asset-vs-site' | 'site-vs-site' | 'none';

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
}

export async function interpretTicket(
  summary: string,
  description: string,
  hasImageAttachment = false,
): Promise<InterpretedTicket | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('      [WARN] ANTHROPIC_API_KEY not set — AI interpreter skipped.');
    return null;
  }

  const client = new Anthropic({ apiKey });

  const supportedList = SUPPORTED_TEST_TYPES.map(t => `"${t}"`).join(', ');
  const standingRules = await getConfluencePageText(STANDING_RULES_PAGE_ID);

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

Example for a GA ticket with title "[SNG AB] Google Analytics tag":
{"testType":"google analytics","checkItems":["GA tag G-ABC123 present on all pages","window.dataLayer initialized on all pages","gtag function defined and callable"],"confidence":"high","params":{"TAG_ID":"G-ABC123","GEO":"AB"},"visualCheckKind":"none"}`
    + (standingRules
        ? `\n\n---\nCurrent QA Standing Rules (live from the team's Confluence knowledge base — these are practical lessons confirmed in production and take priority over general judgement; use them when writing "checkItems" and judging "confidence"):\n${standingRules}`
        : '');

  let raw: string;
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
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

    // A "none"/unmatched testType doesn't mean the interpretation failed —
    // checkItems and params (especially GEO) are still real and useful, e.g.
    // to offer an AI-vision check instead of a Playwright spec. Only an
    // actual API/parse failure (above) returns null.
    if (!testType || testType === 'none') {
      return { testType: null, checkItems, confidence, params, visualCheckKind };
    }

    const matched =
      SUPPORTED_TEST_TYPES.find(t => t === testType) ??
      SUPPORTED_TEST_TYPES.find(t => testType.includes(t) || t.includes(testType)) ??
      null;

    if (!matched) return { testType: null, checkItems, confidence, params, visualCheckKind };

    return { testType: matched, checkItems, confidence, params, visualCheckKind };
  } catch {
    console.warn('      [WARN] AI interpreter returned malformed JSON — skipping.');
    return null;
  }
}

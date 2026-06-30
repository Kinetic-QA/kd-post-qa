import Anthropic from '@anthropic-ai/sdk';
import { SUPPORTED_TEST_TYPES } from './test-runner';

const MODEL = 'claude-sonnet-4-6';

export interface InterpretedTicket {
  testType: string;                 // must be one of SUPPORTED_TEST_TYPES
  checkItems: string[];             // 2–5 plain-English verification statements
  confidence: 'high' | 'low';      // high = clear match, low = best guess
  params: Record<string, string>;  // tag ID, domain, and any other runtime values
}

export async function interpretTicket(
  summary: string,
  description: string,
): Promise<InterpretedTicket | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('      [WARN] ANTHROPIC_API_KEY not set — AI interpreter skipped.');
    return null;
  }

  const client = new Anthropic({ apiKey });

  const supportedList = SUPPORTED_TEST_TYPES.map(t => `"${t}"`).join(', ');

  const systemPrompt = `You are a QA analyst for an automated Playwright test suite covering gaming/casino websites.

Your job is to read a Jira ticket and return a single JSON object with these fields:

- "testType": the best matching test type from the supported list, or "none" if nothing fits
- "checkItems": array of 2–5 short plain-English strings describing exactly what will be verified
- "confidence": "high" if the match is clear, "low" if it is a best guess
- "params": object of key-value pairs extracted from the ticket needed at runtime

Supported test types: ${supportedList}

Rules for "params" by test type:
- "google analytics": extract "TAG_ID" (Measurement ID, format G-XXXXXXX), "BRAND" (KD brand code, e.g. "SNG"), and "GEO" (market code, e.g. "AB", "UK", "COM")
- "meta pixel": extract "TAG_ID" (numeric Pixel ID), "BRAND", and "GEO"
- "tiktok pixel": extract "TAG_ID" (alphanumeric Pixel ID), "BRAND", and "GEO"
- "google tag manager": extract "TAG_ID" (container ID, format GTM-XXXXXXX), "BRAND", and "GEO"
- All other test types: "params" must be an empty object {}

Rules for "params" values:
- Only extract values explicitly stated in the ticket — never guess or invent
- "BRAND" and "GEO" are almost always in the ticket title in the format [BRAND GEO] — e.g. "[SNG AB]" → BRAND=SNG, GEO=AB
- "TAG_ID" must be the exact ID string as written in the ticket
- Known brand codes: GC, MC, SC, I36, SNG, PSL, PSC, PC, LMS, SG, LP, ZI

Rules for "checkItems":
- Be specific to what this ticket introduced or changed
- Write each as a verification statement (e.g. "GA tag G-XXXXXXX is present on the homepage")
- Do not write generic items like "page loads correctly"

Respond with ONLY valid JSON. No explanation, no markdown fences, no extra text.

Example for a GA ticket with title "[SNG AB] Google Analytics tag":
{"testType":"google analytics","checkItems":["GA tag G-ABC123 present on all pages","window.dataLayer initialized on all pages","gtag function defined and callable"],"confidence":"high","params":{"TAG_ID":"G-ABC123","BRAND":"SNG","GEO":"AB"}}`;

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
    const parsed = JSON.parse(raw);
    const testType = parsed.testType?.trim().toLowerCase();
    const checkItems: string[] = Array.isArray(parsed.checkItems) ? parsed.checkItems : [];
    const confidence: 'high' | 'low' = parsed.confidence === 'low' ? 'low' : 'high';
    const params: Record<string, string> = parsed.params && typeof parsed.params === 'object'
      ? Object.fromEntries(
          (Object.entries(parsed.params) as [string, unknown][])
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        )
      : {};

    if (!testType || testType === 'none') return null;

    const matched =
      SUPPORTED_TEST_TYPES.find(t => t === testType) ??
      SUPPORTED_TEST_TYPES.find(t => testType.includes(t) || t.includes(testType)) ??
      null;

    if (!matched) return null;

    return { testType: matched, checkItems, confidence, params };
  } catch {
    console.warn('      [WARN] AI interpreter returned malformed JSON — skipping.');
    return null;
  }
}

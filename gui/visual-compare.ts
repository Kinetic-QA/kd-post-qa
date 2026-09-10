// AI-powered Visual Check comparison — mirrors the house pattern from
// src/ticket-interpreter.ts (module-level MODEL constant, per-call client,
// null/error-on-failure rather than throwing, lenient JSON parsing) but
// uses Claude's vision input (image/document content blocks) instead of
// plain text.
import Anthropic from '@anthropic-ai/sdk';

export const MODEL = 'claude-sonnet-4-6';

export type VisualCheckMode = 'document-vs-site' | 'asset-vs-site' | 'site-vs-site' | 'popup-vs-site';

// Shown directly in the UI as the headline verdict — kept small and fixed
// so the frontend can map each one to a specific color/icon rather than
// rendering arbitrary AI prose as the primary status.
export type VisualStatus = 'matched' | 'not_matched' | 'issue_found' | 'no_issues_found';

export interface VisualFinding {
  severity: 'critical' | 'major' | 'minor';
  title: string;
  description: string;
  location: string;
}

// Field-by-field text comparison (headline, CTA text, promo code, etc.) —
// lets the UI show a scannable table instead of making someone read a
// paragraph to find out whether the promo code matched.
export interface BreakdownRow {
  field: string;
  assetValue: string;
  siteValue: string;
  match: boolean;
}

// Normalized (0-1) region within the bestFrameIndex image — lets the server
// crop out just the matched area with sharp, instead of showing a whole
// full-page screenshot shrunk down to an unreadable sliver.
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageInput {
  buffer: Buffer;
  mimeType: string; // e.g. 'image/png', 'image/jpeg', 'application/pdf'
}

export interface VisualCompareResult {
  status: VisualStatus;
  // Index into the siteImages array this verdict is best illustrated by —
  // for asset-vs-site, whichever frame most clearly shows the match (or,
  // if not matched, most clearly shows what's there instead); for the
  // single-frame modes this is always 0. Lets the UI show ONE large,
  // relevant site image side-by-side with the reference instead of a wall
  // of thumbnails.
  bestFrameIndex: number;
  boundingBox: BoundingBox | null;
  breakdown: BreakdownRow[];
  findings: VisualFinding[];
  model: string;
}

const PROMPTS: Record<VisualCheckMode, string> = {
  'document-vs-site': `You are a QA analyst comparing a reference document (a spec, requirements doc, or design brief — the FIRST attachment) against a live website screenshot (the LAST attachment).

Identify meaningful discrepancies: missing or extra sections, wrong copy/text, layout that doesn't match what the document describes, wrong colors/branding, missing images or elements the document calls for.

Also extract a field-by-field "breakdown" of comparable text the document specifies (headings, key copy, CTA button text, promo/bonus codes, prices) versus what the live site actually shows for each.

Set "status" to "issue_found" if you find any meaningful discrepancy, or "no_issues_found" if the page matches the document. Leave "boundingBox" null unless there's one specific discrepant area worth zooming into, in which case give its normalized location in the site screenshot.`,
  'asset-vs-site': `You are a QA analyst checking whether a specific asset (e.g. a banner, logo, or promo image — the FIRST attachment) appears correctly on a live website.

You will be shown one or more numbered screenshots of the SAME live page ("Site frame 0", "Site frame 1", ...), captured a few seconds apart. This is deliberate: many sites show the asset inside a rotating hero banner/carousel, so a single screenshot may just have caught a different slide, not proof the asset is missing. Treat all the site frames together as one combined view of the page — check every one of them before concluding anything.

Determine: (1) is this asset present in AT LEAST ONE of the site frames? (2) if present, does it match exactly (right crop, right version, right placement, right text if any)? (3) only conclude it's absent if it does not appear in ANY frame — if it appears in some frames but not others, that's expected carousel rotation, not a defect. (4) if genuinely absent from every frame, describe what's shown in its place instead.

If the asset IS present (status "matched" or "issue_found"), also extract a field-by-field "breakdown" of every distinct piece of text visible on the asset (e.g. headline, subheadline, CTA button text, bonus/promo code) versus the equivalent text on the matched site frame. If status is "not_matched", leave "breakdown" as an empty array — there's nothing on the site to compare field-by-field, so don't waste time restating "not present" for every field.

Set "status" to exactly one of:
- "matched" — the asset is present (in at least one frame) and correct.
- "issue_found" — the asset is present but wrong/different (wrong crop, version, text, or placement).
- "not_matched" — the asset does not appear in any frame at all.
Set "bestFrameIndex" to the frame number that most clearly shows your conclusion (the match if matched/issue_found, or the clearest "here's what's there instead" frame — usually the hero/top banner area — if not_matched).
Set "boundingBox" to the normalized (0.0-1.0) location of that region WITHIN the bestFrameIndex image (x/y = top-left corner as a fraction of image width/height, width/height as fractions of image width/height) — your best estimate of where the match (or the closest equivalent area, e.g. the hero banner, if not matched) sits on the page. Only set it null if you genuinely cannot locate any relevant region.

IMPORTANT — keep the box TIGHT around only the single matched slide/element itself: many hero sections are carousels that show a sliver of the NEXT (or previous) slide peeking in at the edge of the same horizontal band. Do not include that neighboring slide in the box — if the matched banner only occupies (for example) the left 70% of the hero section's width, set width to ~0.70, not 1.0. Look carefully at where the actual matched content ends and any adjacent slide/element begins, and stop the box there. When genuinely unsure of the exact edge, prefer a box that's a little too tight over one that's too wide.`,
  'site-vs-site': `You are a QA analyst comparing two screenshots of what should be the same page — a QA/staging version (the FIRST attachment) against a Production/live version (the LAST attachment, "Site frame 0").

Identify meaningful visual differences: layout drift, missing/extra elements, text mismatches, color or branding inconsistencies, broken or missing images. A hero banner/carousel showing a different rotating slide between the two is not itself a defect unless the actual set of promotions differs.

Set "status" to "issue_found" if you find any meaningful discrepancy, or "no_issues_found" if the two match. Leave "boundingBox" and "breakdown" empty/null — not applicable to this mode.`,
  'popup-vs-site': `You are a QA analyst checking whether a specific campaign pop-up (the FIRST attachment) appears correctly on a live website. The SECOND attachment ("Site frame 0") is a screenshot of the live page taken right after a pop-up was detected on screen.

Determine: (1) does the pop-up shown in the site screenshot match the reference pop-up? (2) if present, does it match exactly (right imagery, right text, right CTA button, right promo/bonus code)? (3) if a different pop-up (or no pop-up at all) is visible instead, describe what's shown.

Also extract a field-by-field "breakdown" of every distinct piece of text visible on the reference pop-up (e.g. headline, body copy, CTA button text, bonus/promo code) versus the equivalent text on the site screenshot — unless status is "not_matched", in which case leave "breakdown" empty (nothing on the site to compare field-by-field).

Set "status" to exactly one of:
- "matched" — the pop-up is present and correct.
- "issue_found" — a pop-up is present but wrong/different from the reference.
- "not_matched" — the reference pop-up does not appear at all (including if no pop-up shows up on the site screenshot).
Set "bestFrameIndex" to 0 (only one site screenshot is provided).
Set "boundingBox" to the normalized (0.0-1.0) location of the pop-up WITHIN the site screenshot — keep it TIGHT around just the pop-up itself, not the whole page behind it. Only null if you genuinely cannot locate it.`,
};

const RESPONSE_INSTRUCTIONS = `Respond with ONLY a valid JSON object, no markdown fences, no explanation, in this exact shape:
{"status":"matched|not_matched|issue_found|no_issues_found","bestFrameIndex":0,"boundingBox":{"x":0.0,"y":0.0,"width":1.0,"height":1.0} or null,"breakdown":[{"field":"short field name, e.g. 'Headline' or 'Promo code'","assetValue":"the text/value on the reference","siteValue":"the text/value on the live site, or \\"not present\\"","match":true}],"findings":[{"severity":"critical|major|minor","title":"short title","description":"plain-English, detailed description of the discrepancy or match","location":"rough location on the page, e.g. 'hero banner' or 'footer'"}]}

"findings" may be an empty array for "matched"/"no_issues_found" results. "breakdown" may be an empty array if there's no comparable text (e.g. a pure logo/graphic with no text). Do not report trivial rendering differences (anti-aliasing, font hinting, lazy-loaded images that just hadn't finished loading) as findings. Be detailed and specific in "description" and every breakdown value — name exactly what you saw, not just that something differs.`;

function blockFor(image: ImageInput): Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam {
  const data = image.buffer.toString('base64');
  if (image.mimeType === 'application/pdf') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data },
    };
  }
  const media_type = image.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  return {
    type: 'image',
    source: { type: 'base64', media_type, data },
  };
}

function parseBoundingBox(raw: unknown): BoundingBox | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const x = Number(b.x), y = Number(b.y), width = Number(b.width), height = Number(b.height);
  const values = [x, y, width, height];
  if (values.some(v => !Number.isFinite(v))) return null;
  // Clamp into [0,1] and require a non-trivial size — a degenerate/near-zero
  // box from a bad model response is worse than no crop at all (an empty or
  // 1x1px extract would just fail in sharp).
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const cx = clamp01(x), cy = clamp01(y);
  const cw = Math.min(1 - cx, Math.max(0, width));
  const ch = Math.min(1 - cy, Math.max(0, height));
  if (cw < 0.03 || ch < 0.03) return null;
  return { x: cx, y: cy, width: cw, height: ch };
}

export async function compareVisual(
  mode: VisualCheckMode,
  imageA: ImageInput,
  siteImages: ImageInput[]
): Promise<VisualCompareResult | { error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('      [WARN] ANTHROPIC_API_KEY not set — Visual Check skipped.');
    return { error: 'AI comparison unavailable — ANTHROPIC_API_KEY is not set.' };
  }

  const client = new Anthropic({ apiKey });

  // Visible, real-time confirmation (in the server console) that this
  // specific request actually went to Claude, and which model handled it —
  // the UI shows the same model name in the results card, sourced from this
  // call's own MODEL constant rather than a hardcoded string on the frontend.
  console.log(`      [Visual Check] Comparing via ${MODEL} (mode: ${mode}, ${siteImages.length} site frame(s))...`);

  // Each site image gets its own numbered label immediately before it (not
  // one combined label up front) so bestFrameIndex in the response can
  // reliably be tied back to a specific frame.
  const siteContent = siteImages.flatMap((img, i): Anthropic.ContentBlockParam[] => [
    { type: 'text', text: `Site frame ${i}:` },
    blockFor(img),
  ]);

  let raw: string;
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: `${PROMPTS[mode]}\n\n${RESPONSE_INSTRUCTIONS}`,
      messages: [{
        role: 'user',
        content: [
          blockFor(imageA),
          ...siteContent,
        ],
      }],
    });

    raw = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')
      .trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`      [WARN] Visual Check API call failed: ${msg}`);
    return { error: `AI comparison failed: ${msg}` };
  }

  // Despite the "respond with ONLY JSON" instruction, Claude occasionally
  // prefixes the JSON with a bit of reasoning prose (confirmed live: "I can
  // see the banner in frames 1 and 2... {...}") — extract the outermost
  // {...} object instead of assuming the whole response is bare JSON, so a
  // real, correct analysis doesn't get thrown away over formatting.
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  const jsonSlice = jsonStart !== -1 && jsonEnd > jsonStart ? raw.slice(jsonStart, jsonEnd + 1) : raw;

  try {
    const parsed = JSON.parse(jsonSlice);
    const findings: VisualFinding[] = Array.isArray(parsed.findings)
      ? parsed.findings
          .filter((f: unknown): f is Record<string, unknown> => !!f && typeof f === 'object')
          .map((f: Record<string, unknown>) => ({
            severity: f.severity === 'critical' || f.severity === 'minor' ? f.severity : 'major',
            title: typeof f.title === 'string' ? f.title : 'Untitled finding',
            description: typeof f.description === 'string' ? f.description : '',
            location: typeof f.location === 'string' ? f.location : '',
          }))
      : [];

    const breakdown: BreakdownRow[] = Array.isArray(parsed.breakdown)
      ? parsed.breakdown
          .filter((r: unknown): r is Record<string, unknown> => !!r && typeof r === 'object')
          .map((r: Record<string, unknown>) => ({
            field: typeof r.field === 'string' ? r.field : 'Field',
            assetValue: typeof r.assetValue === 'string' ? r.assetValue : '',
            siteValue: typeof r.siteValue === 'string' ? r.siteValue : '',
            match: r.match === true,
          }))
      : [];

    const validStatuses: VisualStatus[] = ['matched', 'not_matched', 'issue_found', 'no_issues_found'];
    const status: VisualStatus = validStatuses.includes(parsed.status)
      ? parsed.status
      : (findings.length > 0 ? 'issue_found' : 'no_issues_found');

    const rawIndex = Number(parsed.bestFrameIndex);
    const bestFrameIndex = Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < siteImages.length ? rawIndex : 0;

    const boundingBox = parseBoundingBox(parsed.boundingBox);

    // A field-by-field breakdown only means something when the asset is
    // actually present to compare against (matched/issue_found) — when
    // it's simply absent, every row would just read "not present", which
    // is a redundant restatement of the status badge itself. Enforced here
    // rather than relying on the prompt alone, since the model doesn't
    // always follow that instruction.
    const finalBreakdown = status === 'not_matched' ? [] : breakdown;

    return { status, bestFrameIndex, boundingBox, breakdown: finalBreakdown, findings, model: MODEL };
  } catch (err) {
    console.warn('      [WARN] Visual Check returned malformed JSON:', err instanceof Error ? err.message : err);
    console.warn('      [WARN] Raw response was:', raw.slice(0, 4000));
    return { error: 'AI comparison returned an unreadable response — try again.' };
  }
}

// T&C comparison status doesn't have a "present/absent asset" concept —
// just clean or not.
export type TextStatus = 'issue_found' | 'no_issues_found';

export interface TextCompareResult {
  status: TextStatus;
  breakdown: BreakdownRow[];
  findings: VisualFinding[];
  model: string;
}

const TEXT_COMPARE_SYSTEM_PROMPT = `You are a QA analyst comparing reference Terms & Conditions copy for ONE SPECIFIC campaign (provided by the user) against the ACTUAL rendered text of a live web page.

The live page's text may contain T&C blocks for SEVERAL DIFFERENT, UNRELATED promotions/campaigns (e.g. other games' bonus offers) alongside the one you're checking — sometimes immediately adjacent to each other. Your FIRST job is to identify which specific block on the page corresponds to the SAME campaign as the reference T&C — match it by game name, promo code, or other identifying details the reference T&C itself contains. Compare ONLY against that matching block.

Do NOT pull values from a different, unrelated campaign's T&C block just because it happens to be nearby on the page — a value belonging to a different promotion is not "found on site" for THIS campaign's fields, and is not a discrepancy in this campaign's T&C either. If the reference T&C doesn't mention a value at all (e.g. no stated max bonus cap), do not manufacture a breakdown row for it just because some other promotion's block happens to mention a similarly-named value — only include a breakdown row for a field that actually appears in the reference T&C.

CRITICAL — do not guess a "closest" block: if the page text does not contain any block whose game name, promo code, or other identifying detail actually matches the reference T&C, DO NOT fall back to comparing against the nearest, most similar-looking, or first T&C block you see — that block belongs to a different campaign and is not a valid stand-in. In that case, set every breakdown row's "siteValue" to "not present", set "status" to "issue_found", and add one critical "finding" titled "No matching T&C block found for this campaign" explaining what you searched for and what you found instead (e.g. "page has T&C blocks for other games only"). Only report a breakdown value as present on the site if it came from a block you positively matched to this specific campaign.

Once you've identified the correct matching block: identify meaningful discrepancies (missing clauses, wrong or stale values — wagering requirements, minimum deposit, bonus percentage/amount, expiry date, promo code, game/country exclusions — or the T&C being entirely absent from the page).

Extract a field-by-field "breakdown" of every distinct comparable value that actually appears in the REFERENCE T&C (e.g. "Wagering requirement", "Minimum deposit", "Bonus amount", "Expiry date", "Promo code") versus what the matching site block actually shows for each — use "not present" for siteValue only if that specific value is genuinely missing from the matching block (not just because a DIFFERENT promotion's block doesn't have it either — that's irrelevant).

If a genuinely unrelated T&C block sits confusingly close to the reference campaign's own block, that layout/proximity issue can be raised as its own low-severity "finding" (not a breakdown row) — but only if it could realistically confuse a player about which terms apply to which offer.

Set "status" to "issue_found" if any value in the MATCHING block is missing, wrong, or the campaign's own T&C isn't present at all, or "no_issues_found" if everything in the matching block checks out.

Respond with ONLY a valid JSON object, no markdown fences, no explanation, in this exact shape:
{"status":"issue_found|no_issues_found","breakdown":[{"field":"short field name","assetValue":"the value in the reference T&C","siteValue":"the value found on the live page, or \\"not present\\"","match":true}],"findings":[{"severity":"critical|major|minor","title":"short title","description":"plain-English, detailed description","location":"e.g. 'promotions page footer'"}]}

"findings" may be empty for "no_issues_found". Be detailed and specific — quote the exact wording/values you found, not just that something differs.`;

export async function compareText(
  refText: string,
  siteText: string
): Promise<TextCompareResult | { error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('      [WARN] ANTHROPIC_API_KEY not set — T&C comparison skipped.');
    return { error: 'AI comparison unavailable — ANTHROPIC_API_KEY is not set.' };
  }

  const client = new Anthropic({ apiKey });
  console.log(`      [Visual Check] Comparing T&C text via ${MODEL}...`);

  let raw: string;
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: TEXT_COMPARE_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Reference T&C:\n${refText}\n\n---\n\nLive page text:\n${siteText}`,
      }],
    });

    raw = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')
      .trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`      [WARN] T&C comparison API call failed: ${msg}`);
    return { error: `AI comparison failed: ${msg}` };
  }

  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  const jsonSlice = jsonStart !== -1 && jsonEnd > jsonStart ? raw.slice(jsonStart, jsonEnd + 1) : raw;

  try {
    const parsed = JSON.parse(jsonSlice);
    const findings: VisualFinding[] = Array.isArray(parsed.findings)
      ? parsed.findings
          .filter((f: unknown): f is Record<string, unknown> => !!f && typeof f === 'object')
          .map((f: Record<string, unknown>) => ({
            severity: f.severity === 'critical' || f.severity === 'minor' ? f.severity : 'major',
            title: typeof f.title === 'string' ? f.title : 'Untitled finding',
            description: typeof f.description === 'string' ? f.description : '',
            location: typeof f.location === 'string' ? f.location : '',
          }))
      : [];

    const breakdown: BreakdownRow[] = Array.isArray(parsed.breakdown)
      ? parsed.breakdown
          .filter((r: unknown): r is Record<string, unknown> => !!r && typeof r === 'object')
          .map((r: Record<string, unknown>) => ({
            field: typeof r.field === 'string' ? r.field : 'Field',
            assetValue: typeof r.assetValue === 'string' ? r.assetValue : '',
            siteValue: typeof r.siteValue === 'string' ? r.siteValue : '',
            match: r.match === true,
          }))
      : [];

    const status: TextStatus = parsed.status === 'no_issues_found' && findings.length === 0
      ? 'no_issues_found'
      : (findings.length > 0 ? 'issue_found' : 'no_issues_found');

    return { status, breakdown, findings, model: MODEL };
  } catch (err) {
    console.warn('      [WARN] T&C comparison returned malformed JSON:', err instanceof Error ? err.message : err);
    console.warn('      [WARN] Raw response was:', raw.slice(0, 4000));
    return { error: 'AI comparison returned an unreadable response — try again.' };
  }
}

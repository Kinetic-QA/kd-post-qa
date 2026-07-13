# PLAN.md — Tracking Tag Checker Framework + Smarter Interpreter

> **For Claude CLI:** Read this entire file before touching any code.
> This is the authoritative plan for the next phase of the JIRA QA Agent.
> Do not add anything not described here. Do not refactor unrelated files.

---

## Overview

We are building a **Tracking Tag Checker** — a category of Playwright tests that
verifies tracking and analytics tags are correctly implemented on a live site.

This is not a one-off check for a single ticket. It is a reusable framework where:
- Each tag type (Google Analytics, Meta Pixel, TikTok Pixel, GTM) has its own spec
- All specs share the same crawl logic (discover all pages from the homepage)
- The agent extracts the tag ID and target domain from the Jira ticket automatically
- The same flow works for any ticket of this type — different ID, different domain, same spec

**This branch builds the foundation (Google Analytics) and the shared infrastructure.**
All other tag types follow the exact same pattern later.

---

## Real Example (Reference Ticket: SNG-1415)

Ticket title: `[SNG AB] Google Analytics tag`

Ticket description:
> We need to add this GA tag to all pages on ab.spingenie.ca
> `gtag('config', 'G-CHKJ7J7TBY')`

What the agent does automatically:
1. Reads the ticket
2. Identifies this as a `google analytics` check
3. Extracts `GA_ID = G-CHKJ7J7TBY` and `TARGET_DOMAIN = ab.spingenie.ca`
4. Crawls `ab.spingenie.ca` and checks every discovered page
5. Posts findings to Jira and transitions the ticket

A future ticket with `G-XYZ9999` on `on.spingenie.ca` runs the same spec —
no code changes needed. The interpreter handles the extraction every time.

---

## Tracking Tag Types — Current vs Future

| Tag Type | Test Type String | Spec File | Browser Checks | This Branch |
|---|---|---|---|---|
| Google Analytics | `google analytics` | `tests/p1/tracking/google-analytics.spec.ts` | `gtag()`, `window.dataLayer`, GTM script tag | ✅ Build now |
| Meta Pixel | `meta pixel` | `tests/p1/tracking/meta-pixel.spec.ts` | `fbq()`, `window._fbq`, Facebook script tag | 🔜 Next branch |
| TikTok Pixel | `tiktok pixel` | `tests/p1/tracking/tiktok-pixel.spec.ts` | `ttq()`, TikTok script tag | 🔜 Future |
| Google Tag Manager | `google tag manager` | `tests/p1/tracking/gtm.spec.ts` | `window.google_tag_manager`, GTM container script | 🔜 Future |

All specs live under `tests/p1/tracking/` — a new subdirectory.
All specs import shared crawl logic from `helpers/tracking.ts` — a new helper file.

---

## Files to Create or Change

| File | Action |
|---|---|
| `src/ticket-interpreter.ts` | Rewrite — new return type, new prompt, structured JSON output |
| `src/agent.ts` | Update — use new return type, inject QA domain, inject params as env vars |
| `src/test-runner.ts` | Add all four tracking tag types to `TEST_MAP` (GA active, others point to placeholder) |
| `helpers/brand-urls.ts` | ✅ Already created — QA URL library for all KD brands, keyed by brand + GEO. Do not recreate. |
| `helpers/tracking.ts` | Create new — shared `discoverPages` helper used by all tracking specs |
| `tests/p1/tracking/google-analytics.spec.ts` | Create new — GA verification spec |
| `.env.example` | Add new QA_ vars |

**Do not change:** `src/requirements-parser.ts`, `src/jira-client.ts`, any existing spec files.

---

## Part 1 — New Interface in `ticket-interpreter.ts`

### Replace the current return type with:

```ts
export interface InterpretedTicket {
  testType: string;               // must be one of SUPPORTED_TEST_TYPES
  checkItems: string[];           // 2–5 plain-English verification statements
  confidence: 'high' | 'low';    // high = clear match, low = best guess
  params: Record<string, string>; // tag ID, domain, and any other runtime values
}
```

`params` is always an object — empty `{}` if nothing extra was extracted.
Never null or undefined.

### Change the function signature to:

```ts
export async function interpretTicket(
  summary: string,
  description: string,
): Promise<InterpretedTicket | null>
```

Returns `null` only when:
- No `ANTHROPIC_API_KEY` is set
- The API call fails
- Claude responds with `"none"` as the test type

---

## Part 2 — New Claude Prompt in `ticket-interpreter.ts`

### System prompt:

```
You are a QA analyst for an automated Playwright test suite covering gaming/casino websites.

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
{"testType":"google analytics","checkItems":["GA tag G-ABC123 present on all pages","window.dataLayer initialized on all pages","gtag function defined and callable"],"confidence":"high","params":{"TAG_ID":"G-ABC123","BRAND":"SNG","GEO":"AB"}}
```

### User message:

```
Ticket title: ${summary}

Description:
${description}
```

### Parsing the response:

```ts
const parsed = JSON.parse(raw);
const testType = parsed.testType?.trim().toLowerCase();
const checkItems: string[] = Array.isArray(parsed.checkItems) ? parsed.checkItems : [];
const confidence: 'high' | 'low' = parsed.confidence === 'low' ? 'low' : 'high';
const params: Record<string, string> = parsed.params && typeof parsed.params === 'object'
  ? Object.fromEntries(
      Object.entries(parsed.params).filter(([, v]) => typeof v === 'string')
    )
  : {};

if (!testType || testType === 'none') return null;

const matched =
  SUPPORTED_TEST_TYPES.find(t => t === testType) ??
  SUPPORTED_TEST_TYPES.find(t => testType.includes(t) || t.includes(testType)) ??
  null;

if (!matched) return null;

return { testType: matched, checkItems, confidence, params };
```

Wrap the entire block in try/catch — malformed JSON → log warning → return null.

---

## Part 3 — `helpers/brand-urls.ts` (Already Created — Do Not Recreate)

This file already exists at `helpers/brand-urls.ts` with all KD brand QA URLs populated.

**Key design decision:** the library is keyed by **brand code + GEO**, not by production domain.
KD Jira ticket titles always follow the format `[BRAND GEO] Description` (e.g. `[SNG AB] Google Analytics tag`).
The interpreter extracts BRAND and GEO from the ticket title, and the agent calls `getQAUrl(brand, geo)`.

**Rule: pre-checks always run against QA — never production.**

### Exports CLI needs to know about:

```ts
// Get QA URL for a brand + GEO — returns null if not found
getQAUrl(brand: string, geo: string): string | null

// Get full entry (brand, geo, qaUrl) — useful for logging
getBrandEntry(brand: string, geo: string): BrandEnvironment | null

// Get all QA URLs for a brand across all GEOs
getAllQAUrlsForBrand(brand: string): BrandEnvironment[]
```

Example:
```ts
getQAUrl('SNG', 'AB')  // → 'https://qa-ab.spingenie.ca/'
getQAUrl('SC', 'UK')   // → 'https://qa.slingo.com/'
getQAUrl('GC', 'DE')   // → null (GC has no DE entry)
```

---

## Part 4 — Changes to `src/agent.ts`

### Step 2 — update the interpreter call

Replace the current rawTestType section with:

```ts
let testType: string | null = parseTestType(ticket.description);
let checkItems: string[] = [];
let testParams: Record<string, string> = {};

if (!testType) {
  console.log('      No "Test Type:" keyword found. Trying AI interpreter...');
  const interpreted = await interpretTicket(ticket.summary, ticket.description);
  if (interpreted) {
    testType = interpreted.testType;
    checkItems = interpreted.checkItems;
    testParams = interpreted.params;
    const flag = interpreted.confidence === 'low' ? ' (low confidence — please verify)' : '';
    console.log(`      AI matched: "${testType}"${flag}`);
    if (checkItems.length > 0) {
      console.log(`      Check items:`);
      checkItems.forEach(item => console.log(`        • ${item}`));
    }
    if (Object.keys(testParams).length > 0) {
      console.log(`      Extracted params:`);
      Object.entries(testParams).forEach(([k, v]) => console.log(`        ${k} = ${v}`));
    }
  }
}
```

### Step 4 — resolve QA URL from brand+GEO, then inject params

Import `getQAUrl` from `helpers/brand-urls.ts`.

Immediately before calling `runPlaywrightTest`, resolve the QA URL and inject all params:

```ts
// Always use QA URL for pre-checks — never run against production
if (testParams.BRAND && testParams.GEO) {
  const qaUrl = getQAUrl(testParams.BRAND, testParams.GEO);
  if (qaUrl) {
    // Store as hostname only (strip protocol + trailing slash) for the spec
    testParams.QA_BASE_URL = qaUrl;
    console.log(`      Pre-check target: ${qaUrl}`);
    console.log(`        Brand: ${testParams.BRAND} | GEO: ${testParams.GEO}`);
  } else {
    console.error(`[FAIL] No QA URL found for brand "${testParams.BRAND}" GEO "${testParams.GEO}".`);
    console.error(`       Add this entry to helpers/brand-urls.ts and retry.`);
    process.exit(1);
  }
}

// Inject all params into process.env so the spec can read them at runtime
for (const [key, value] of Object.entries(testParams)) {
  process.env[`QA_${key}`] = value;
}
```

This means the spec reads:
- `process.env.QA_TAG_ID` — the tag ID extracted from the ticket
- `process.env.QA_QA_BASE_URL` — the resolved QA base URL from the library
- `process.env.QA_BRAND` and `process.env.QA_GEO` — available for logging

**Note:** if no QA URL is found, the agent exits with a clear error — it never silently
runs against a wrong URL. The fix is to add the missing brand+GEO to `helpers/brand-urls.ts`.

### Update `buildCommentAdf` signature

```ts
function buildCommentAdf(
  result: TestRunResult,
  attachments: { thumbnailUrl: string; filename: string }[],
  checkItems: string[],
): object
```

In both PASS and FAIL branches, replace the hardcoded scope bullet with:

```ts
const scopeItems = checkItems.length > 0 ? checkItems : [`${testLabel} Flow`];
// use: adfBulletList(...scopeItems)
```

Update the call site in `main()` to pass `checkItems` as the third argument.

---

## Part 5 — Changes to `src/test-runner.ts`

Add all four tracking types to `TEST_MAP`. GA points to the real spec.
The other three point to a `not-implemented.spec.ts` placeholder so the map
is complete but those types fail gracefully with a clear message if triggered.

```ts
// Tracking tag checkers
'google analytics':   'tests/p1/tracking/google-analytics.spec.ts',
'meta pixel':         'tests/p1/tracking/not-implemented.spec.ts',
'tiktok pixel':       'tests/p1/tracking/not-implemented.spec.ts',
'google tag manager': 'tests/p1/tracking/not-implemented.spec.ts',
```

Also create `tests/p1/tracking/not-implemented.spec.ts` with a single failing test:

```ts
import { test } from '@playwright/test';
test('Not implemented', () => {
  throw new Error(
    'This tracking tag type is recognised but not yet implemented. ' +
    'Raise a request to add the spec for this tag type.'
  );
});
```

No other changes to this file.

---

## Part 6 — Create `helpers/tracking.ts`

This file contains shared logic used by all tracking tag specs.
It must export one function: `discoverPages`.

### `discoverPages` logic:

1. Navigate to `https://${targetDomain}/`
2. Wait for `domcontentloaded`
3. Extract all `href` attributes from `<a>` tags on the page
4. Filter to keep only internal links:
   - Same origin as the target domain
   - Not anchors (`#`), not `mailto:`, not `tel:`
   - No query strings that look like session tokens or tracking params
5. Resolve relative paths to full URLs
6. Deduplicate
7. Always include the homepage itself
8. Cap the result at **50 URLs**
9. Return `string[]` of full URLs

### Function signature:

```ts
export async function discoverPages(page: Page, targetDomain: string): Promise<string[]>
```

Import `Page` from `@playwright/test`.

---

## Part 7 — Create `tests/p1/tracking/google-analytics.spec.ts`

Reads `QA_TAG_ID` and `QA_QA_BASE_URL` from `process.env`.
Fails immediately with a clear message if either is missing.

### For each discovered page, verify three things:

**Check 1 — Script tag present:**
A `<script>` tag with `src` containing both `googletagmanager.com/gtag/js`
and the `QA_TAG_ID` value must exist in the DOM.
Use: `page.locator('script[src*="googletagmanager.com/gtag/js"]')`
Then assert the `src` attribute includes the tag ID string.

**Check 2 — dataLayer initialized:**
`window.dataLayer` must be an Array.
Use: `page.evaluate(() => Array.isArray(window.dataLayer))`

**Check 3 — gtag function defined:**
`gtag` must be a function.
Use: `page.evaluate(() => typeof (window as any).gtag === 'function')`

### Spec structure:

- One `test.describe` block: `GA Tag — ${tagId} on ${targetDomain}`
- A `beforeAll` that calls `discoverPages` from `helpers/tracking.ts` and stores the URL list
- A `test.describe` loop over discovered URLs — one `test` per URL
- Each test: navigate → `waitForLoadState('domcontentloaded')` → 3 checks with `expect.soft`
  → attach screenshot on failure via `testInfo.attach`
- `expect.soft` on all 3 assertions so all results are reported even if one fails

### Constraints:

- No `page.waitForTimeout()` — use `waitForLoadState('domcontentloaded')`
- No hardcoded URLs, domains, or tag IDs
- No `console.log` — use `test.info().annotations` for any logging
- No `any` except the `window` cast
- Must run independently: `npx playwright test tests/p1/tracking/google-analytics.spec.ts`

---

## Part 8 — Update `.env.example`

Add:

```
# Injected automatically by the agent for tracking tag checks (do not set manually)
QA_TAG_ID=
QA_TARGET_DOMAIN=
```

---

## How It All Connects (end-to-end for SNG-1415)

```
npx ts-node src/agent.ts SNG-1415

[1/7] Fetches ticket — "[SNG AB] Google Analytics tag"
[2/7] No "Test Type:" keyword → AI interpreter runs
      AI matched: "google analytics" (high confidence)
      Check items:
        • GA tag G-CHKJ7J7TBY verified on all discovered pages
        • window.dataLayer initialized on all pages
        • gtag function defined and callable
      Extracted params:
        QA_TAG_ID        = G-CHKJ7J7TBY
        QA_TARGET_DOMAIN = ab.spingenie.ca  ← from ticket (production)
[3/7] Transitions ticket → In Review
[4/7] Pre-check: swapping to QA domain
        Production: ab.spingenie.ca
        QA:         qa-ab.spingenie.ca      ← from helpers/brand-urls.ts
      Injects QA_TAG_ID and QA_TARGET_DOMAIN into process.env
      Runs: npx playwright test tests/p1/tracking/google-analytics.spec.ts
      Spec crawls qa-ab.spingenie.ca → discovers N pages → checks all
[5/7] Uploads screenshots (on failure)
[6/7] Posts ADF comment listing check items under Scope Checked
[7/7] Transitions → Approved (if all pages pass)
```

**Same flow for any future GA ticket — no code changes needed:**
```
Ticket: "Add G-XYZ9999 to all pages on on.spingenie.ca"
Extracted:  QA_TAG_ID=G-XYZ9999, QA_TARGET_DOMAIN=on.spingenie.ca
Swapped to: QA_TARGET_DOMAIN=qa-on.spingenie.ca
Runs: same spec → crawls qa-on.spingenie.ca → checks all pages for G-XYZ9999
```

---

## Definition of Done

- [ ] `interpretTicket` returns `InterpretedTicket | null` with `params` field
- [ ] Interpreter prompt handles all 4 tag types (GA, Meta, TikTok, GTM)
- [ ] Agent console shows extracted params when tracking tag ticket is processed
- [ ] `helpers/brand-urls.ts` exists with `BRAND_URLS`, `getQADomain`, `getBrandEntry`
- [ ] SpinGenie AB and ON entries populated; all other brands have TODO comments
- [ ] Agent calls `getQAUrl(brand, geo)` and injects result as `QA_QA_BASE_URL`
- [ ] Agent logs the resolved QA URL, brand, and GEO clearly in the console
- [ ] Agent exits with clear error (not silent) when brand+GEO has no QA URL mapping
- [ ] All 4 tracking types added to `TEST_MAP` in `test-runner.ts`
- [ ] `tests/p1/tracking/not-implemented.spec.ts` exists and fails with a clear message
- [ ] `helpers/tracking.ts` exists and exports `discoverPages`
- [ ] `tests/p1/tracking/google-analytics.spec.ts` exists and runs independently
- [ ] GA spec uses `discoverPages` — no hardcoded page list
- [ ] Crawl capped at 50 pages
- [ ] GA spec checks script tag, dataLayer, and gtag on every discovered page
- [ ] `expect.soft` used so all 3 checks are reported per page
- [ ] Jira comment "Scope Checked" lists the extracted check items
- [ ] `.env.example` updated with `QA_TAG_ID`, `QA_QA_BASE_URL`, `QA_BRAND`, `QA_GEO`
- [ ] All CONTRIBUTING.md rules followed
- [ ] Dry run confirmed: `npx ts-node src/agent.ts SNG-1415 --dry-run`
- [ ] CHANGELOG.md updated before push
- [ ] Branch name: `feature/tracking-tag-checker`

---

## Out of Scope for This Branch

- Meta Pixel spec implementation — same pattern, next branch (`feature/meta-pixel-checker`)
- TikTok Pixel spec — future branch
- Google Tag Manager spec — future branch
- Mobile viewport checks — separate branch
- Campaign date simulation (`?dem=`) — separate branch
- Dynamic spec generation for unknown ticket types — separate phase

---

*Written by: Cowork Agent (Claude) — 2026-06-30*
*Implemented by: Claude CLI in VS Code*

---

## Implementation Notes (Claude CLI — 2026-06-30)

### Dynamic test generation constraint (Part 7)

The plan calls for "one `test` per URL" via a `test.describe` loop. Playwright generates tests synchronously at module load time, but `discoverPages` is async — the URL list isn't available until `beforeAll` runs. These two things can't be combined directly.

**Decision:** Implemented as a single `test` that loops discovered URLs using `test.step` per URL. This gives the same breakdown per URL in the Playwright report (each step is named, expandable, and independently shows pass/fail) while staying within Playwright's constraints.

If RevWright wants true one-test-per-URL in the report, the alternative is to move `discoverPages` into a global `setup` project that writes URLs to a JSON file, then imports that file synchronously in the spec. Happy to implement that pattern in a follow-up branch if preferred.

### `QA_QA_BASE_URL` naming

The agent stores the resolved QA URL in `testParams` under the key `QA_BASE_URL`, then iterates testParams and prefixes every key with `QA_`. This means the env var the spec reads is `process.env.QA_QA_BASE_URL`. This matches what PLAN.md specifies. Worth flagging in case a future refactor wants to clean up the double-prefix — could be simplified by storing it as `BASE_URL` in testParams instead.

---

## DE Live Site Registration Findings — Cowork Agent (Claude) — 2026-07-13

**For Claude CLI:** this is a findings-only entry from manually walking the registration flow on the **live production** DE site (`https://www.slingospiel.de/`, Slingo brand, DE GEO). No code was written or changed. Cross-check this against RevWright Claude.ai's independent findings before making any changes to `registration-widget.spec.ts` — hold off on implementation until both sets of notes are reconciled, per the earlier discussion in this thread.

**Scope note:** this covers the registration *widget flow itself*. Full end-to-end submission ("SPIEL LOS!") was deliberately **not executed** on the live production site to avoid creating a real account — pre-checks should run against the DE QA URL once one exists in `helpers/brand-urls.ts` (unconfirmed whether it does yet for Slingo DE).

### Structure

The registration widget is a 3-step wizard inside a shadow-DOM web component, `<son-auth-modals>` (`document.querySelector('son-auth-modals').shadowRoot`). No iframe is involved. All fields use stable, non-dynamic `id`/`name` attributes — there is no `data-testid` anywhere in this widget, so selectors should key off `id`. Playwright's locators pierce open shadow roots by default, so plain CSS/id selectors should work without special handling — this should still be confirmed once real spec code is written.

Entry point: header button with visible text "ANMELDEN" opens the modal (URL gains `#account` hash). The step counter displayed in the UI reads "SCHRITT X VON 3" (Step X of 3), but there are effectively 4 screens — the phone/DOB screen appears before the counter starts.

### Screen 0 — Mobile number + date of birth (no step counter shown)

- Country code: `select#mobile-countries` (defaults to `+ 49`)
- Mobile number: `input#mobile`, type `tel`, placeholder "Handynummer"
- Date of birth: `input#dateOfBirth`, type `text`, placeholder `dd.mm.yyyy`
- Submit button: visible text "WEITER"

Validation observed:
- Submitting empty → phone field shows "Ungültige Telefonnummer"; DOB field shows "Bitte bestätigen Sie Ihr Alter"
- Valid phone + underage DOB (tested `13.07.2015`) → "Sie müssen mindestens 18 Jahre alt sein, um zu spielen." (phone field validates independently and turns green even when DOB fails)
- Valid phone + adult DOB (tested `13.07.1990`) → advances to Step 1

### Step 1 of 3 — Personal details

- First name: `input#firstName`
- Last name: `input#lastName`
- "Birth name differs from last name" checkbox: `input#birthNameCheck` (optional, unchecked by default)
- Place of birth: `input#birthPlace`
- Nationality: `select#nationality` (defaults "Deutschland", full country list)
- Gender: two toggle buttons, matched by visible text "Männlich" / "Weiblich" — not native inputs, underlying attributes not yet confirmed
- Email: input identified only by placeholder text "Das ist da, wo ich tolle Angebote hinsende" — **id/name not captured, needs a follow-up inspection pass**
- Submit: "WEITER"; "ZURÜCK" also present to go back

All fields showed green check icons once filled with plausible values (Test / Revwright / Berlin / Deutschland / Männlich / a valid-format email). Negative-path validation for this step (blank required field, malformed email) was **not** captured in this pass.

### Step 2 of 3 — Address

- Postal code: input under label "Postleitzahl" — id not confirmed, needs follow-up
- House number: input under "Hausnr."
- Street: input under "Straße"
- Country: select under "Land" (defaults "Deutschland")
- State: `select#state` — a native `<select>`. **Coordinate-based clicks did not reliably open/select this dropdown in this session**; had to set `.value` via script and dispatch `input`/`change` events to get it to register. Option values are ISO-style state codes (e.g. `BE` = Berlin). Flag for whoever writes the spec: `selectOption()` may or may not have the same issue — worth testing early.
- City: `select#city` — **cascading/dependent on State**. Only populates with valid options once State is chosen (e.g. only "Berlin" was offered after State=Berlin). Must be set after State, not before.
- Submit button was visibly disabled with an inline message "Status nicht erkannt" until both State and City were set — confirms both are required fields.
- Testing PLZ `10115` did not auto-fill city/street — no PLZ lookup/autocomplete behavior observed.

Negative-path validation for this step (invalid PLZ format, etc.) was **not** captured in this pass.

### Step 3 of 3 — Credentials & consent

- Username: `input#username` — auto-generated on arrival at this step (observed example: `revtes_se09`), with an adjacent refresh/regenerate icon button (no id captured). Generation logic/pattern is not understood — any assertion on this field should check format/non-emptiness rather than an exact value.
- Password: `input#password`, type `password`, with a show/hide icon. A **live rule checklist** appears under the field as you type, each rule with its own pass/fail icon:
  - Mindestens 10 Zeichen. (min 10 characters)
  - Mindestens eine Zahl. (at least one digit)
  - Mindestens einen Kleinbuchstaben. (at least one lowercase letter)
  - Mindestens einen Großbuchstaben. (at least one uppercase letter)
  - Mindestens ein Sonderzeichen (!?$). (special character, limited to `!?$` specifically)
  - Keine Leerzeichen zwischen den Zeichen. (no spaces between characters)
  - Es sollte nicht enthalten: Ihren Namen, Ihr Geburtsdatum oder Ihren Benutzernamen. (must not contain name, DOB, or username)
  - Tested with `abc123`: only the digit/lowercase/no-spaces/no-personal-info rules passed; length, uppercase, and special-character rules correctly failed. This is a good candidate for per-rule assertions rather than one overall pass/fail check.
- Age confirmation checkbox (required): `input#over_18`, label "Ich bestätige, dass ich volljährig bin."
- Marketing/comms consent checkbox (optional): `input#gdpr`, label states leaving it blank opts out of all channels
- T&C + privacy policy checkbox (required): `input#terms_accept`, label links to "allgemeinen Geschäftsbedingungen" and "Datenschutzrichtlinie" — link destinations not verified in this pass
- Final submit button: visible text "SPIEL LOS!" — **not clicked**, per the scope note above

### Known gaps / things still needing verification

- No confirmation yet of a DE QA URL for Slingo in `helpers/brand-urls.ts` — needed before any pre-check spec can target QA instead of production
- Email field selector, PLZ field selector, and the username-regenerate button's selector all need one more inspection pass
- Negative-path validation on Step 1 and Step 2 fields is unverified
- Full end-to-end submission behavior (post-registration state, confirmation email/SMS) is unverified
- Cookie consent banner (`son-cookie-consent` component exists on the page) did not appear during this session — unclear if geo/cookie-state dependent; needs re-check with cleared cookies before assuming `dismissCookieConsent` will have something to dismiss on this flow
- Mobile viewport (Pixel 5) registration entry point not checked — per the known mobile-nav pattern (login/registration living inside the slide-out menu rather than the header on mobile), this DE flow likely needs its own mobile-specific verification pass
- Gender toggle buttons' underlying DOM attributes not captured — currently only verified by visible button text

---

*Findings added by: Cowork Agent (Claude) — 2026-07-13*

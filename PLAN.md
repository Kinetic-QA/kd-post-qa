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

---

## SNG AB Primary Nav — Category Locator Findings — Cowork Agent (Claude) — 2026-07-17

**For Claude CLI:** this is a findings-only entry explaining why the primary navigation categories (Home, Slots, Casino, Live Casino) on `https://qa-ab.spingenie.ca/` were not reliably detectable, plus the working locator. No code was written or changed.

### Root cause

`data-tk-value` ("home"/"slots"/"casino"/"liveCasino") is **not unique per page**. Each value appears on 3–4 elements simultaneously:
- The header logo link (desktop + a duplicate mobile copy), which also carries `data-tk-value="home"`
- In-page promotional/body or footer links that reuse the same tracking values (e.g. a body "Online Slots" link, a footer "Casino games" link)
- A hidden hamburger/drawer menu (`MainMenu_*` classes) duplicating the same four category links off-screen

Any locator matching on `data-tk-value` or `data-tk-type="category"` alone resolves to multiple elements → strict-mode/ambiguous match failure. This is almost certainly why detection failed.

CSS module classes (`Nav_slots__xUofK`, etc.) are hash-suffixed and not guaranteed stable across builds/deploys, so they shouldn't be relied on alone either.

### Confirmed DOM (visible bottom/primary nav bar)

```html
<div class="Nav_nav___GogH">
  <div class="Nav_level-one__960_J">
    <ul>
      <li class="Nav_active___LVUs">
        <a class="Nav_home__65mP4" data-tk-value="home" href="https://qa-ab.spingenie.ca/">Home</a>
      </li>
      <li>
        <a class="Nav_slots__xUofK" data-tk-type="category" data-tk-value="slots" href="https://qa-ab.spingenie.ca/slots/">Slots</a>
      </li>
      <li>
        <a class="Nav_casino__mMPT5" data-tk-type="category" data-tk-value="casino" href="https://qa-ab.spingenie.ca/casino/">Casino</a>
      </li>
      <li>
        <a class="Nav_liveCasino__lu9YM" data-tk-type="category" data-tk-value="liveCasino" href="https://qa-ab.spingenie.ca/live-casino/">Live Casino</a>
      </li>
    </ul>
  </div>
</div>
```

No `data-testid` exists anywhere in this nav.

### Working locator (Playwright)

Scope to the `Nav_nav___GogH` container, then match on `data-tk-value`:

```ts
const primaryNav = page.locator('div.Nav_nav___GogH');

await primaryNav.locator('a[data-tk-value="home"]').click();
await primaryNav.locator('a[data-tk-value="slots"]').click();
await primaryNav.locator('a[data-tk-value="casino"]').click();
await primaryNav.locator('a[data-tk-value="liveCasino"]').click();
```

Role-based equivalent:

```ts
await primaryNav.getByRole('link', { name: 'Slots', exact: true }).click();
```

**Avoid these** — each matches multiple elements on the page:

```ts
page.locator('[data-tk-value="slots"]')     // matches 4 elements (header logo, body link, drawer menu, nav)
page.locator('a[data-tk-type="category"]')  // matches header/body/menu duplicates too
page.locator('.Nav_slots__xUofK')           // works today, but hash suffix isn't guaranteed stable across builds
```

### Suggested follow-up

- Ask the dev team to add `data-testid` attributes to the four primary nav links (e.g. `nav-home`, `nav-slots`, `nav-casino`, `nav-live-casino`) to remove the need for container scoping or CSS-module class matching entirely.
- Flag the duplicate `data-tk-value` usage (header/body/drawer all reusing the same values as the primary nav) to the dev/analytics team — it's a tracking-accuracy risk independent of test automation.

---

*Findings added by: Cowork Agent (Claude) — 2026-07-17*

---

## MC (Mega Casino) UK Live Site — Manual DOM-Inspection Findings — Claude CLI — 2026-07-21

**For Claude CLI:** this is a findings-only entry from manually walking `https://www.megacasino.co.uk/` (live production, MC brand, UK GEO) after a full p1/p2/p3 suite run (desktop + mobile) came back 10 passed / 14 skipped / **24 failed**. No spec files or `geo-features.ts` were changed. `helpers/brand-urls.ts` already had full MC URL coverage before this session; no code changes were needed to make MC/UK resolvable.

### Platform confirmed same family as SC/SNG, different taxonomy

MC's homepage uses the same CSS-module naming convention as Slingo/SpinGenie (`Nav_`, `MainMenu_`, `Header_`, `Button_`, `GamesSlider_`, `MainBannerSlider_`) — same underlying template, not a different vendor. Category taxonomy differs though: `Nav_home`, `Nav_liveCasino`, `Nav_onlineSlots`, `Nav_casinoGames` (no Slots/Bingo/Casino naming like Slingo, no Slots/Megaways/Jackpots like SNG).

### Root cause #1 — promotional popup, timing unconfirmed on closer look (revised 2026-07-21, later same session)

Initial testing (a standalone script that did NOT call `setupCampaignPopupWatcher`) saw an offer popup (`Popup_popup__92LSJ` wrapping `OfferPopup_offer-popup__wBVUN`, close button `Popup_close__Pvbzv OfferPopup_close__bJLYp`) appear a few seconds after page load and block clicks, matching the known "collapses to 0×0, becomes visible later" pattern from `helpers/common.ts`'s `setupCampaignPopupWatcher` comments.

**However:** two follow-up attempts using the exact sequence real specs use (`setupCampaignPopupWatcher(page)` registered before `page.goto()`, then a 3.5s wait, matching `website-header.spec.ts`'s `beforeEach`) did **not** reproduce the popup at all across ~12s of observation each time, and the LOGIN click succeeded cleanly with no manual `dismissCampaignPopup` polling. This suggests the popup is frequency-capped (likely server-side — possibly by real IP, given repeated automated hits from the same office connection during this session — or tied to session/page-view count rather than a simple fixed delay after load), not a deterministic "always appears ~8s after load" behavior.

**Do not treat this as a confirmed, fixable timing bug.** I can't currently force the popup to reappear to test whether the existing `setupCampaignPopupWatcher` (MutationObserver + 500ms interval, already active in every spec's `beforeEach`) correctly handles it when it does show up. Shipping a speculative poll-longer fix to `dismissPopups`/`dismissCampaignPopup` — shared code every brand's suite depends on — isn't justified without being able to demonstrate the current mechanism actually fails. If this resurfaces in a future full-suite run, capture screenshots/video at the moment of failure (the suite already records these) before changing shared helper code.

### Root cause #2 — login/registration modal does not visually render on MC/UK (needs real investigation, not a selector fix)

This is the big one. Clicking the header's LOGIN button (confirmed unambiguous — scoped to `button[class*="Header_buttons"]`, ruling out the known locator-ambiguity pattern) correctly updates the URL to `#account`, but:
- A full-page screenshot immediately after shows the plain homepage — **no modal overlay ever appears visually**.
- `page.locator('input:visible').count()` = **0** anywhere on the page.
- `document.querySelector('son-auth-modals').shadowRoot` is `null` — either a closed shadow root or the component never actually mounts its form content — and `el.childElementCount` is only 2 (just the two light-DOM slot-anchor `<div>`s for "Report a problem", no real form).
- `page.content()` (full serialized DOM) contains no occurrence of "password" or "mobile number" anywhere.
- No iframe on the page corresponds to a login/registration form (the 5 iframes present are Partytown sandbox, an ad-tracking pixel, and blanks).

This is a **different, worse situation than Slingo DE's `<son-auth-modals>` widget** (see the DE findings entry above), which has a confirmed *open*, Playwright-inspectable shadow root. On MC/UK, the widget is either using a closed shadow root or genuinely not rendering its form — either way, this is not fixable with a better selector. This fully explains why `login.spec.ts`, `registration.spec.ts`, `login-widget.spec.ts`, `registration-widget.spec.ts`, and `feedback-form.spec.ts` all failed looking for fields that were never there to find.

**Not yet resolved — needs a follow-up session, ideally with a real second pair of eyes in a real (non-automated) browser:** is this a genuine MC/UK production bug (login literally broken for real visitors too), or does the modal need some additional trigger (longer wait, real mouse movement, a different entry point) that a plain scripted click doesn't provide? Recommend manually clicking LOGIN in a real browser on megacasino.co.uk before concluding this is a site bug worth reporting — same caution called out for SpinGenie's blog search finding on 2026-07-20.

### Contact-us page — findings-only, likely not a real bug

Manually revisiting `/contact/` in isolation (fresh page load, cookie consent dismissed) found the mailto link fine: `mailto:support@megacasino.com`. This suggests CU-01's failure in the full-suite run was environmental rather than a real missing-content bug (possibly the same popup seen earlier, though its timing/frequency is unconfirmed — see above), but this isn't fully proven either. Note for whenever `geo-features.ts` gets a real MC block: UK's `contactEmail` is `support@megacasino.com`, not carried over from any other brand.

### Help page — real gap, needs a fresh look

`button.accordion-button` (the selector `help-page.spec.ts` uses) matches 0 elements, and a broad case-insensitive scan for any class containing "accordion" also matched 0 elements — MC's `/help/` FAQ (if it has one in this form at all) does not use an accordion-style component with that naming. Needs a dedicated inspection pass on the actual `/help/` page structure before this spec can be adapted.

### Sidebar menu / game filter / search — inconclusive, re-run cleanly before trusting

These three checks were run back-to-back on the same page instance immediately after opening the hamburger menu, without confirming the menu had actually opened first — results (0 links found in `MainMenu_main-menu`, 0 `GamesSlider_wrapper`/game-link matches, search icon click timeout) are likely contaminated by that, not new findings. Don't treat these as confirmed gaps — they need a clean, isolated re-run (confirm menu is actually open via a visibility check, then inspect) before drawing any conclusion.

### Suggested next steps

1. Get a second, real-browser (non-automated) confirmation on whether MC/UK login is genuinely broken for real users, or a scripted-click-specific issue.
2. Re-run the sidebar/game-filter/search checks cleanly, one page-state at a time.
3. Inspect `/help/` page's real FAQ markup.
4. If the offer popup resurfaces in a future full-suite run, capture the exact moment (screenshots/video/trace are already recorded per test) rather than assuming it's the same fixed-delay behavior seen in this session's initial (non-representative) script — two follow-up attempts using the real watcher path couldn't reproduce it.
5. Once the above are resolved, populate a real `MC` block in `helpers/geo-features.ts` (currently falls back to the generic `FALLBACK` config) — per `AGENT-STANDARDS.md`, only with values confirmed live, not guessed.
6. MC test account credentials (`TEST_CREDENTIALS_MC_UK_USERNAME/PASSWORD`) are still needed in `.env` before `login.spec.ts` can pass even once the modal-rendering issue is understood.

---

*Findings added by: Claude CLI — 2026-07-21*

---

## MC (Mega Casino) UK — Root Cause Found: Cloudflare Bot Challenge — Claude CLI — 2026-07-22

**For Claude CLI:** re-ran the full MC/UK p1+p2+p3 suite against live (`TEST_BRAND=MC TEST_GEO=UK TEST_ENV=live`) to check whether yesterday's 24 failures could now pass. They can't yet, and the reason is different — and more concrete — than the 2026-07-21 entry's "modal doesn't render" theory. No spec files or `geo-features.ts` were changed; this is findings-only.

### What actually happens

This run: **16 failed, 7 skipped, 1 passed**. Nearly every failure was `page.goto: Timeout 15000ms exceeded` navigating to `https://www.megacasino.co.uk/` itself — the site never got in front of any test logic at all, unlike 2026-07-21's failures which were mid-flow (login modal, help accordion, etc.).

A standalone Playwright probe (headless Chromium, not part of the suite) confirmed the cause directly: the homepage response is a literal **Cloudflare Turnstile challenge page** — "Performing security verification... Verify you are human" — not the real site. `curl` without a browser User-Agent got `HTTP 403`; the same `curl` with a realistic browser UA got `HTTP 200`. Console showed `Failed to load resource: 403` on the document itself, plus failed requests to `challenges.cloudflare.com` and `brunhild.challenges.cloudflare.com` (Cloudflare's bot-challenge platform, `ERR_NAME_NOT_RESOLVED`/`401` — likely this environment's DNS/network blocking Cloudflare's own challenge asset domain, which would make the challenge un-passable even by a real user on this network).

This also explains yesterday's session's inconsistent results: one attempt at `website-header.spec.ts` in isolation loaded the real homepage fine and got as far as clicking LOGIN (but the URL never changed to `#account` — consistent with the click doing nothing on a challenge/interstitial), then the automatic retry immediately hit the same `page.goto` timeout. This matches the running suspicion in the 2026-07-21 entry that MC/UK's protection is **frequency/reputation-based** (repeated automated hits from this office IP), not a fixed timing quirk — Cloudflare is intermittently letting requests through and intermittently challenging them, from the same IP, in the same run.

### Why this changes the plan

- The 2026-07-21 "login modal doesn't visually render" and "help page has no accordion" findings are likely **symptoms of hitting the Cloudflare challenge page instead of the real site**, not confirmed product bugs. They should be re-verified once a real page is confirmed loading, not acted on as-is.
- This is not fixable with better selectors, longer waits, or `dismissCampaignPopup` changes — no test-suite change can solve a Cloudflare challenge served to this IP/network.
- Contact-us (`CU-01`) and footer-navigation (`FN-01`) failures in this run were also plain `goto` timeouts — same root cause, not the "environmental, likely not a real bug" theory from yesterday (which was closer to right, just for a different underlying reason).

### Suggested next steps

1. Don't spend more time adjusting MC/UK specs until this is resolved at the network level — re-running the suite as-is will keep intermittently failing.
2. Ask IT/dev whether this office network/IP is on any Cloudflare allowlist for MC/UK QA, or whether a corporate VPN egress (used for other multi-GEO brands per [[feedback_agent_standards_gotchas]]) avoids the challenge.
3. Once a run is confirmed to load the real homepage consistently (no Cloudflare interstitial in the screenshot), re-run the full MC/UK suite fresh — only then do the 2026-07-21 findings (login modal, help accordion, sidebar/search) deserve real investigation.
4. Still needed regardless: `TEST_CREDENTIALS_MC_UK_USERNAME/PASSWORD` in `.env`, and a real `MC` block in `helpers/geo-features.ts` once confirmed values exist.

---

*Findings added by: Claude CLI — 2026-07-22*

---

## MC (Mega Casino) UK — Narrowed to Auth-API-Level Bot Detection — Claude CLI — 2026-07-22 (later same session)

**For Claude CLI:** follow-up on the same-day entry above, live only (per instruction — do not test MC/UK against QA; QA is not representative of what the end user sees). Flushed local DNS cache and cleared `test-results/`/`playwright-report/` before retrying, and reproduced with the exact production helpers (`setupCampaignPopupWatcher`, `dismissCookieConsent`, `dismissCampaignPopup`) plus an extra 6s wait after popup dismissal before clicking LOGIN. No spec files changed — this was a standalone probe script, deleted after use.

### Cache-clear / longer-wait retry: partial improvement, real blocker found

- With DNS flushed and a longer wait after dismissing the campaign popup, the outer Cloudflare page-level challenge did **not** appear this time, and clicking LOGIN correctly advanced the URL to `#account` — an improvement over the earlier same-day run in this session.
- The campaign popup *does* appear on live (confirmed via screenshot — a "1st Deposit... LEARN MORE" overlay), just later than a short fixed wait accounts for. This matches the existing "frequency-capped, not fixed-delay" theory from 2026-07-21 — no code change made, `setupCampaignPopupWatcher`'s MutationObserver already exists to handle it whenever it appears.
- **However, the login modal still rendered empty** — `<son-auth-modals>` present with `childCount: 2` (same two light-DOM slot anchors as always), no shadow root, no visible inputs, even though the URL was correctly at `#account`.

### Real root cause, narrowed down: `/son-auth/config` API call is blocked, not the page

Network logging on the probe caught it directly: `HTTP 403 https://www.megacasino.co.uk/son-auth/config?lang=1` — the auth widget's own backend config call, which it presumably needs before it can mount its form.

Confirmed with `curl`:
- `son-auth/config` with no UA → `403`
- `son-auth/config` with a normal browser UA → `200`
- Main page (`/`) with a normal browser UA → `200`

So a plain UA-string check would explain the page-level block, but **it does not explain the Playwright failure** — Playwright's Chromium presents a fully realistic browser UA and still gets `403` on this specific endpoint while the main page loads fine under the same session. This points to bot-detection that specifically fingerprints automation (headless/CDP markers like `navigator.webdriver`) applied more strictly to the auth API than to the page itself — not something curl can detect or reproduce, and not something a longer wait, DNS flush, or cache clear can work around, since none of those touch automation fingerprinting.

### What this means

- This is **not fixable from the test side** — no amount of waiting, popup-handling, or cache-clearing changes whether the browser is detected as automated.
- This explains why login/registration/login-widget/registration-widget/feedback-form all fail: they all depend on `<son-auth-modals>` successfully mounting, which depends on this one API call succeeding.
- Per the earlier ask: this specific endpoint (or Playwright's automation fingerprint generally) needs an allowlist exception from whoever manages MC/UK's bot protection — the same conversation as the page-level Cloudflare ask, but now with a precise endpoint to point them at (`/son-auth/config`).

---

*Findings added by: Claude CLI — 2026-07-22 (follow-up)*

---

## MC (Mega Casino) UK — Confirmed NOT a Real Product Bug — Claude CLI — 2026-07-22 (final, same session)

**For Claude CLI:** the open question from 2026-07-21 ("is login genuinely broken for real users, or a scripted-click-specific issue?") is now resolved: **it is automation-specific, not a real bug.**

Reeve manually opened `https://www.megacasino.co.uk/` in a real (non-automated) browser during this session — no Cloudflare challenge appeared, and the login/registration modal opened and rendered normally. This directly confirms the theory from both same-day entries above: `/son-auth/config` (and possibly the outer page challenge too, depending on session) blocks specifically based on automation/headless-CDP fingerprinting, not a broken widget. A real user on the same network, same day, gets a fully working site.

### Conclusion

- **Not a product bug.** Do not file this as a MC/UK site defect.
- **Not fixable from the test suite.** No selector, wait, retry, cache-clear, or popup-timing change can make Playwright's automation fingerprint stop being detected — confirmed by the 30-second polled retry above finding zero change over time.
- The only real fix is an allowlist/exception from whoever manages MC/UK's bot protection, scoped to this QA runner or to `/son-auth/config` specifically — same ask as the two entries above, now with certainty this is worth asking for (it's blocking legitimate QA automation, not masking a real bug).
- Until that exception exists, `login.spec.ts`, `registration.spec.ts`, `login-widget.spec.ts`, `registration-widget.spec.ts`, and `feedback-form.spec.ts` are expected to keep failing on MC/UK live — this is a known, explained gap, not an unknown one.

---

*Findings added by: Claude CLI — 2026-07-22 (final)*

---

## MC (Mega Casino) UK — Onboarding Complete, Real Code Fixes Applied — Claude CLI — 2026-07-22 (session close)

**For Claude CLI:** per Reeve's request to finish MC/UK before moving to the next brand/GEO, went through every remaining unexplained failure from today's live full-suite runs (not just the auth cluster above) and either confirmed it as the known Cloudflare intermittency or fixed a real, brand-specific spec gap. Live only throughout, per instruction (QA is not representative of what end users see).

### Real code changes made this session

1. **`helpers/geo-features.ts`**: added a `MC` block (`UK` entry) — the first real MC config, replacing the silent `FALLBACK` it was using before. Every value is confirmed live today (blog/promotions/mobile-app pages exist, features/bingo-card-generator/payment-methods 404, currency `£`, contact email, social handles, search term/result pattern, game category nav). `hasTestAccount: false` — no MC/UK test account exists yet, same gap noted 2026-07-21.
2. New optional `gameTileHrefSubstrings` field on `GeoFeatureConfig` — MC's game category taxonomy (`/online-slots/`, `/casino-games/`, `/live-casino/`) is completely different from Slingo's hardcoded (`/slingo/`, `/slots/`, `/casino/`, `/bingo/`), which `game-filter.spec.ts` and `game-info-modal.spec.ts` had hardcoded directly. Defaults to the old Slingo-family array when omitted, so no other brand's behavior changes.
3. **`game-filter.spec.ts`**: now builds its game-link selector from `gameTileHrefSubstrings` instead of the hardcoded Slingo pattern. Confirmed fixed live (was failing on 0 matched games, now passes).
4. **`game-info-modal.spec.ts`**: three fixes, all confirmed live:
   - `findGameLink()` uses `gameTileHrefSubstrings` too (was the same hardcoded-pattern problem as game-filter).
   - Dropped the `box.y >= vh` upper bound in its viewport-sanity check — it was rejecting valid below-the-fold game tiles for no real benefit (`scrollIntoViewIfNeeded()` already runs right after regardless). Kept `box.y <= 100` to still exclude sticky-header duplicates.
   - Added `hoverRevealAncestor()`: MC's tile title link lives inside a hover-reveal overlay (`GameTile_tile-hover__*`, `visibility:hidden` with real reserved dimensions, not zero-size) that only becomes actually clickable once its ancestor tile is hovered — walks up to the nearest ancestor with a real bounding box and hovers that first. Confirmed this is what a real click needs; a forced hover on the zero-visibility link itself does not work. Applied at all 3 plain-click call sites; the 4th (hover-triggered Play It routing) already had its own hardened zero-size-safe handling from an earlier SNG AB finding and didn't need changes.
   - Confirmed live: Steps 1-5 now pass reliably (both a fresh run and its retry). Steps 6-9 (open game link in new tab) still fails intermittently — traced directly to the same Cloudflare challenge documented above, triggered by the new-tab's own navigation, not a code issue. Left as-is; re-run once Cloudflare access is sorted.
5. **`search.spec.ts`**: no code change needed — it was already fully driven by `searchResultHrefSubstrings`; just needed the new MC config entry.

### Confirmed NOT real bugs (Cloudflare noise, re-verified clean)

`game-category-navigation`, `banner`, `footer-regulations`, `footer-navigation` all failed in earlier same-day live runs and passed cleanly on a fresh run once the investigation's own repeated traffic had a chance to cool down. `sidebar-navigation`'s "Responsible Gaming" link timeout and `help-page`'s accordion-not-found were both confirmed to be the same intermittent Cloudflare challenge landing on a specific in-app navigation mid-test (confirmed via direct DOM checks: the sidebar link and the FAQ accordion both exist exactly as the specs expect) — not missing content, not a wrong selector.

### Remaining known gaps for MC/UK (not fixable from the test side)

- Cloudflare bot-detection intermittently blocks automated traffic — confirmed both at the page level and specifically on `/son-auth/config` (the auth widget's own backend call). Affects `login`, `registration`, `login-widget`, `registration-widget`, `feedback-form` reliably, and occasionally other specs on secondary navigations (help page, sidebar links, new-tab opens). Needs a Cloudflare allowlist exception for the QA runner — not a product bug, confirmed by Reeve opening the site in a real browser with no issue.
- No MC/UK test account yet (`TEST_CREDENTIALS_MC_UK_USERNAME/PASSWORD` needed in `.env`) — blocks `login.spec.ts`'s real successful-login test even once the above is resolved.

MC/UK is otherwise onboarded: real `geo-features.ts` config in place, brand-specific taxonomy handled generically (not hardcoded), and every failure from today's runs is now either fixed or precisely explained.

---

*Findings added by: Claude CLI — 2026-07-22 (session close)*

---

## MC (Mega Casino) UK — Blog/Promotions Findings — Claude CLI — 2026-07-22 (final)

**For Claude CLI:** correctly setting `hasBlog: true` and `hasPromotionsPage: true` in this session's new MC config (both confirmed real, 200 live) means `blog-page.spec.ts`, `blog-page-header.spec.ts`, `blog-sidebar.spec.ts`, and `promotions-page.spec.ts` now actually run for MC/UK instead of being silently skipped under the old `FALLBACK` — this is newly-exercised coverage, not something broken by today's changes. Investigated the two that failed.

### blog-page.spec.ts Step 1 ("no blog category link found") — same Cloudflare issue, not a logic bug

Read `navigateToBlogViaSidebar` (`helpers/common.ts`) and the category-matching logic in Step 1 carefully — both are correct. Manually confirmed live: MC's blog has real category links (`/blog/live-casino/`, `/blog/reviews/`, `/blog/exclusives/`, `/blog/slots/`, `/blog/promotions/`, `/blog/online-casino/`, `/blog/casino-games/`) that the existing regex-based matcher would correctly find. Re-ran the spec in isolation and captured the actual failure screenshot: the page was showing the same "Performing security verification" Cloudflare interstitial documented throughout this file, triggered by the sidebar-navigation step. No blog-page.spec.ts code change made — the logic is already correct.

### promotions-page.spec.ts Step 4 ("T&C text displayed in pop-up banner") — same Cloudflare issue, not a logic bug

Steps 1-3 passed consistently (confirmed twice). Manually confirmed MC's promotions page does show the expected text ("Bonus Policy applies" appears multiple times, matching `strings.bonusPolicyText`). Step 4 runs right after Step 3's internal `page.goto(promoPath!, ...)` re-navigation — captured the actual failure screenshot and it's the same interactive Cloudflare checkbox challenge (not the auto-resolving kind), which cannot be waited out. No promotions-page.spec.ts code change made — the logic is already correct.

### Conclusion

Every currently-known MC/UK failure — the original auth cluster, help-page, sidebar-navigation, contact-us-page, and now blog-page/promotions-page — traces back to exactly one root cause: intermittent Cloudflare bot-detection challenging this QA runner's automated traffic on secondary in-app navigations and the auth API. Nothing else remains unexplained. The path to a fully green MC/UK suite is the Cloudflare allowlist ask (or automation-fingerprint exception) plus a real MC/UK test account — both already flagged above, not new asks.

---

*Findings added by: Claude CLI — 2026-07-22 (final)*

---

## MC (Mega Casino) COM — Onboarded, Fully Green — Claude CLI — 2026-07-22

**For Claude CLI:** onboarded MC/COM immediately after MC/UK, tested from a Malta VPN/IP with a real test account (`TEST_CREDENTIALS_MC_COM_USERNAME/PASSWORD`, now in `.env`). Unlike UK, **no Cloudflare interference was seen on COM at any point this session** — plain `curl` (no UA) and browser-UA `curl` both returned clean `200`s throughout, and login/registration/feedback-form all passed normally. Started at 6 failures out of 24 (17 passed, 1 skipped originally under `FALLBACK`); ended at **18 passed, 0 failed, 6 skipped** after real fixes.

### Real code changes made

1. **`geo-features.ts`**: added the `MC.COM` block — same taxonomy as UK (`/online-slots/`, `/casino-games/`, `/live-casino/`), `€` currency, `support@megacasino.com` (same email as UK), no blog/features/mobile-app/bingo-card-generator, real payment page at `/payment-options/` (not the common `/payment-methods/`), no social media strip, `hasTestAccount: true`.
2. New optional `paymentMethodsPath` field (mirrors the existing `blogPath`/`promotionsPath` pattern) — `footer-navigation.spec.ts`'s Payment Options step now reads this instead of a hardcoded `/payment-methods/`. Defaults to the old hardcoded value when omitted, so no other brand changes behavior.
3. New optional `hasPromotionsIconInHeader` field — COM's promotions *page* exists, but its header has no dedicated Promotions icon at all (confirmed live: banner only contains the logo and search links). Distinct from `hasPromotionsPage`/`promotionsPath`. Gated the relevant steps in `website-header.spec.ts` (Step 4) and `promotions-page.spec.ts` (Step 6).
4. **`helpers/testData.ts`**: added `generateMalteseMobile()` (8-digit, real Maltese mobile prefixes 77/79/98/99). Root cause of registration's Step 0 failure: COM's mobile country-code dropdown auto-detects from the tester's real IP (Malta, confirmed `MT`/+356 — same auto-detect pattern as SC's ROW/DE, *not* SNG AB/CA's explicit-dropdown case), while the default `generateUKMobile()` produces a 10-digit UK-shaped number that Malta's 8-digit validation always rejects — confirmed empirically live (all-digit 8-length candidates passed regardless of prefix; length was the actual constraint, not the specific prefix).
5. **`registration.spec.ts`**: added `isMcComFormat` (same pattern as `isAlbertaFormat`/`isCanadianMobileFormat`) and wired it through three places: the mobile-generator selection, a new `fillComAddress()` function (COM's address step has no house-number field — same shape as IE/CA — but unlike IE, the country field is left alone since it already auto-detects correctly to Malta), and the consent-checkbox set (`['over_18', 'gdpr', 'terms_accept']` — MC has no Bingo vertical at all, so no `gdprBingo` checkbox exists, same reasoning already established for IE/ROW/CA).
6. **`game-info-modal.spec.ts`**: made the sticky-header/viewport fix from MC/UK more robust — added an explicit `window.scrollBy(0, -120)` nudge after `scrollIntoViewIfNeeded()` at both click call sites (Step 1 and Step 10), since `force: true` alone wasn't always enough to avoid the click point landing outside the viewport entirely. This is a generic improvement, not COM-specific — should help UK too.

### Result

MC/COM needed real, substantive fixes (not just Cloudflare noise like UK) — mobile number format, address-step shape, consent checkboxes, and a missing header icon — all now confirmed fixed live, twice (a targeted re-run and a full fresh suite run both came back clean). The 6 skips are genuine GEO gaps (no blog, no features page, no mobile-app page, no bingo-card-generator, no Bingo category, no social media strip) — correctly skipped, not silently masked.

---

*Findings added by: Claude CLI — 2026-07-22 (MC/COM)*

---

## MC (Mega Casino) CA — Onboarded, One Confirmed Real Bug Found — Claude CLI — 2026-07-22

**For Claude CLI:** onboarded MC/CA (path-prefixed at `/en-CA/`, per `brand-urls.ts`) immediately after COM, with a real test account (`TEST_CREDENTIALS_MC_CA_USERNAME/PASSWORD`, now in `.env`). Same taxonomy/platform as UK/COM — config work was quick. The important finding this GEO is a **suspected real, reproducible product bug**, not a config gap or automation-detection issue.

### Config added (same pattern as UK/COM)

Added `MC.CA` to `geo-features.ts`: same taxonomy (`/online-slots/`, `/casino-games/`, `/live-casino/`), `$` currency, `support@megacasino.com`, `paymentMethodsPath: 'payment-options/'`, `hasPromotionsIconInHeader: false` — all the same shape as COM. No blog/features/mobile-app/bingo-card-generator, no social media strip. `game-category-navigation.spec.ts` needed no changes at all — it already has per-category soft-skip logic and passed 18/18 standalone once retested cleanly (the earlier full-run failure was noise).

### Confirmed real bug: LOGIN/JOIN and other overlay widgets don't functionally open

Reproduced multiple times, at different points in the session (including after two separate cooldowns of 90s and 120s, ruling out simple rate-limit flakiness for this specific symptom): clicking **LOGIN or JOIN in the header does nothing** — no URL change to `#account`, zero network requests fired (not even a failed one — contrast with UK's `/son-auth/config` 403), no popup/new tab, and the click demonstrably lands on the real button (verified via `elementFromPoint`, not an intercepting overlay). This is different in shape from both UK's issue (automation-fingerprint-blocked API call) and SE's issue (deliberate Pay N Play model, a different but real login mechanism) — this looks like the interactive widget simply isn't wired up or isn't mounting on `/en-CA/`.

The same symptom reproduced on two other overlay-driven features this session: the **search panel** (URL can reach `#search` but the input never actually renders) and the **feedback form** (`contact-us-page.spec.ts`'s "Report a problem" link click never reaches `#account/feedback`). Plain page-to-page navigation (footer links, category pages, GCN, the contact page itself loading) all work fine — the pattern specifically affects client-side overlay/modal components, not the site generally.

**Set `hasAccountModal: false`** so specs that only incidentally check "does the modal open" (`game-info-modal`, `website-header`, `banner`, `sidebar-navigation`) skip just that assertion gracefully. **Deliberately left `hasLoginRegistration` at its default `true`** so `login.spec.ts`, `registration.spec.ts`, `login-widget.spec.ts`, and `registration-widget.spec.ts` keep failing and correctly flag this as unresolved — this should not be configured away, since it looks like a genuine, business-critical bug (Canadian users may not be able to log in or register at all), not a deliberate business-model difference to quietly accommodate.

**Recommend a real, non-automated browser check on `https://www.megacasino.com/en-CA/`** before escalating this further — same caution already applied to every other suspected-bug finding in this file. If a real browser also can't open LOGIN/JOIN/search, this is a live, customer-facing bug worth an urgent ticket, not a QA-automation artifact.

### Noise, not new findings

This session's cumulative testing volume against `megacasino.com` (COM immediately before CA, sharing the same domain) produced clear rate-limit-style noise late in this GEO's testing — several `page.goto` timeouts on the plain homepage that came and went across retries and cooldowns, unlike the LOGIN/JOIN symptom which reproduced identically every single time regardless of cooldown. Treat `help-page`'s and any other goto-timeout failures from this session as inconclusive — re-run cleanly, ideally after this domain has had a longer rest, before drawing conclusions from them.

---

*Findings added by: Claude CLI — 2026-07-22 (MC/CA)*

---

## MC (Mega Casino) CA — CORRECTION: Not a Real Bug, Was the Wrong VPN — Claude CLI — 2026-07-22 (later same session)

**For Claude CLI:** Reeve flagged that the VPN may not have actually been switched to Canada during the investigation above. Checked the outbound IP directly (`ipinfo.io`/`api.ipify.org`) and confirmed it is now genuinely Canada (Montreal, QC) — but that only proves the *current* IP, not what it was during the earlier test run, so the original "LOGIN/JOIN do nothing" finding could not be trusted as-is. Retested from scratch with the confirmed-Canada IP. **The earlier "confirmed real bug" conclusion above was wrong** — retract it. Correct explanation:

- With the right IP, `/son-auth/config` returns `200` (not blocked at all), and clicking LOGIN correctly advances the URL to `#account` within a few seconds.
- The actual username/password inputs are gated behind an **Altcha proof-of-work widget** inside the shadow root, which took 15-20+ seconds to fully resolve and reveal the real form fields in this session — much slower than UK/COM, but not broken. Polling for up to 20s (the same technique used elsewhere in this file to distinguish "slow" from "broken") confirmed the fields do appear.
- Re-ran `login.spec.ts` clean: **5/5 pass**, real login succeeds with `TEST_CREDENTIALS_MC_CA_USERNAME/PASSWORD`.
- Flipped `hasAccountModal` back to `true` in `geo-features.ts` (was incorrectly set to `false`).

### Real fix found once testing was actually against CA

With login now working, `registration.spec.ts` surfaced two genuine, brand/GEO-specific gaps (same class of finding as MC/COM, not automation-related):
1. **Mobile format** — same root cause as COM: default `generateUKMobile()` didn't match Canada's NANP format. Reused SNG's existing `generateCanadianMobile()` rather than adding a duplicate generator, since it already produces valid NANP numbers (confirmed live: a 403-area-code number is accepted). Country auto-detects to `CA` correctly with no explicit dropdown selection needed (same auto-detect pattern as COM/ROW/DE, not SNG AB/CA's explicit-selection case).
2. **DOB format** — confirmed live: same rejection SNG CA already found ("Please enter a valid year of birth" on UK-shaped DD/MM/YYYY). Reused the existing `generateCanadianDOB()` (year-first, dot-separated) rather than adding a new one.
3. Address step and consent-checkbox set assumed to match MC/COM's shape (same `fillComAddress`, same `['over_18', 'gdpr', 'terms_accept']` — no Bingo vertical) — not independently re-verified field-by-field, but consistent with same-brand-same-platform reasoning; flag for re-check if that step ever starts failing.

Added `isMcCaFormat` (mirrors `isMcComFormat`) in `registration.spec.ts`, wired through the mobile generator, DOB override, address function, and consent checkboxes.

### Final confirmed result

Full suite re-run clean: **18 passed, 0 failed, 6 skipped** (same 6 genuine GEO gaps as before: no blog, no features page, no mobile-app page, no bingo-card-generator, no Bingo category, no social media strip). `game-info-modal` (13/13) and `website-header` (9/9) both confirmed clean on dedicated re-runs. One flaky `website-header` failure during the full run turned out to be a one-off timing flake (closeAccountModal's Escape-key check) — re-ran standalone and got 9/9 clean.

### Lesson for future sessions

**Before trusting any "nothing happens"/"completely broken" finding on a market-specific domain, verify the actual outbound IP** (`curl https://ipinfo.io/json` or similar) rather than assuming the configured VPN is active. A wrong-market IP can produce symptoms that look exactly like a genuine broken feature (no network calls, no modal, no popup) when the real cause is a market-eligibility gate never even being reached. This cost real time and produced an incorrect report — worth double-checking VPN state as a first step whenever testing a region-locked market going forward.

---

*Findings added by: Claude CLI — 2026-07-22 (MC/CA correction)*

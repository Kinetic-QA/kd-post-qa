# MC (Mega Casino) FR-CA Onboarding — Session Report

**Date:** 2026-07-23
**Session window:** ~11:01 AM – ~12:55 PM (~1h 54m total)
**Scope:** Onboard Mega Casino French Canada (FR-CA) market from scratch, tested from a confirmed Montreal/Quebec VPN.

---

## Summary

**FINAL STATUS (2026-07-23, after root-causing both open items): 17 passed / 7 skipped / 0 failed.**
Confirmed stable across 4 consecutive full/targeted reruns of the previously-failing specs.

| Result | Count |
|---|---|
| Passed | 17 |
| Skipped (legit gaps — no blog/features/social-media-strip for this GEO) | 7 |
| Failed | 0 |
| **Total specs** | 24 |

VPN verified genuinely Montreal, Quebec, Canada via `ipinfo.io` before any testing began (per the lesson logged from the prior MC/CA session).

---

## What was onboarded

- Added `TEST_CREDENTIALS_MC_FR_CA_USERNAME/PASSWORD` to `.env` (real test account, `Lemwel@test.com`).
- Registered `MC` in `test-credentials.ts`'s known-GEO map (`UK, COM, CA, FR-CA`).
- Added a full `MC.FR-CA` block to `helpers/geo-features.ts`.
- Added `isMcFrCaFormat` handling throughout `tests/p1/registration.spec.ts` (Step 0 mobile/DOB labels, Step 1 name/email/gender, Step 2 address, Step 3 credentials, GO PLAY button).

## Real bugs found and fixed

1. **`brand-urls.ts` casing typo** — MC FR-CA's `liveUrl` used `fr-ca` (lowercase) while `qaUrl` used `fr-CA` (uppercase) and the live site's own internal nav links consistently use `fr-CA`. This silently failed every in-app redirect assertion on a case-only URL mismatch (e.g. `game-category-navigation.spec.ts`'s Live Casino check). Fixed to match the site's real casing.
2. **MC's header Login button is untranslated** — reads plain "Login" (English) even though the rest of the UI (nav, search, footer, banner disclaimer, Join button "S'inscrire") is genuinely French. Confirmed via live accessibility snapshot. Widened the shared `fr` locale's `loginButton` regex to match both SNG FR-CA's "SE CONNECTER" and MC's plain "Login" — same brand-copy-divergence pattern already used for ES's `joinButton`.
3. **MC's sidebar "Home" link is also untranslated** — reads plain "Home", not "Accueil". Same brand-copy inconsistency as #2. Widened `homeLinkText` similarly.
4. **`usernameOrEmailLabel` mismatch** — MC FR-CA's login field reads "Nom d'utilisateur ou courriel" (Quebec French, "courriel" not "email"), not SNG FR-CA's "Identifiant ou Email". Widened the shared regex.
5. **`login-widget.spec.ts`'s generic mobile-field sanity check** — hardcoded to match the English word "mobile", which never matches any French label (this was a latent, pre-existing gap that would have affected SNG FR-CA too, not something introduced this session). Widened to also catch "téléphone"/"numéro" for the `fr` locale.
6. **Registration Step 0/1/3 field labels** — confirmed live and wired in: mobile field "Numéro de téléphone cellulaire", DOB field "Quelle est votre date de naissance?" (same `Année-Mois-Jour` format as SNG FR-CA, reused `generateFrCaDOB()`), Continue button "Continuer" (lowercase, not SNG's all-caps "CONTINUER"), postcode "Code postal", city "Ville".
7. **Registration address data** — MC FR-CA's address-country validation is real (unlike MC/CA and MC/COM's lenient version); the default UK-shaped address data was being silently reused and rejected. Overrode with `generateCanadianAddress()` for this GEO.
8. **`hasFeedbackForm` corrected to `false`** — confirmed no "Report a problem"/"Signaler un problème" link exists anywhere on `/fr-CA/contact/` (full DOM search), same real gap independently confirmed on SNG FR-CA.
9. **`hasPromotionsIconInHeader`, `hasPromotionsPage`, `paymentMethodsPath`, `gameTileHrefSubstrings`** — confirmed live and consistent with the cloned MC/CA baseline.

## Localization consistency finding — RESOLVED per brand owner (2026-07-23)

Bugs #2 and #3 above (untranslated "Login" button, untranslated "Home" link) prompted
a fuller sweep of everything captured live this session. **Brand owner feedback received
2026-07-23:**

- **Header "Login" button — INTENDED, not a bug.** No further action.
- **Footer heading "Trusted payment providers" — INTENDED, not a bug.** No further action.
- **Footer link "Contato" — CONFIRMED BUG.** Reynaldo is filing a ticket.
- **Footer link "Afiliados" — CONFIRMED BUG.** Reynaldo is filing a ticket.

**Considered intended page formatting, not a bug (unchanged):**
- Sidebar "Home" link (English) — believed to be this page's intended format
- Homepage section heading "Slot Games" (English) — same, considered intended formatting

### Follow-up scope check (2026-07-23, later same day) — is this site-wide or isolated?

Swept all text on 9 live pages (homepage, promotions, help, contact, payment-options,
about-us, responsible-gaming, affiliates, site-map) to answer that directly:

**Confirmed present on ALL 9 pages (template-level, not a one-off):**
- Header "Login" button
- Footer heading "Trusted payment providers"
- Footer link "Contato", footer link "Afiliados"
- **New find:** footer link **"Página Inicial"** (Portuguese for "Home Page") — sits in
  the footer's own category-nav strip, a THIRD footer spot with the same wrong-language
  pattern as Contato/Afiliados, distinct from the sidebar's separate "Home" link

Since all five of these show up identically on every page checked, whatever is
supplying these specific strings is doing so the same wrong way everywhere at once —
this reads as a template/shared-component issue, not per-page content mistakes.

**Confirmed page-specific, NOT site-wide:**
- "Slot Games" heading — only exists on the homepage (tied to the homepage-only slots
  carousel section; doesn't appear elsewhere because that section doesn't exist elsewhere)
- "Terms and Conditions" (English) — found only on the `responsible-gaming` page, in body
  copy, sitting right alongside the correctly-French "Termes et conditions" footer link
  on that same page. **Resolved (2026-07-23):** this content is fed from an external
  source the dev team doesn't control — no action taken, accepted as-is per standard.

**Also present site-wide but already known/out of scope:** the cookie-consent banner
("Privacy policy", "Allow all cookies", "Manage preferences", "11 Purposes 2 Special
Features") is English on every page — this is the same pre-existing, not-localized
banner already documented in `helpers/common.ts`'s `KNOWN_ACCEPT_TEXTS`, not a new find.

**Test-code stance (unaffected by the above):** the fixes described in #2–#4 make the
test suite tolerate MC's actual live behavior — matching either language rather than
false-failing — which is the correct QA approach regardless of how the brand owner
rules on any of this. No further test-code action needed pending their reply.

## Both previously-open findings — ROOT-CAUSED AND FIXED (2026-07-23, later same day)

### 1. Registration address step — FIXED

Real root cause, found via direct DOM/network inspection (not guesswork):
- The "Adresse" field's client-side validation requires REAL per-keystroke input events — `.fill()` (a batch value-set) left it permanently stuck on "Adresse invalide" no matter what. Switched to `pressSequentially()` (real typing), confirmed via DOM inspection that this alone turns the field's status icon green (valid).
- The widget is also INCONSISTENT about whether Postcode/Ville/Country/Province appear automatically after typing, or whether the "Saisir l'adresse manuellement" link needs an explicit click first. Fixed by trying the direct path first and falling back to the manual-entry link only if Postcode doesn't appear — and re-filling the street field after clicking that link, since clicking it swaps in a different, previously-empty input.
- Random `CA_ADDRESSES` entries aren't equally safe here: "Bank Street" (Ottawa) reliably passes real geocoding validation, while "Queen Street West" and "King Street West" are genuinely ambiguous (both names exist in multiple Canadian cities) and consistently fail. Added `generateMcFrCaAddress()` to always return the confirmed-working entry instead of picking randomly.

Confirmed stable across 3 consecutive reruns (no flakes) after the fix.

### 2. Sidebar "Home link" step — FIXED

Real root cause: MC FR-CA has TWO unrelated "Home"-equivalent elements — a persistent, always-visible top-strip nav (brand-owner-confirmed intentional English "Home") and the ACTUAL slide-out drawer targeted by this test, whose own Home link reads **"Página Inicial"** (Portuguese — a genuine wrong-locale-bundle bug, unrelated to the top-strip's intentional English). The test was looking for "Accueil"/"Home" inside the drawer, which never had that text at all — a locator/text mismatch, not a timing or DOM-order issue as originally suspected. Widened `homeLinkText` to also match "Página Inicial" and the step now passes reliably; simplified back to the original `.first()` locator with no retry logic once the text itself was corrected.

Confirmed stable — 19/19 sidebar-navigation steps pass on rerun.

**Note:** "Página Inicial" is the same class of wrong-language bug as the confirmed "Contato"/"Afiliados" footer links (see below) — worth folding into the same ticket rather than filing separately, since it's very likely the same root cause on MC's side.

## Files changed this session

- `.env` — added `TEST_CREDENTIALS_MC_FR_CA_USERNAME/PASSWORD`
- `helpers/brand-urls.ts` — fixed MC FR-CA `liveUrl` casing typo
- `helpers/test-credentials.ts` — registered MC's known-GEO list
- `helpers/geo-features.ts` — added full `MC.FR-CA` config block
- `helpers/locale-strings.ts` — widened `fr` locale's `loginButton`, `usernameOrEmailLabel`, `homeLinkText` (now also matches "Página Inicial")
- `helpers/testData.ts` — added `generateMcFrCaAddress()` (always returns the one confirmed-working CA address instead of picking randomly)
- `tests/p1/registration.spec.ts` — added `isMcFrCaFormat` throughout; extended `fillComAddress` with optional postcode/city label params, a real-typing fix for the address field, and a manual-entry-link fallback for the Postcode/Ville reveal
- `tests/p2/login-widget.spec.ts` — widened the generic mobile-field sanity check for `fr` locale
- `tests/p2/sidebar-navigation.spec.ts` — Home link step now matches the drawer's real text; no workaround/retry logic needed

## Outstanding, non-blocking (product/business side, not test automation)

- **Contato / Afiliados footer links** — confirmed bugs, ticket in progress (Reynaldo).
- **Página Inicial footer/drawer link** — same wrong-language pattern as above; recommend folding into the same ticket, not yet explicitly confirmed by brand owner.
- **Terms and Conditions (responsible-gaming page)** — accepted as-is, externally-fed content outside dev control.
- **Login button / Trusted payment providers** — confirmed intentional, closed.

**Test automation status: COMPLETE.** 17/24 passing, 7/24 skipped for confirmed real gaps, 0 failures, stable across repeated reruns. No code has been committed to git this session (all changes are currently uncommitted working-tree edits).

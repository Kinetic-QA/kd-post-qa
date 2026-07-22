# MC (Mega Casino) Brand Onboarding — Session Report

**Date:** 2026-07-22
**Session window:** ~10:09 AM – ~5:55 PM (~7h 46m total)
**Scope:** Investigate and fix live test suite failures for MC/UK, then onboard MC/COM and MC/CA from scratch.

---

## Summary Table

| Task | Time Elapsed | Completion |
|---|---|---|
| MC/UK — investigate & fix | ~3h 22m (10:09 AM – 1:31 PM) | **~85%** — all fixable issues resolved; remainder blocked by an external Cloudflare access gap, not test code |
| MC/COM — onboard from scratch | ~1h 11m (1:32 PM – 2:43 PM) | **100%** — 18 passed / 0 failed / 6 skipped (legit gaps) |
| MC/CA — onboard, investigate, correct false finding | ~3h 10m (2:45 PM – 5:55 PM) | **100%** — 18 passed / 0 failed / 6 skipped (legit gaps) |
| **Total session** | **~7h 46m** | **3 of 10 MC markets onboarded** |

---

## Task 1: MC/UK (~3h 22m)

**Started from:** 24 failures out of 24 total specs, cause unknown.

**What was found:**
- Root cause is intermittent **Cloudflare bot-detection** — confirmed via direct DOM/network inspection, not guesswork. Blocks the auth widget's own backend call (`/son-auth/config`) specifically, and occasionally challenges other in-app navigations (help page, sidebar links, new-tab opens).
- Confirmed via a real, non-automated browser check that MC/UK login is **not actually broken for real users** — this is automation-fingerprint detection, not a product bug.

**What was fixed (real code changes):**
- Added the first real `geo-features.ts` config block for MC/UK (previously running on generic fallback values).
- Fixed 3 genuine spec bugs unrelated to Cloudflare: `game-filter.spec.ts` and `game-info-modal.spec.ts` had a different brand's URL taxonomy hardcoded (`/slots/`, `/casino/`, `/bingo/`) instead of MC's real one (`/online-slots/`, `/casino-games/`, `/live-casino/`) — generalized via a new `gameTileHrefSubstrings` config field so other brands are unaffected.
- Fixed a hover-reveal timing bug specific to MC's tile UI, plus a sticky-header/viewport click issue (later found to help other GEOs too).
- Confirmed 8 other specs (`game-category-navigation`, `banner`, `footer-regulations`, `footer-navigation`, `sidebar-navigation`, `help-page`, `blog-page`, `promotions-page`) have correct logic and are only blocked by the same intermittent Cloudflare wall — not real bugs.

**What's still blocking full completion (not something test code can fix):**
1. **Cloudflare allowlist exception** — needs whoever manages MC/UK's bot protection to exempt the QA runner (or the `/son-auth/config` path specifically). Blocks `login`, `registration`, `login-widget`, `registration-widget`, `feedback-form` reliably, and occasionally others.
2. **MC/UK test account** — `TEST_CREDENTIALS_MC_UK_USERNAME/PASSWORD` still doesn't exist.

**Why 85% and not 100%:** every piece of work actionable from this side (config, taxonomy fixes, root-cause diagnosis, confirming what is/isn't a real bug) is done. The remaining ~15% is organizational — an access request to another team plus a credential ask — not further engineering work.

---

## Task 2: MC/COM (~1h 11m)

**Started from:** 6 failures out of 24 (game-filter, game-info-modal, registration, search, contact-us-page, footer-navigation), no Cloudflare interference detected on this domain.

**Real fixes applied:**
1. Added the `MC.COM` block to `geo-features.ts` — same taxonomy as UK, `€` currency, real contact email, no blog/features/mobile-app/bingo-card-generator, real payment page at `/payment-options/` (not the common `/payment-methods/`), no social media strip.
2. **Registration mobile number** — country dropdown auto-detects from the tester's real IP (Malta), but the default generator produced UK-format 10-digit numbers Malta's form always rejects. Added `generateMalteseMobile()` (8-digit, real prefixes), confirmed empirically against the live form.
3. **Registration address step** — no house-number field, just an autocomplete field (same shape as Ireland/Canada). Added a matching `fillComAddress()`.
4. **Registration consent checkboxes** — MC has no Bingo vertical at all, so the `gdprBingo` checkbox doesn't exist. Fixed the checkbox set to match the existing Ireland/Canada precedent.
5. **Footer "Payment Options"** — real slug is `/payment-options/`, not the common `/payment-methods/`. Added a new `paymentMethodsPath` config field rather than hardcoding it.
6. **Header/promotions-page "Promotion icon"** — COM's header genuinely has no promotions icon (page exists, no header entry point). Added a `hasPromotionsIconInHeader` config flag.
7. Hardened a viewport/sticky-header click issue in `game-info-modal.spec.ts`.

**Result:** verified twice — a targeted re-run after each fix, then a full fresh suite run confirming **18 passed / 0 failed / 6 skipped**, no regressions.

---

## Task 3: MC/CA (~3h 10m, including a correction)

This task had two phases: an initial investigation (with an unnoticed VPN issue) and a correction phase after the mistake was caught.

### Phase 3a — Initial investigation (~2h 8m)

- Onboarded MC/CA (path-prefixed at `/en-CA/`) with real credentials.
- Config and taxonomy work mirrored COM (same platform).
- **Major finding at the time:** LOGIN/JOIN appeared to do absolutely nothing — no URL change, no network request, no popup. Concluded (incorrectly) this was a real, reproducible product bug and documented it as such, recommending manual verification before escalating.

### Phase 3b — Correction (~1h 2m)

- The user flagged that the VPN may not have actually been switched to Canada during testing.
- Verified the current outbound IP directly (`ipinfo.io`) — confirmed genuinely Canada.
- **Retested from scratch: the "broken login" finding was wrong.** With the correct IP:
  - `/son-auth/config` returns clean `200`s.
  - Login modal opens correctly; real form fields sit behind an **Altcha proof-of-work CAPTCHA** that takes 15-20+ seconds to resolve — slow, not broken.
  - `login.spec.ts` re-ran clean: **5/5 pass**, real login succeeds.
- Reverted the incorrect `hasAccountModal: false` config change back to `true`.
- With login now genuinely working, two real fixes surfaced (same class as COM):
  - **Mobile number format** — reused SNG's existing `generateCanadianMobile()` (real NANP format) instead of defaulting to a UK-shaped number.
  - **Date of birth format** — reused the existing `generateCanadianDOB()` (year-first, dot-separated); CA rejects the default DD/MM/YYYY, same issue already known for SNG/CA.
- `game-category-navigation.spec.ts` needed zero changes — already has graceful per-category skip logic.

**Final result:** full suite re-run clean — **18 passed / 0 failed / 6 skipped**. `login.spec.ts` (5/5), `registration.spec.ts` (6/6), `game-info-modal` (13/13), and `website-header` (9/9) all separately confirmed clean on dedicated re-runs.

**Lesson logged for future sessions:** before trusting any "nothing happens / completely broken" finding on a region-locked market, verify the actual outbound IP (`curl https://ipinfo.io/json`) rather than assuming the configured VPN is active. A wrong-market IP can produce symptoms indistinguishable from a genuine broken feature.

---

## Files Changed This Session

- `helpers/geo-features.ts` — added `MC.UK`, `MC.COM`, `MC.CA` config blocks; added `gameTileHrefSubstrings`, `paymentMethodsPath`, `hasPromotionsIconInHeader` fields
- `helpers/testData.ts` — added `generateMalteseMobile()`
- `tests/p1/game-filter.spec.ts` — taxonomy generalization
- `tests/p1/game-info-modal.spec.ts` — taxonomy generalization, hover-reveal fix, viewport/scroll fix
- `tests/p1/registration.spec.ts` — added `isMcComFormat`/`isMcCaFormat` branches, `fillComAddress()`
- `tests/p1/website-header.spec.ts` — `hasPromotionsIconInHeader` guard
- `tests/p2/promotions-page.spec.ts` — `hasPromotionsIconInHeader` guard
- `tests/p3/footer-navigation.spec.ts` — `paymentMethodsPath` config-driven fix
- `.env` — added `TEST_CREDENTIALS_MC_COM_*` and `TEST_CREDENTIALS_MC_CA_*`
- `PLAN.md` — full findings log for all three markets, including the CA correction

No code has been committed to git this session (all changes are currently uncommitted working-tree edits).

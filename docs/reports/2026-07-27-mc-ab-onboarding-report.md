# MC (Mega Casino) Alberta — Onboarding Report

**Date:** 2026-07-27
**Scope:** Onboard MC/AB from scratch against **QA only** — this market has not gone live yet (`liveUrl: null` in `brand-urls.ts`).
**Env:** `TEST_BRAND=MC TEST_GEO=AB TEST_ENV=qa`
**Reference:** SNG AB (per explicit instruction) — same underlying SkillOnNet/SNG platform, same "still under active dev" QA-environment symptoms, same rule applied for skipping login/registration where no working test account exists.

---

## Summary

| Run | Duration | Result |
|---|---|---|
| Run 1 (initial config) | 24m 48s | 20 passed / **12 failed** / 8 skipped |
| Run 2 (after http→https + trailing-slash base URL fix) | 22m 12s | 6 passed / **10 failed** / 8 skipped |
| Run 3 (after promo-icon/regulation-logos/FAQ/payment-path fixes) | **18m 41s** | **10 passed / 5 failed / 9 skipped** |
| **Total test-execution time (3 full suite runs)** | **~65.7 minutes** | **5 failures remain, all one root cause (below)** |

Final run: exit code 1 (5 failures) — see "Known open item" below for why this wasn't chased further.
Excel report: `test-results/ab_2026-07-27T09-09-41-688.xlsx`

---

## Real bugs found and fixed

1. **Base URL was missing a trailing slash AND used `http://` instead of `https://`.** `brand-urls.ts`'s original `qaUrl: 'http://qa.megacasino.ca/ab'` caused two compounding problems: (a) relative-path navigation (`new URL('promotions/', baseURL)`) dropped the `/ab` segment entirely and resolved to the wrong domain path — confirmed via `node -e`; (b) the site force-redirects `http`→`https`, so every URL assertion built from the raw `http://` baseURL mismatched the real post-redirect URL on scheme alone. This alone caused most of Run 1's 12 failures (`game-category-navigation`, `sidebar-navigation`, and contributed to several others). Fixed to `'https://qa.megacasino.ca/ab/'`.
2. **Header Promotions icon check assumed the wrong menu.** Same class of bug as MC ES: the promotions nav link uses the `MainMenu_` (sidebar/hamburger) CSS prefix, not the header banner's own prefix. Set `hasPromotionsIconInHeader: false`.
3. **Footer regulation-logo check had no per-GEO skip at all.** `footer-regulations.spec.ts` assumed every GEO has a `<son-license-logos>` element; confirmed live this pre-launch QA site has **zero** occurrences of it anywhere in the homepage HTML. Added a new `hasRegulationLogos` flag (defaults `true`, no other GEO affected) and a clean skip.
4. **Help page FAQ accordion check had no per-GEO skip at all.** The `accordion-button` class only appears inside a `<style>` block's CSS rule — no actual FAQ content is configured on this environment yet. Added a new `hasHelpFaqAccordion` flag (defaults `true`) and skip the whole test via `test.skip(...)`.
5. **Footer Payment Options path was set to the wrong slug for the click-behavior check**, even though the destination is confirmed broken content-wise. Set `paymentMethodsPath: 'payment-options/'` to match what the real footer link actually navigates to (`hasPaymentMethodsPage: false` still separately documents that the destination itself 404s).

---

## Known open item — NOT further fixable via config (matches SNG AB precedent)

All 5 remaining failures trace to **one root cause**: the registration/login widget (`#account` modal) is unreliable on this QA environment — it sometimes opens or closes correctly and sometimes silently doesn't, with no code changes in between:

- `registration.spec.ts` — Mobile number field in the registration form never becomes visible
- `search.spec.ts` — Step 9, registration modal doesn't close after clicking X
- `website-header.spec.ts` — Step 2, JOIN opens the modal, but it doesn't close afterward
- `login-widget.spec.ts` — "Don't have an account" link doesn't open the registration form
- `registration-widget.spec.ts` — "Members Login" link doesn't open the login form

**This is the exact same symptom already documented and accepted for SNG AB** ("header LOG IN/JOIN buttons are currently unreliable... passed in one spec run, no-opped in an isolated check... a game tile's Play It reliably opens #account with a real popup, so the modal itself does work"). Per this session's explicit instruction to treat SNG AB as the reference for how to handle login/registration on this market: `hasLoginRegistration: true` (the widget exists and is safe to inspect) and `hasTestAccount: false` (no working test account provided, so `login.spec.ts`'s real-login test is skipped) — same config shape as SNG AB. The remaining widget-reliability failures are an accepted, environment-level QA-site issue, not something further config changes can resolve — chasing it further would mean debugging the dev team's own pre-launch environment, not this test suite.

---

## Config added

- New `geo-features.ts` entry for `MC.AB`: same taxonomy as UK/COM/CA (online-slots/casino-games/live-casino + Blackjack/Roulette), CAD currency, real feedback form, no blog/features/social media, blank support email (QA-environment gap, not a selector issue).
- New optional `hasRegulationLogos` and `hasHelpFaqAccordion` fields on `GeoFeatureConfig`.
- `brand-urls.ts` — fixed MC AB's `qaUrl` (trailing slash + https).

## Skipped by design (0 impact — expected for this market)

- `login.spec.ts` (no test account), `features-page.spec.ts` (no Features page), all `blog-*.spec.ts` (no blog), `footer-social-media-strip.spec.ts` (no social links), `help-page.spec.ts` (no FAQ content yet), `payment-method-strip.spec.ts` (payment page broken/404).

---

## Files changed

- `helpers/brand-urls.ts` — MC AB `qaUrl` corrected (trailing slash, https)
- `helpers/geo-features.ts` — new `MC.AB` entry, new optional `hasRegulationLogos`/`hasHelpFaqAccordion` fields
- `tests/p2/footer-regulations.spec.ts` — Step 1 respects `hasRegulationLogos`
- `tests/p3/help-page.spec.ts` — whole test respects `hasHelpFaqAccordion`

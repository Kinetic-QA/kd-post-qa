# MC (Mega Casino) Spain — Onboarding Report

**Date:** 2026-07-27
**Scope:** Onboard MC/ES from scratch against the live site, tested from a confirmed Spain VPN.
**Env:** `TEST_BRAND=MC TEST_GEO=ES TEST_ENV=live`
**Test account:** shared SC/SNG/GC ES account (`noemsisters@hotmail.com`), provided this session — confirmed live, working.

---

## Summary

| Run | Duration | Result |
|---|---|---|
| Run 1 (initial, curl-derived config) | 17m 49s (1069s) | 20 passed / 4 failed / 1 skipped |
| Run 2 (after 5 config corrections) | **13m 09s (789s)** | **23 passed / 0 failed / 1 skipped** |
| **Total time spent (live verification + config + 2 full suite runs + fixes)** | **~55 minutes** | **MC/ES fully onboarded, 0 failures** |

Final run: `npx playwright test tests/p1 tests/p2 tests/p3` — exit code 0.
Excel report: `test-results/es_2026-07-27T07-09-35-819.xlsx`

MC/ES is a full desktop+mobile suite (24 spec files) — noticeably longer running time than the Nordic markets since almost nothing is skipped here (real login/registration, real blog, real promotions, real feedback form all exist and get fully exercised).

---

## What MC/ES is

Own domain (`megacasinos.es`), fully localized Spanish content, **traditional login/registration** (not a BankID/Pay N Play market like SE/DK) — real "Iniciar sesión"/"Únete" header buttons. Richer game-category taxonomy than most other MC markets: Slots, Todos los juegos (Casino), Ruleta/Ruleta en Vivo (Live Casino/Roulette), plus standalone Blackjack, Crash Games, Jackpots, Megaways, Slingo, and Providers categories.

---

## Real bugs found and fixed (test config, not site bugs)

MC ES's site consistently follows a pattern where the **English-slug page also returns 200 with real (translated) content**, but is **not what the real nav actually links to** — a trap that produced four separate wrong guesses this session, each only caught by watching the *real browser's* post-click URL, not by curling the static English slug and seeing 200:

1. **About Us** — guessed `about-us/` (200, real Spanish content); real sidebar/footer link actually points to `quienes-somos/`. Caught via `sidebar-navigation.spec.ts` timing out looking for the wrong href.
2. **Payment Options** — guessed `payment-options/` (200, real content); real footer link actually points to `metodos-de-pago/`. Caught via a soft-assertion mismatch in `footer-navigation.spec.ts`.
3. **Header Promotions icon** — curl found `data-tk-value="promotions"` links site-wide and assumed one lived in the header banner; a real browser check showed the header's own `<header role="banner">` has no promotions link at all — all instances found were in the sidebar/hamburger menu (already confirmed separately via `sidebar-navigation.spec.ts`). Fixed `hasPromotionsIconInHeader` to `false`; this fixed the identical failure in both `website-header.spec.ts` and `promotions-page.spec.ts`.
4. **Footer "Slots" link** — `footer-navigation.spec.ts` hardcoded an expected `/slots/` destination (never GEO-aware), and MC ES happens to be the first onboarded MC market with a footer link whose exact text is "Slots" — it correctly navigates to `/online-slots/`, which just didn't match the hardcoded path. Added a new `slotsPath` config field (defaults to `slots/`, so no other GEO is affected) and set it for MC ES — same pattern as the existing `casinoPath`/`aboutUsPath` fields.

---

## Config added

- New `geo-features.ts` entry for `MC.ES`: real blog, promotions (`promociones/`), payment page, feedback form ("Reportar un problema"), Facebook/Instagram (no Twitter/X), currency `€`, own-domain support email (`soporte@megacasinos.es`).
- New optional `slotsPath` field on `GeoFeatureConfig`, consumed by `footer-navigation.spec.ts`.
- `test-credentials.ts` — added `ES` to `MC`'s `KNOWN_GEOS_BY_BRAND` list.
- `.env` — added `TEST_CREDENTIALS_MC_ES_USERNAME/PASSWORD` (local-only, gitignored, not committed).

## Skipped by design (0 impact — expected for this market)

- `features-page.spec.ts` — no Features page exists for MC ES (`features/` and `funciones/` both 404).

---

## Files changed

- `helpers/geo-features.ts` — new `MC.ES` entry, new optional `slotsPath` field
- `helpers/test-credentials.ts` — `ES` added to `MC`'s known GEOs
- `tests/p3/footer-navigation.spec.ts` — Slots step now respects `slotsPath`

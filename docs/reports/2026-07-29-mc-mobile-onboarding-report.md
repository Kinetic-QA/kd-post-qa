# MC (Mega Casino) Mobile Coverage — Session Report

**Date:** 2026-07-29
**Scope:** Audit which MC markets actually had mobile coverage (as opposed to what CHANGELOG.md claimed), then run and fix the mobile suite for each gap found. Also picked up one follow-on ZI UK mobile item from the previous day's onboarding.

---

## Summary

Before today, CHANGELOG.md claimed several MC markets were "confirmed passing... desktop + mobile." Cross-checking against the actual session reports and code showed this was **not true** — only MC/DE had ever been mobile-tested. Today closed that gap for 5 of the remaining 8 markets.

| GEO | Result | Notes |
|---|---|---|
| ZI UK | 20 passed / 3 skipped / 1 real finding | 2 test-code gaps fixed; 1 genuine site finding remains open (see below) |
| MC/COM | 18 passed / 6 skipped / 0 failed | registration.spec.ts fixed |
| MC/CA | 18 passed / 6 skipped / 0 failed | registration.spec.ts + payment-method-strip.spec.ts fixed |
| MC/FR-CA | 16 passed / 7 skipped / 1 failed | registration.spec.ts fixed; 1 remaining failure is a pre-existing real site bug, not fixable from test code |
| MC/IE | 18 passed / 6 skipped / 0 failed | Clean first try, no fixes needed |
| MC/SE | 13 passed / 11 skipped / 0 failed | search.spec.ts fixed |
| MC/ES | 22 passed / 1 skipped / 0 hard failures | blog-page-header.spec.ts fixed; 1 flaky (known timing hiccup, passed on retry) |
| MC/DK, MC/AB | Not started | Carrying into next session |
| MC/UK | Still blocked | Cloudflare bot-detection, unrelated to mobile — not attempted |

**Every VPN switch was verified via `ipinfo.io` before running anything** (per the standing lesson from the MC/CA desktop session) — one mismatch caught (Vancouver instead of Alberta requested; user opted to proceed from a genuine Canadian IP instead of reconnecting).

---

## Corrected understanding: what CHANGELOG.md got wrong

Session reports for MC/COM, MC/CA, MC/FR-CA, MC/SE, MC/ES never actually ran a `-mobile` Playwright project or mentioned phone-screen testing — all were desktop-only runs, despite later CHANGELOG summary lines claiming "desktop + mobile." Only MC/DE's entry is accurate (it explicitly documents phone-screen testing and a mobile-specific bug fix). This was caught by reading the underlying per-session reports and code, not by trusting the summary rollups.

---

## Real bugs found and fixed (all in `tests/`, all confirmed live)

### `tests/p1/registration.spec.ts` — `isMcComFormat`/`isMcCaFormat`/`isMcFrCaFormat` were never wired into the mobile registration path
The desktop registration flow had brand-specific handling for MC's COM/CA/FR-CA markets; the **mobile** flow never got the equivalent branches added, so all three silently fell through to generic/wrong defaults:

- **MC/COM**: Steps 2–3 waited on a "House No./Name" field that doesn't exist (MC/COM's real address step is autocomplete-only, no house number) — fixed by routing through the existing CA-shaped mobile helpers. Step 5 also got the correct 3-checkbox consent set (MC has no Bingo vertical anywhere, confirmed on desktop).
- **MC/CA**: Step 0 was generating **UK-format mobile numbers** on a Canadian form — confirmed reproducible ("mobile not accepted after 10 attempts", not a one-off). Fixed to use `generateCanadianMobile()` + `generateCanadianDOB()`/`generateCanadianAddress()`, plus the same Step 2/3/5 gaps as COM.
- **MC/FR-CA**: Step 0 was looking for the **English** "Mobile number" field on a fully French UI. Fixed using the already-confirmed `mcFrCaStep0Labels` object (which existed for desktop but was never reused for mobile). Also corrected Continue-button casing — MC/FR-CA uses lowercase "Continuer" everywhere (confirmed on desktop), not SNG FR-CA's uppercase "CONTINUER", which the mobile code had assumed.

### `tests/p3/payment-method-strip.spec.ts` — duplicate non-functional link on MC/CA
The payment-options page's own details table has row-title links (e.g. "Mastercard") sharing the exact same `href` as the real logo icons further down the page. An unscoped `.first()` grabbed the table's row link instead of the real logo — clicking it didn't navigate anywhere (confirmed reproducible on both attempts). Fixed by scoping both the PayPal and Visa/Mastercard locators to `:has(img)`, matching how Step 1 already defines a "logo."

### `tests/p1/search.spec.ts` — Step 11 missing hash-recovery (MC/SE)
The same leftover `#search-gamepage/<slug>/` URL bug already fixed at Step 5 in this file (originally found on ZI UK) also affects Step 11's "Back" button, which had no recovery logic. Added the same `location.hash` reset. Confirmed stable across repeat runs — generic fix, benefits any brand/GEO hitting this shape.

### `tests/p3/blog-page-header.spec.ts` — Step 5 hamburger hidden on mobile (MC/ES)
The blog's own desktop-style hamburger icon is CSS-hidden at mobile breakpoints (same pattern as Step 3's search icon, already documented). The real mobile entry point is a plain "Menu" button (English text, even on the Spanish site) inside the blog's own bottom nav. Fixed with an `isMobile` branch scoped to that bottom nav.

### `tests/p1/website-header.spec.ts` — two ZI UK fixes (carried over from 2026-07-28 session)
- Step 2b: falls back to the sidebar's own Login button when no unified mobile "Play" button exists (ZI keeps Login/Join separate on mobile, unlike MC/SNG-family brands).
- Step 5: resets the hamburger toggle to a known-closed state before testing "open" — ZI's `searchRequiresSidebarOpen` flag (used in Step 3) left the toggle already open by the time Step 5 ran, so a single click closed it instead of opening it.

---

## Real site bugs found (NOT fixed — these need the brand owner / dev team, not test code)

1. **ZI UK — regulation/compliance logo row (GamCare, Gamstop, UKGC, GambleAware) is missing entirely on mobile.** Confirmed 0 links found across multiple runs (including the built-in slow-render retry poll). Present on desktop. Not yet reported to brand owner — still an open item.
2. **MC/FR-CA — the "Adresse" address-autocomplete field never returns suggestions to any automated session**, blocking registration Continue from ever advancing past Step 3, on both desktop (already documented from an earlier session) and now confirmed on mobile too. Postcode/city/province all auto-fill and validate correctly — only the address-autocomplete integration itself is broken. Needs a real (non-automated) browser check or a suggestions-API allowlist fix from whoever owns MC's address-autocomplete integration.

---

## Known flakes (not bugs, no action needed)

- MC/ES: `website-header.spec.ts`'s search-icon click didn't register on the first attempt, passed clean on retry — matches the same occasional click-timing hiccup already documented elsewhere in the project (e.g. Prime Casino Canada's mobile search-icon check).

---

## Files changed today

- `tests/p1/registration.spec.ts` — MC/COM, MC/CA, MC/FR-CA mobile wiring (Step 0 generators/labels, Steps 2/3 address shape, Step 5 consent checkboxes)
- `tests/p3/payment-method-strip.spec.ts` — `:has(img)` scoping fix for PayPal + Visa/Mastercard deep links
- `tests/p1/search.spec.ts` — Step 11 hash-recovery fix
- `tests/p3/blog-page-header.spec.ts` — Step 5 mobile hamburger fix
- `tests/p1/website-header.spec.ts` — ZI UK Step 2b + Step 5 fixes (carried over from 2026-07-28)
- `CHANGELOG.md` — today's entry added

---

## Next steps

1. Finish MC mobile: **DK** and **AB** still not attempted.
2. Decide what to do with the two open real-site findings (ZI regulation logos, MC/FR-CA address autocomplete) — ticket/escalate to brand owner or dev team.
3. Commit + push today's fixes (new branch, never direct to `main`, per project rules).

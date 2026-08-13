# Ice36 — Why "Game Info Modal" and "Login Widget" Are Still Showing In-Progress

**Date:** 2026-08-12
**For:** QA teammate re-checking Ice36 (I36) on the tracker
**Related:** CHANGELOG.md entry dated 2026-08-12, branch `docs/i36-game-modal-login-widget-notes`

## Short version

Both items are stuck at "in progress" because of a **real, confirmed bug on the live site** — not because testing is incomplete or the tracker is out of date. It's been flagged to the brand owner already, but hasn't been fixed on the site yet, so it'll keep showing up until that happens.

## What's actually happening

**Game Info Modal** — clicking into a game sometimes shows the site's own generic "Something went wrong" error screen instead of the real game details. This isn't one-off flakiness: it was reproduced repeatedly on its own, isolated re-runs. It shows up on **every** Ice36 market — UK, COM, IE, CA, ES, and DK.

**Login Widget** — the sign-in pop-up (and the search pop-up, which uses the exact same widget) sometimes doesn't open on the first click. Also confirmed on repeated tries, not a fluke. It shows up as:
- the **"Login Widget"** check on COM, IE, CA, ES, DK
- the plain **"Login"** check on UK specifically

Same underlying bug in both cases — it just happens to get caught by a different check depending on the market.

## What this means for your re-run

If you re-run any Ice36 market and these two items come back non-green again, that's expected — it's not something to chase as a new bug or a test-code problem. If they *do* come back fully clean on a given market, that's worth noting too (it would mean the site-side issue didn't reproduce that time, which is possible given it's intermittent, not constant).

Everything else on Ice36's checklist (Registration, Search, Game Category Navigation, Game Filter, Website Header, Registration Widget, Banner, Promotions Page, Sidebar Navigation, Contact Us, Footer Navigation, Help Page, Payment Method Strip) is confirmed clean across all six markets.

## Where this lives

- Full explanation added to `CHANGELOG.md` under **[Unreleased] - 2026-08-12** (pushed on branch `docs/i36-game-modal-login-widget-notes` — pull that branch, or wait for it to merge to `main`, to see it in your local copy).
- Tracker ("Web Release QA Automation Follow Up File.xlsx") — Ice36 brand tab shows the ◐ (partial) symbol on these two rows across the markets listed above; Rollout Status tab notes for each Ice36 market GEO reference the same shared bug.

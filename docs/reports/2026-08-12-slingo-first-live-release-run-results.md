# Slingo (SC) — First Live-Release Run Results, All 5 Countries

**Date:** 2026-08-12
**For:** Reeve / management follow-up on today's Slingo Slack update
**Related:** `docs/updates/2026-08-12-update.md`, `docs/merged-report-duration-caveat.md`, combined report `combined-reports/sc-combined-2026-08-12.xlsx`

## Short version

Clean run. Every country tested (UK, ES, IE, ROW, SE — desktop + mobile) came back **100% pass rate on everything actually checked, 0 real failures**. This is the first time this automated QA system was run against a real, live release rather than a dry run, and it held up.

## The numbers

| GEO | Checks | Passed | Skipped | Pass rate | Duration |
|---|---|---|---|---|---|
| UK | 24 | 24 | 0 | 100% | 15m 12s |
| UK-mobile | 24 | 24 | 0 | 100% | 15m 47s |
| ES | 24 | 24 | 0 | 100% | 17m 7s |
| ES-mobile | 24 | 24 | 0 | 100% | 16m 59s |
| ROW | 24 | 18 | 6 | 75% | 13m 19s |
| ROW-mobile | 24 | 18 | 6 | 75% | 13m 57s |
| IE | 24 | 19 | 5 | 79.2% | 11m 32s |
| IE-mobile | 24 | 19 | 5 | 79.2% | 11m 53s |
| SE | 24 | 11 | 13 | 45.8% | 6m 8s |
| SE-mobile | 24 | 11 | 13 | 45.8% | 5m 28s |

**Combined across everything:** 240 checks, 192 passed, 0 failed, 48 skipped. 80% of the full regression suite actually applies and ran (coverage); of what ran, 100% passed.

The skips are not a problem — every one of them is a feature that genuinely doesn't exist for that country (no Blog on ROW/IE/SE, no traditional login/registration on SE since it uses a different account flow, etc.), the same kind of expected, checklist-documented gap we've always had per-GEO. None of them are the false-skip bug we fixed on UK's footer earlier today.

**Actual test time: 2h 7m 22s** (Excel Grand Total Duration — see `docs/merged-report-duration-caveat.md` for why the merged HTML report's own number reads higher and shouldn't be quoted instead).

## Worth flagging

- **Automation Reliability: 2 checks needed a retry to pass** (1 on ES-mobile, 1 on ROW) — both self-healed on Playwright's built-in retry, so they're not counted as failures, but repeated flakiness like this is something to root-cause over time, not just let keep self-healing quietly.
- **The site glitch from earlier today showed up again, on a different run.** UK-mobile's footer navigation check hit the same "SOMETHING WENT WRONG → clears on reload" glitch on the Affiliates page that we found and fixed the false-skip for this morning. This time it's recorded as a side note in the Excel report instead of silently vanishing — confirms the new side-note feature works as intended, and confirms the underlying site glitch isn't a one-off, it's shown up on two separate runs today.

## What this means

- The two fixes made earlier today (UK footer false-skip logic, banner spec trimmed to functionality-only) held up under a full real run across every country — no regressions introduced.
- This run is safe to point to as the "it works" evidence for calling Slingo's automated release QA proven, pending your own review of the numbers above.
- The Affiliates-page glitch is now confirmed twice today (UK desktop this morning, UK-mobile this afternoon) — worth escalating to dev as a real, reproducible issue, not a fluke.

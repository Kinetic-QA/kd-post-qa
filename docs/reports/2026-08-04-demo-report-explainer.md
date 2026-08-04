# How We Report the Regression Run — Demo Explainer (Slingo / SC)

**Date:** 2026-08-04
**Purpose:** Prep notes for Thursday's demo — explains how the automated run's results get presented, and how that compares to the old manual process, so this can be turned into demo slides/talking points.

## The one-sentence pitch

The old manual regression check took **about 6 hours** for Slingo across all 6 markets, desktop and mobile. The automated suite does the same coverage in **about 2 hours**, unattended, and produces one shareable Excel file at the end instead of six people's worth of manually-typed notes.

## Where the "6 hours" number comes from

Pulled straight from the team's own manual tracker (`Regression Test SC 2.10.xlsx`, Summary tab) — this is real historical data, not an estimate:

| Market | Manual time spent |
|---|---|
| UK | 1h 11m |
| ES | 1h 30m |
| IE | 1h 28m |
| DE | 20m |
| SE | 29m |
| ROW | 1h 3m |
| **Total** | **~6h 1m** |

That total is one person, doing the same checklist by hand, market by market, writing down Pass/Fail for each item as they go.

## What the automated report looks like instead

Every run produces **one Excel workbook** — no separate files to hunt down, no manual tallying. It has two kinds of tabs:

### 1. A tab per market + device (e.g. "UK", "UK-mobile", "ES", "ES-mobile"...)

Each tab has two parts:
- **A summary block at the top**: run date, total checks, how many passed/failed/skipped, pass rate, total time, and how many checks were "flaky" (failed once but passed on an automatic retry — a sign of a one-off blip, not a real bug).
- **A detailed results table below**: every single check, with a plain-English **"What Went Wrong"** column for anything that failed (e.g. *"Waited for something to appear on the page, but it never showed up in time"*) plus the raw technical error next to it for anyone who wants to dig deeper. Nothing requires opening a browser or reading code to understand.

### 2. One "Summary" tab that rolls everything up

This is the tab to lead with in the demo — it answers the questions a non-technical stakeholder actually asks:

- **Grand Total Duration** — how long the whole run took, across every market and device.
- **Total Checks** — how many individual checks ran, and the passed/failed/skipped split.
- **Coverage %** — of everything the suite *could* check, how much actually got exercised this run (some checks legitimately don't apply to every market — e.g. a market with no blog skips the blog checks — that's expected, not a gap).
- **% Passed** — of what actually ran, how much came back clean.
- **Clean Run? (Yes/No)** — the headline verdict on the *site*: did everything pass. A "No" here means a real bug was found on the site — that's the automation doing its job, not failing at it.
- **Automation Reliability (Yes/No)** — a separate headline verdict on the *tooling*: were the results trustworthy, or did things need retries to settle. This is deliberately kept apart from "Clean Run" so a genuine bug we caught never gets confused with the checks themselves being flaky.
- A per-market/device duration breakdown at the bottom, so it's easy to point at which market took longest.

## Why this framing matters for the demo

The whole point we're demonstrating is **eliminating manual checking**, so the report should read like a stakeholder-facing dashboard, not a QA engineer's raw test log:
- Every technical failure is translated into a plain-English sentence first — the raw error is there, but it's not the first thing anyone reads.
- The two verdicts (site is clean vs. tooling is reliable) are separated on purpose, so a real bug we caught can't be mistaken for "the automation is broken."
- Coverage % vs. Pass % are also kept separate — a market that legitimately has fewer features isn't penalized for "missing" checks that don't apply to it.

## Suggested demo flow for Thursday

1. Open with the manual-vs-automated time comparison above (6h → ~2h).
2. Open the Summary tab first — walk through Grand Total Duration, Coverage %, Clean Run verdict.
3. Drop into one market's tab (recommend UK, since it's usually the largest) to show the level of per-check detail available if anyone wants it.
4. Point at the plain-English "What Went Wrong" column on any failure as the proof this doesn't require a QA engineer to interpret.
5. Close with the actual fresh run's numbers (see the combined report generated for this session) as the live proof, not just the historical estimate above.

*Once this session's fresh SC run across all 6 markets finishes, its actual total duration and pass/fail numbers replace the placeholder framing above in the live demo — this doc is the explainer/script, the generated `.xlsx` is the evidence.*

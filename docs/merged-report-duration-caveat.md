# Caveat: the merged HTML report's "duration" is not real test time for VPN-switch runs

**Found:** 2026-08-07, while merging a Slingo (SC) UK + Ireland VPN-switch run.

## What we saw

After merging UK and Ireland into one combined Playwright HTML report (see `merge-reports.cjs` / `docs/playwright-run-commands.md` section 4), the report's summary line said the run took **1.2 hours**. The Excel workbook covering the exact same two runs said **38 minutes**.

Both numbers are "correct" — they're just answering different questions.

## Root cause

Playwright's own merge logic (`node_modules/playwright/lib/runner/index.js`, function `mergeEndEvents`) computes the combined run's duration like this:

```js
startTime = Math.min(startTime, shardResult.startTime);
endTime = Math.max(endTime, shardResult.startTime + shardResult.duration);
duration = endTime - startTime;
```

In plain terms: it takes the real clock time the *earliest* run started, the real clock time the *latest* run finished, and calls the gap between them "the duration." This works fine for what Playwright actually built it for — sharded tests that all kick off back-to-back on the same machine at roughly the same time.

It does **not** work for our VPN-switch workflow: UK and Ireland are two completely separate `npx playwright test` invocations, run at two different real-world times, with a real gap in between while switching VPN and confirming. That gap — however long it happens to be — gets baked straight into the "duration" as if it were test-running time.

The Excel workbook's number is different math entirely: it sums each individual test's own recorded execution time, so idle time between invocations is never counted. That's why it stayed accurate (38 min) while the merged HTML report's number ballooned (1.2h).

## What this means going forward

- **The Excel workbook's Grand Total Duration is the trustworthy number** for "how long did testing actually take," for both single-GEO and VPN-switch multi-GEO runs.
- **The merged HTML report's duration is only meaningful for a run with no real-world gap in it** — e.g. a single-GEO run, or (in theory) multiple GEOs run back-to-back with no VPN-switch pause. For an actual VPN-switch sequence, its "duration" number should be treated as a real clock timestamp span, not a test-time metric, and should not be quoted to management as "how long the tests took."
- This is a limitation of Playwright's own merge tool, not a bug in our scripts — nothing to fix, just something to know before reading that number.

See also: `docs/FAQ-test-reports.md` (updated with a pointer to this caveat).

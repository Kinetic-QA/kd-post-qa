# PR #41 Merge Conflict Investigation & Resolution

**Date:** 2026-07-31
**PR:** [#41 — feat: onboard Ice36 (I36) UK, our 7th brand, plus MC DK/AB mobile closeout](https://github.com/Kinetic-QA/kd-post-qa/pull/41)
**Branch:** `feature/i36-uk-onboarding` (author: Reynaldo B)

## What happened

PR #41 was opened against `main` at a point where `main` was at commit `1c60ee0`
(2026-07-29). Before the PR could be merged, PR #40
(`feature/lp-ca-se-complete-psl-uk-onboarding` — Lord Ping CA/SE closeout +
Prime Slots UK onboarding) landed on `main` on 2026-07-30, moving `main` to
`fb9769c`. Both branches independently touched the same lines in a few shared
files (new brand flags added to the same lists/conditions), so GitHub reported
the PR as `CONFLICTING` / `mergeStateStatus: DIRTY`.

## Investigation

Checked out `feature/i36-uk-onboarding` locally and merged `origin/main` into
it to reproduce the conflict:

```
git switch -c fix/resolve-i36-uk-onboarding-conflicts origin/feature/i36-uk-onboarding
git merge origin/main --no-edit
```

Three files conflicted:

1. **`helpers/test-credentials.ts`** — both branches added a new brand key to
   `KNOWN_GEOS_BY_BRAND` (I36 on one side, PSL on the other). Non-overlapping,
   additive changes.
2. **`tests/p1/registration.spec.ts`** — both branches added their own new
   brand flag (`isI36NoBingoFormat`, `isPslUkFormat`) to the same two OR
   conditions (one for the mobile Step 5 consent-checkbox shape, one for the
   desktop Step 3 equivalent). Both flags are legitimately declared earlier in
   the file by each respective branch — non-overlapping, additive changes.
3. **`CHANGELOG.md`** — both branches added separate bullets to the same
   `## [Unreleased] - 2026-07-30` section (I36 UK onboarding notes vs. LP
   CA/SE + PSL UK onboarding notes). Both sets of content are real and needed
   to be kept, just re-ordered into the correct `Automation Coverage Status` /
   `Added` / `Fixed` / `Known open items` structure per `CLAUDE.md`'s
   CHANGELOG rules.

No logic actually conflicted — every conflict was two brands' worth of
additive changes landing on the same lines. Nothing needed to be dropped.

## Resolution

- `helpers/test-credentials.ts`: kept both `I36` and `PSL` entries in
  `KNOWN_GEOS_BY_BRAND`.
- `tests/p1/registration.spec.ts`: merged both conditions into a single OR
  list containing `isI36NoBingoFormat || isPslUkFormat` (plus the existing
  flags), in both the mobile and desktop occurrences. Verified both flag
  variables are declared in the merged file (lines 206 and 224).
- `CHANGELOG.md`: combined both branches' Coverage Status bullets, Added
  bullets, Fixed bullets, and Known-open-items bullets into one unified
  `## [Unreleased] - 2026-07-30` section, preserving every entry from both
  sides.
- Ran `npx tsc --noEmit` after resolving — no type errors.
- Committed the merge (`392d96e`) and pushed it directly to
  `feature/i36-uk-onboarding` on origin (per Reeve's confirmation, since this
  is the PR's own branch).

## Result

`gh pr view 41` now reports `"mergeable":"MERGEABLE"`. The PR is no longer
blocked by a merge conflict; any remaining `BLOCKED` status is from other
required checks (e.g. review/CI gates), not the conflict.

## Follow-up

None required — this was a mechanical additive-conflict resolution, no
behavior changed beyond what each original branch already intended.

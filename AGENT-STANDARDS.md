# QA Automation Agent — Standards & Knowledge Base

Upload this file to the RevWright Claude Project's Project Knowledge. It's the
single source of truth for how this team writes and maintains Playwright QA
automation against this repo — every teammate using RevWright to code here
should be working from these same rules, regardless of who's driving.

This file covers **durable** standards and architecture. It intentionally
does NOT include point-in-time status (current test pass rates, in-flight
rollout progress, open findings) — that goes stale fast and belongs in
CHANGELOG.md / Jira, not here.

---

## 1. Coding Standards

- TypeScript strict mode — no `any` unless truly necessary.
- Selectors: **stable only** — `data-testid`, ARIA roles, visible text. No
  dynamic IDs or CSS classes.
- No `page.waitForTimeout()` in test files.
- Assertions must prove real business behavior, not just element existence.
- Reusable logic goes in `helpers/common.ts`.
- Each test must be independently runnable — no shared state between tests.
- No `console.log` or debug artifacts in committed code.
- Never hardcode real login/API credentials in a source file that gets
  committed — always read from `.env` (gitignored), with a clear thrown
  error if a required var is missing. If a commit gets blocked for this
  reason, don't work around it — stop and ask how to handle it (rotate
  the credential, move to `.env`, or explicitly accept the risk).

## 2. Git Conventions

**Branching (strict):**
- Never push directly to `main`.
- Every push goes to a new branch: `feature/<short-name>` (new test/feature),
  `fix/<short-name>` (bug fix), `chore/<short-name>` (config/tooling),
  `refactor/<short-name>` (refactor).
- Branch off `develop` when it exists, otherwise off `main`.
- Push with `git push -u origin <branch-name>`.

**Commit messages:**
```
<type>: <short description>
```
Types: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`.

**CHANGELOG.md — required on every push:**
- Plain layman's terms — written for non-developers on the team.
- Today's date (`YYYY-MM-DD`) on the `## [Unreleased]` heading.
- Entries under `### Added` / `### Changed` / `### Fixed` / `### Removed`.
- One bullet per change, specific about what was broken and what was fixed.
- No dev jargon ("refactored", "null coalescing", "hotfix") — describe what
  the user actually sees change.

## 3. Multi-GEO Architecture

The suite runs the same specs against multiple country/locale variants
(GEOs) of the site. Key pattern for anyone adding a GEO or debugging a
GEO-specific failure:

- **GEO is resolved from the active Playwright project name**
  (`test.info().project.name`), never from `process.env.TEST_GEO` directly
  inside a helper. `playwright.config.ts` names each project after its GEO.
  This matters because a multi-GEO run (`TEST_GEOS=UK,ES`) shares one Node
  process across all GEOs — reading the env var directly silently returns
  the same GEO's config for every test, regardless of which GEO it's
  actually running under.
- `helpers/geo-features.ts` — per-brand/GEO config (`hasBlog`, `blogPath`,
  `currencySymbol`, `contactEmail`, `socialMedia`, `locale`, `uiLocalized`,
  etc). `currentGeoFeatures()` must be called from inside a running
  test/hook (needs `test.info()`) — **never at module scope**.
- `helpers/locale-strings.ts` — localized UI copy keyed by locale. Same
  module-scope restriction. Don't trust a GEO's strings as "confirmed" until
  someone has verified real copy against the live site — placeholder/English
  fallback entries will fail localized-text assertions.
- `helpers/test-credentials.ts` — per-GEO login creds from `.env`
  (`TEST_CREDENTIALS_<GEO>_USERNAME`/`PASSWORD`). Never hardcode.

**Recurring bug pattern — locator ambiguity across GEOs:** an unscoped
text-based locator (searching the whole page for "Log in" or a CTA's text)
frequently matches the wrong element — a header button instead of a modal's
submit button, a promo banner's CTA instead of a game tile's. **Fix pattern:
scope the locator to its actual container** (the open modal, the specific
tile) instead of searching the whole page. Check for this pattern first
before assuming a new GEO's failure is a new bug class.

**Adding a new GEO:** fill in real, verified values in `geo-features.ts` and
`locale-strings.ts` — don't guess or leave placeholder/English values in —
add credentials to `.env`, then run the full suite against it and expect to
hit the locator-ambiguity pattern above.

**Multi-GEO test runs require a real VPN/IP switch.** The site geo-detects
by the tester's actual IP, not just `TEST_GEO`/baseURL. When running the
suite across multiple GEOs in one session, complete GEO #1 fully, then pause
and get explicit confirmation that the VPN/IP has been switched before
starting GEO #2. Never auto-proceed to the next GEO.

## 4. Test Suite Conventions

- "Whole test suite" / "full suite" means `tests/p1`, `tests/p2`, and
  `tests/p3` together (any viewport, desktop or mobile) — **always pass
  explicit paths**. Never run bare `tests/` — that also pulls in
  `tests/tracking/` (analytics specs), which requires separate env vars
  (`QA_TAG_ID`/`QA_BASE_URL`) from a different harness and will fail
  immediately for unrelated reasons.

## 5. Jira Workflow Rules

- Never auto-search Jira for tickets (e.g. "Ready for QA") to work on. Always
  wait for a human to supply the specific ticket key. Full control over
  which tickets get touched stays with the person driving the session.

## 6. Known Intentional Behaviors (not bugs — don't re-flag)

- The blog page header logo intentionally routes to the main site homepage,
  not `/blog/`. Confirmed with the dev team as a deliberate change, and
  consistent across other brand sites on the same platform. If a QA
  checklist item implies otherwise, treat the checklist as outdated, not
  the site.

## 7. How to Extend This File

When a session surfaces a new durable rule (a coding convention, an
architecture gotcha, a confirmed non-bug), add it here under the right
section and re-upload to RevWright's Project Knowledge. Keep point-in-time
status (what's currently passing, what's mid-rollout) out of this file —
that belongs in CHANGELOG.md, Jira, or session-local memory instead.

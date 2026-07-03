# Changelog

All notable changes to the **kd-post-qa** Playwright automation suite must be recorded here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

> ⚠️ **MANDATORY RULE:** Every push or pull request MUST include an update to this file.
> PRs without a CHANGELOG entry will be blocked by the GitHub Actions workflow.

---

## Format

Each release or change set uses this structure:

```
## [Unreleased]
### Added      — new tests, features, or helpers
### Changed    — updates to existing tests or config
### Fixed      — bug fixes or flaky test corrections
### Removed    — deleted tests or deprecated helpers
### Security   — security-related changes
```

---

## [Unreleased] - 2026-07-03

### Added

- **New helper tool that connects to the CMS (Strapi) for all 9 brands** — Genting Casino, ICE36, Lord Ping, Mega Casino, Prime Casino, Prime Slots, Slingo, Spin Genie, and Zingo Bingo. This lets the QA agent look inside each brand's CMS to check things like promotions and game pages, using credentials that are stored securely on each person's own machine and never shared or exposed.

- **The QA agent now automatically checks the CMS when a ticket needs it** — If a Jira ticket mentions "CMS" or "Strapi" in its title or description, the agent now connects to the right brand's CMS on its own and reports what it finds, right alongside the usual test results in the Jira comment. No one needs to remember to run anything manually.

- **The agent will ask before guessing which brand a ticket belongs to** — If a CMS-related ticket comes from a project the agent hasn't seen before, it stops and asks a person to confirm which brand it is, instead of assuming. Once confirmed, it remembers the answer so it never has to ask again for that project.

- **New diagnostic tools for checking CMS access** — Small command-line tools were added to confirm CMS login credentials are set up correctly and working for any brand, and to list out everything available inside a brand's CMS (useful for scoping future QA work).

### Changed

- **CMS-only tickets are now left for manual review, not auto-approved or rejected** — If a ticket is purely about CMS content and doesn't match any existing automated test, the agent reports its CMS findings but deliberately does not move the ticket forward on its own, since there isn't yet an agreed definition of "pass" for CMS-only checks. A person still needs to review and move those tickets manually.

### Notes for the team

- This is a first step: the CMS agent can currently see what's in the CMS (e.g. confirm a promotion or game entry exists) but does not yet judge whether the content itself is correct or matches what was asked for. What counts as a "pass" for a CMS check is still to be decided.
- Used the new tool today to check ticket GSP-2 (Genting Safe Play CMS templates) — confirmed none of the 25 planned templates have been built in the CMS yet, which matches the ticket's "To Do" status.

---

## [Unreleased] - 2026-07-02 (2)

### Fixed

- **Two tracking tests were silently broken** — `google-analytics.spec.ts` and `meta-pixel.spec.ts` were left pointing at the wrong file path and referencing a misspelled setting name (`QA_QA_BASE_URL` instead of `QA_BASE_URL`) after being moved into a new folder in an earlier update. Both tests would fail to even start. Fixed the path and the typo so they run normally again.

---

## [Unreleased] - 2026-07-02

### Added

- **14 new automated regression tests** covering site areas that had no automated coverage before: Website Header, Game Filter, Promotions Page, Banner, Registration Widget, Login Widget, Footer Regulations, Payment Method Strip, Features Page, Help Page, Blog Page, Blog Page Header, Blog Sidebar, and Footer Social Media Strip. Every one of these was run against the live site and fixed until it passed for real — not just written and left untested.

### Changed

- **Test folders reorganized to match the official QA priority checklist** — Several existing tests were filed under the wrong priority folder (e.g. Game Information Modal and Game Category Navigation were sitting in the P2 folder but are actually P1). They've been moved to match the spreadsheet the team uses to rank what matters most, including two spots where the spreadsheet's own reviewer comment overrode the initial ranking (Feedback Form moved up to P1, Contact Us Page moved down to P3).
- **Features Page and Help Page tests now enter through the sidebar menu** instead of jumping straight to the page's web address — this matches how an actual visitor would reach those pages, so the test also confirms the menu link itself works.

### Fixed

- **Registration test updated for a recent site change** — the "Enter password" step no longer exists on the live registration form (the password field shows immediately), so the test was updated to match.
- **Flaky test runs caused by the cookie banner** — during long test runs, the cookie consent popup would occasionally still be on screen a beat after the test expected it to be gone, causing random click failures. The dismiss logic now keeps retrying for a few seconds instead of giving up after one attempt.
- **"Forgot Password" test was racing ahead too fast** — it was only waiting for the login button to disappear (which happens almost instantly) before moving to the next check, so it never actually gave the password-reset window time to finish appearing on screen. It now waits the full time that window actually takes to load.
- **Removed a leftover script** that printed a confusing "no results found" message in the terminal even when every test passed — it was duplicate, broken reporting logic left over from earlier work; the real Excel/HTML reports were never affected.

### Notes for the team

- Confirmed with dev: the blog page's logo intentionally links to the main homepage, not the blog homepage — this matches other brand sites and is not a bug.
- Confirmed with dev: the mobile banner is currently 750×360px. The 750×484px size in the checklist is a newer banner format already live on other brands (MC, GC, SNG) but not yet rolled out to Slingo — the test is written to expect the new size so it'll start passing automatically once Slingo gets the update.

---

## [Unreleased] - 2026-06-30

### Added

- **Meta Pixel tag checker** — New automated check (`tests/p1/tracking/meta-pixel.spec.ts`) that crawls every page on the QA site and verifies the Facebook Pixel script is present, `fbq()` is initialised, and the correct Pixel ID is the one that was fired. On any failure it attaches a screenshot of the broken page to the Jira comment.

- **Full Jira workflow transition map** — All 17 transition IDs for the SC/SNG workflow are now documented and loaded into both `.env` and `.env.example`. Previously only 3 were wired up; the rest (QA Rejected, Reopened, Production QA, Post Release QA, Released, Done no QA, Rejected, and all globals) were missing.

- **Tracking test types added to agent header** — `google analytics`, `meta pixel`, `tiktok pixel`, and `google tag manager` are now listed in the agent's supported test types comment.

### Changed

- **Failed QA checks now move ticket to QA Rejected** — Previously when a Playwright test failed, the ticket was left silently in "In Review". It now transitions to QA Rejected (which moves it to Reopened status) so the developer knows it needs attention.

- **AI interpreter now returns structured output** — The ticket interpreter previously returned just a test type string. It now returns `testType`, `checkItems` (bullet points for the Jira comment scope section), `params` (brand, GEO, tag ID), and `confidence`. Low-confidence matches are flagged in the console.

- **Jira comment scope bullets now match the ticket** — The "Scope Checked" section in the QA comment used to show a generic label. It now lists the actual check items extracted from the ticket by the AI interpreter.

- **Agent reads brand + GEO to resolve the correct QA URL** — When the interpreter extracts a brand and GEO from the ticket (e.g. `[SNG AB]`), the agent looks up the matching QA environment from `helpers/brand-urls.ts` and runs the test against that URL instead of the default.

- **`.env.example` fully updated** — All 17 transition IDs are now documented with comments explaining which state each one moves a ticket from and to.

### Fixed

- **TypeScript error in ticket interpreter** — `Object.fromEntries` on `parsed.params` was inferred as `{ [k: string]: unknown }` which conflicted with `Record<string, string>`. Fixed with an explicit type predicate on the filter callback.

- **`meta pixel` test type now routes to real spec** — Previously `meta pixel` tickets pointed to `not-implemented.spec.ts` and would always fail with a "not implemented" error. They now run the new Meta Pixel spec.

### Security

- **Patched `form-data` CRLF injection vulnerability** — `form-data` was pinned to 4.0.5 which contained a high-severity CRLF injection flaw (GHSA-hmw2-7cc7-3qxx) allowing malicious multipart field names or filenames to inject arbitrary headers. Bumped to 4.0.6 via `npm audit fix`. No code changes required.

---

## [Unreleased] - 2026-06-25

### Fixed

- **Screenshots now save correctly** — Evidence screenshots taken during login tests were being saved to a folder called `playwright-results/` that never existed on disk. They now go to `test-results/`, and that folder is automatically created if it doesn't exist yet. This means screenshot evidence will no longer silently disappear during test runs.

- **Excel test report now generates properly** — The command to produce the Excel report was pointing at a JavaScript file that doesn't exist. It now correctly runs the Python script (`generate-report.py`). The `test-results/` folder it writes into is also created automatically so the report never fails on a fresh machine.

- **Jira images now show up in comments** — When the agent posted QA results as a comment on a Jira ticket, any screenshots attached were not displaying — only broken image placeholders appeared. This was caused by using the wrong URL field when building the comment. Now fixed so screenshots render correctly inside the Jira comment.

- **Global setup and teardown scripts now actually run** — Two important scripts (`global-setup.ts` and `global-teardown.ts`) existed in the project but were never wired up to Playwright. This meant pre-test setup and post-test Excel report generation were silently skipped on every run. Both are now properly registered.

- **Transition checker no longer crashes without a ticket number** — Running `npm run check-transitions` without providing a Jira ticket key would crash with a confusing error. It now shows a clear usage message instead.

- **`form-data` package now properly declared** — A package used for uploading screenshots to Jira was only included indirectly through another dependency. It is now explicitly listed in `package.json` to prevent it from breaking if dependencies are updated.

### Added

- **`CLAUDE.md`** — Added a rules file to the repo that documents session rules, CHANGELOG requirements, branch naming conventions, and coding standards. This file loads automatically so the rules are always in context.

- **`requirements.txt`** — Added a Python dependencies file listing `openpyxl` (required for `generate-report.py`). New team members can now install Python dependencies with a single command.

## [Unreleased] - 2026-06-24

### Added

**Jira QA Agent (`src/agent.ts`)**
- CLI: `npx ts-node src/agent.ts <TICKET-KEY> [--dry-run]`
- Full automated QA workflow: fetch ticket → detect test type → transition to In Review → run Playwright → upload screenshots → post ADF comment → transition to Approved (or leave in In Review on failure)

**Agent source files**
- `src/jira-client.ts` — Jira REST API v3 wrapper (fetch ticket, transition, comment, upload attachment)
- `src/requirements-parser.ts` — Extracts `Test Type: <value>` keyword from ticket description
- `src/test-runner.ts` — Maps 10 test types to Playwright spec files, runs tests, parses results
- `src/ticket-interpreter.ts` — AI fallback (Claude Sonnet): reads free-form ticket text and identifies the test type when no keyword is present. Requires `ANTHROPIC_API_KEY` in `.env`
- `src/check-transitions.ts` — Diagnostic script to list available Jira workflow transitions for a ticket
- `src/browser-runner.ts` — Standalone login/logout runner with evidence screenshots

**Config & dependencies**
- `.env.example` updated with `ANTHROPIC_API_KEY` for the AI interpreter (optional)
- `@anthropic-ai/sdk` added as a runtime dependency
- `npm run agent` and `npm run check-transitions` scripts added to `package.json`

### Changed

**Test type detection in `src/agent.ts`**
- Now tries keyword match first (`Test Type: login` in description) — fast, no API cost
- Falls back to AI interpreter if no keyword is found — Claude Sonnet reads the ticket and picks the closest match
- Error message updated to explain both options when neither method resolves a test type

## [1.0.0] - 2026-06-23

### Added
- Initial Playwright automation suite for Slingo (https://www.slingo.com)
- P1 tests (17 tests across 5 files):
  - `tests/p1/login.spec.ts` — Login flow validation
  - `tests/p1/registration.spec.ts` — User registration flow
  - `tests/p1/search.spec.ts` — Search functionality
  - `tests/p1/blog-search.spec.ts` — Blog search
  - `tests/p1/feedback-form.spec.ts` — Feedback form submission
- P2 tests (5 files):
  - `tests/p2/contact-us-page.spec.ts`
  - `tests/p2/footer-navigation.spec.ts`
  - `tests/p2/game-category-navigation.spec.ts`
  - `tests/p2/game-info-modal.spec.ts`
  - `tests/p2/sidebar-navigation.spec.ts`
- Shared helpers: `helpers/common.ts`, `helpers/testData.ts`
- Global setup/teardown: `global-setup.ts`, `global-teardown.ts`
- Excel test report generator: `excel-reporter.cjs`, `generate-report.py`
- Playwright config targeting ZingoBingo with hash-based routing support
- TypeScript config (ESNext module, bundler resolution)
- Repository structure, `.gitignore`, PR template, CONTRIBUTING guide
- GitHub Actions workflow enforcing CHANGELOG updates on every PR

---

[Unreleased - 2026-06-24]: https://github.com/ed-pacson/kd-post-qa/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ed-pacson/kd-post-qa/releases/tag/v1.0.0

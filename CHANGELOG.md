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

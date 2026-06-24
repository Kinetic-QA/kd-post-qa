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

## [Unreleased]

### Added
- `src/agent.ts` — Jira QA Agent CLI (`npx ts-node src/agent.ts <TICKET-KEY> [--dry-run]`). Automates the full QA workflow: transition ticket to In Review, run Playwright login/logout test against qa.slingo.com, post a formatted ADF comment with screenshots, then transition to Approved (or leave in In Review on failure).
- `src/jira-client.ts` — Axios-based Jira REST API v3 wrapper (getTicket, transitionTicket, addComment, addCommentAdf, uploadAttachment, getTransitions).
- `src/browser-runner.ts` — Playwright login/logout test runner that captures two evidence screenshots (logged-out state before, logged-in state after).
- `src/requirements-parser.ts` — Parses ticket description for URL, username, and password credentials.
- `src/check-transitions.ts` — Diagnostic script to list all available workflow transitions for any given ticket key.
- `.env.example` — Template for required environment variables (JIRA credentials, transition IDs, QA base URL).
- `JIRAWorkflow.png` — Visual reference diagram of the SC project Jira workflow states and verified transition IDs.
- `npm run agent` and `npm run check-transitions` scripts added to `package.json`.
- `axios` and `dotenv` runtime dependencies; `ts-node` dev dependency added to `package.json`.
- `src/**/*.ts` added to `tsconfig.json` include paths.

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

[Unreleased]: https://github.com/ed-pacson/kd-post-qa/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ed-pacson/kd-post-qa/releases/tag/v1.0.0

# Contributing to kd-post-qa

## ⚠️ Mandatory Rule: Update CHANGELOG.md on Every Push

Every change pushed to this repository **must** include an update to `CHANGELOG.md`.  
This is enforced automatically — PRs without a CHANGELOG update will be blocked.

See [CHANGELOG.md](../CHANGELOG.md) for the format. Add your entry under `## [Unreleased]`.

---

## Getting Started

1. Clone the repo and install dependencies (see [README.md](../README.md))
2. Install local git hooks to catch issues before pushing:
   ```bash
   bash scripts/setup-hooks.sh
   ```

---

## Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| New test | `feature/<short-name>` | `feature/homepage-banner-check` |
| Bug fix | `fix/<short-name>` | `fix/login-selector-update` |
| Refactor | `refactor/<short-name>` | `refactor/extract-nav-helper` |
| Config change | `chore/<short-name>` | `chore/update-base-url` |

---

## Commit Message Format

```
<type>: <short description>

Examples:
feat: add P2 footer navigation tests
fix: update login selector for new markup
refactor: extract search helper to common.ts
chore: update playwright to 1.61.0
```

Types: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`

---

## PR Workflow

1. Branch off `develop` (not `main`)
2. Write your tests — follow the coding standards below
3. Run tests locally: `npx playwright test`
4. Update `CHANGELOG.md` under `## [Unreleased]`
5. Open PR targeting `develop`
6. Fill out the PR template fully
7. Request review from a team member
8. Only merge to `main` after QA sign-off

---

## Coding Standards

| Area | Rule |
|------|------|
| TypeScript | Strict mode. No `any` unless truly necessary. |
| Selectors | Stable only — `data-testid`, ARIA roles, visible text. No dynamic IDs or CSS classes. |
| Waits | Use Playwright built-in auto-waiting and `expect().toBeVisible()`. No `waitForTimeout`. |
| Assertions | Prove real business behavior. Not just element existence. |
| Helpers | Extract reusable logic to `helpers/common.ts`. |
| Test isolation | Each test must be independently runnable. No shared state between tests. |

---

## File Locations

| What | Where |
|------|-------|
| P1 (critical) tests | `tests/p1/` |
| P2 (high priority) tests | `tests/p2/` |
| P3 (lower priority) tests | `tests/p3/` |
| Shared helpers | `helpers/common.ts` |
| Test data | `helpers/testData.ts` |
| Config | `playwright.config.ts` |
| Changelog | `CHANGELOG.md` |

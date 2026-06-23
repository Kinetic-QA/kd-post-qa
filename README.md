# kd-post-qa — Playwright Automation Suite

Post-QA sanity check automation for [ZingoBingo](https://www.zingobingo.co.uk) using Playwright + TypeScript.

---

## Project Structure

```
playwright/
├── tests/
│   ├── p1/               # Critical — must pass before any release
│   ├── p2/               # High priority
│   ├── p3/               # Lower priority / exploratory
│   └── sample/           # Reference examples (not part of suite)
├── helpers/
│   ├── common.ts         # Shared utilities and page actions
│   └── testData.ts       # Test data constants
├── global-setup.ts       # Runs once before all tests
├── global-teardown.ts    # Runs once after all tests
├── excel-reporter.cjs    # Generates Excel test reports
├── generate-report.py    # Python report helper
├── playwright.config.ts  # Main config (baseURL, retries, reporters)
├── tsconfig.json
├── package.json
├── CHANGELOG.md          # ← Updated on every push (mandatory)
└── .github/
    ├── PULL_REQUEST_TEMPLATE.md
    ├── CONTRIBUTING.md
    └── workflows/
        └── changelog-check.yml
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- Git

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/ed-pacson/kd-post-qa.git
cd kd-post-qa

# 2. Install dependencies
npm install

# 3. Install Playwright browsers
npx playwright install

# 4. (Optional) Install local git hooks
bash scripts/setup-hooks.sh
```

---

## Running Tests

```bash
# Run all tests
npx playwright test

# Run P1 tests only
npx playwright test tests/p1/

# Run P2 tests only
npx playwright test tests/p2/

# Run a specific file
npx playwright test tests/p1/login.spec.ts

# Run with UI mode (interactive)
npx playwright test --ui

# Run headed (visible browser)
npx playwright test --headed

# Generate HTML report
npx playwright show-report
```

---

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Stable, production-ready tests |
| `develop` | Integration branch — all feature branches merge here first |
| `feature/<name>` | New test or feature work |
| `fix/<name>` | Bug fix or flaky test correction |

---

## Mandatory: Update CHANGELOG.md on Every Push

Every commit that gets pushed must include an update to `CHANGELOG.md`.  
See [CHANGELOG.md](./CHANGELOG.md) for the format.  
The GitHub Actions workflow will **block your PR** if CHANGELOG.md was not modified.

---

## Contributing

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) for full guidelines.

import { defineConfig } from '@playwright/test';

// Separate from the root playwright.config.ts on purpose: these are pure-logic
// tests for the JIRA Checker's comment shape, so they need no browser, no
// global setup (site pre-flight pings) and must not be swept up by the
// regression suite's "All Tests" run. Run with:
//   npx playwright test -c gui/tests/playwright.config.ts
export default defineConfig({
  testDir: '.',
  outputDir: '../../test-results/jira-checker-unit',
  reporter: 'line',
});

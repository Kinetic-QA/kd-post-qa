import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  globalSetup: './global-setup',
  globalTeardown: './global-teardown',
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'on-failure' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
    ['./excel-reporter.cjs'],
  ],

  use: {
    baseURL: 'https://www.slingo.com',
    headless: false,
    viewport: { width: 1280, height: 720 },
    screenshot: 'on',
    video: 'on',
    trace: 'on',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  outputDir: 'test-results/',
});

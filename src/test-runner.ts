import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface TestRunResult {
  success: boolean;
  testType: string;
  testFile: string;
  durationMs: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: string[];
  screenshotPaths: string[];
}

export const TEST_MAP: Record<string, string> = {
  'login':                    'tests/p1/login.spec.ts',
  'registration':             'tests/p1/registration.spec.ts',
  'search':                   'tests/p1/search.spec.ts',
  'game category navigation': 'tests/p1/game-category-navigation.spec.ts',
  'game info modal':          'tests/p1/game-info-modal.spec.ts',
  'feedback form':            'tests/p1/feedback-form.spec.ts',
  'website header':           'tests/p1/website-header.spec.ts',
  'game filter':              'tests/p1/game-filter.spec.ts',
  'sidebar navigation':       'tests/p2/sidebar-navigation.spec.ts',
  'promotions page':          'tests/p2/promotions-page.spec.ts',
  'banner':                   'tests/p2/banner.spec.ts',
  'registration widget':      'tests/p2/registration-widget.spec.ts',
  'login widget':             'tests/p2/login-widget.spec.ts',
  'footer regulations':       'tests/p2/footer-regulations.spec.ts',
  'contact us':               'tests/p3/contact-us-page.spec.ts',
  'footer navigation':        'tests/p3/footer-navigation.spec.ts',
  'blog search':              'tests/p3/blog-search.spec.ts',
  'payment method strip':     'tests/p3/payment-method-strip.spec.ts',
  'features page':            'tests/p3/features-page.spec.ts',
  'help page':                'tests/p3/help-page.spec.ts',
  'blog page':                'tests/p3/blog-page.spec.ts',
  'blog page header':         'tests/p3/blog-page-header.spec.ts',
  'blog sidebar':             'tests/p3/blog-sidebar.spec.ts',
  'footer social media strip': 'tests/p3/footer-social-media-strip.spec.ts',
  // Tracking tag checkers
  'google analytics':         'tests/tracking/google-analytics.spec.ts',
  'meta pixel':               'tests/tracking/meta-pixel.spec.ts',
  'tiktok pixel':             'tests/tracking/not-implemented.spec.ts',
  'google tag manager':       'tests/tracking/not-implemented.spec.ts',
};

export const SUPPORTED_TEST_TYPES = Object.keys(TEST_MAP);

export function resolveTestFile(testType: string): string | undefined {
  return TEST_MAP[testType.toLowerCase().trim()];
}

function walkSuites(
  suites: any[],
  out: { passed: number; failed: number; skipped: number; errors: string[]; screenshotPaths: string[] },
) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        for (const r of t.results || []) {
          if (r.status === 'passed') out.passed++;
          else if (r.status === 'skipped') out.skipped++;
          else out.failed++;

          for (const err of r.errors || []) {
            const msg = (err.message ?? err.value ?? '')
              .toString()
              .replace(/\x1B\[[0-9;]*m/g, '') // strip ANSI colour codes
              .replace(/\n/g, ' ')
              .substring(0, 400);
            if (msg) out.errors.push(msg);
          }

          for (const att of r.attachments || []) {
            if (att.contentType?.startsWith('image/') && att.path && fs.existsSync(att.path)) {
              out.screenshotPaths.push(att.path);
            }
          }
        }
      }
    }
    walkSuites(suite.suites || [], out);
  }
}

export function runPlaywrightTest(testType: string, testFile: string): TestRunResult {
  const resultsPath = path.join(process.cwd(), 'test-results', 'results.json');

  if (fs.existsSync(resultsPath)) fs.unlinkSync(resultsPath);
  fs.mkdirSync(path.join(process.cwd(), 'test-results'), { recursive: true });

  const start = Date.now();

  const proc = spawnSync('npx', ['playwright', 'test', testFile], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CI: 'true', // suppresses HTML report auto-open on failure
    },
    timeout: 300_000,
    encoding: 'utf-8',
    shell: true,
  });

  const durationMs = Date.now() - start;
  const success = proc.status === 0;

  const out = {
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: [] as string[],
    screenshotPaths: [] as string[],
  };

  if (fs.existsSync(resultsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
      walkSuites(data.suites || [], out);
    } catch { /* malformed results.json — use fallback */ }
  }

  // Fallback if results.json was not written (e.g. playwright crashed before writing)
  if (out.passed === 0 && out.failed === 0 && out.skipped === 0) {
    if (success) {
      out.passed = 1;
    } else {
      out.failed = 1;
      const stderr = (proc.stderr ?? '').substring(0, 400).trim();
      if (stderr) out.errors.push(stderr);
    }
  }

  return { success, testType, testFile, durationMs, ...out };
}

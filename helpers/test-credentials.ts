import { test } from '@playwright/test';

/**
 * Live-site login credentials, keyed by Playwright project name (== GEO —
 * see playwright.config.ts). Read from env vars (see .env, gitignored) so
 * real credentials never end up in source control — add a
 * TEST_CREDENTIALS_<GEO>_USERNAME/PASSWORD pair before a GEO's
 * login.spec.ts run can pass; unmapped GEOs fall back to UK's.
 */
const KNOWN_GEOS = ['UK', 'ES'];

function credentialsFor(geo: string): { username: string; password: string } {
  const username = process.env[`TEST_CREDENTIALS_${geo}_USERNAME`];
  const password = process.env[`TEST_CREDENTIALS_${geo}_PASSWORD`];
  if (!username || !password) {
    throw new Error(
      `Missing TEST_CREDENTIALS_${geo}_USERNAME / TEST_CREDENTIALS_${geo}_PASSWORD in .env — ` +
      `see .env.example or ask the team for the current test account for this GEO.`
    );
  }
  return { username, password };
}

/** Must be called from inside a running test/hook (uses test.info()). */
export function currentTestCredentials(): { username: string; password: string } {
  const geo = test.info().project.name;
  return credentialsFor(KNOWN_GEOS.includes(geo) ? geo : 'UK');
}

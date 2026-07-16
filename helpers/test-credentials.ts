import { test } from '@playwright/test';

/**
 * Live-site login credentials, keyed by brand + Playwright project name
 * (project name == GEO — see playwright.config.ts). Read from env vars (see
 * .env, gitignored) so real credentials never end up in source control.
 *
 * Every brand has its OWN test account per GEO — credentials are NOT
 * interchangeable across brands even when the GEO code matches (e.g. SC/UK
 * and SNG/UK are different accounts on different sites). Preferred env var
 * name is TEST_CREDENTIALS_<BRAND>_<GEO>_USERNAME/PASSWORD.
 *
 * Falls back to the brand-less TEST_CREDENTIALS_<GEO>_USERNAME/PASSWORD form
 * for backward compatibility with .env entries written before multi-brand
 * support existed — those were all implicitly Slingo (SC), so the fallback
 * only fires for brand 'SC'. Add the brand-qualified pair for any other
 * brand; don't rely on a brand-less fallback for a non-SC brand, since
 * there's nothing to safely fall back to.
 */
const KNOWN_GEOS_BY_BRAND: Record<string, string[]> = {
  SC: ['UK', 'ES', 'IE', 'ROW', 'DE'],
};

function credentialsFor(brand: string, geo: string): { username: string; password: string } {
  let username = process.env[`TEST_CREDENTIALS_${brand}_${geo}_USERNAME`];
  let password = process.env[`TEST_CREDENTIALS_${brand}_${geo}_PASSWORD`];
  if ((!username || !password) && brand === 'SC') {
    username = process.env[`TEST_CREDENTIALS_${geo}_USERNAME`];
    password = process.env[`TEST_CREDENTIALS_${geo}_PASSWORD`];
  }
  if (!username || !password) {
    throw new Error(
      `Missing TEST_CREDENTIALS_${brand}_${geo}_USERNAME / TEST_CREDENTIALS_${brand}_${geo}_PASSWORD in .env — ` +
      `see .env.example or ask the team for the current test account for this brand/GEO. Note: hasTestAccount: false ` +
      `in helpers/geo-features.ts should be set instead of adding credentials for a GEO with no real test account yet.`
    );
  }
  return { username, password };
}

/** Must be called from inside a running test/hook (uses test.info()). */
export function currentTestCredentials(): { username: string; password: string } {
  const brand = process.env.TEST_BRAND ?? 'SC';
  // Mobile projects are named "<geo>-mobile" (see playwright.config.ts) —
  // strip the suffix so mobile runs resolve the same per-GEO credentials as
  // desktop instead of silently falling back to a different GEO's account
  // (confirmed live: an ES-mobile run logged in with the UK test account and
  // got geo-blocked, before this stripping was added).
  const geo = test.info().project.name.replace(/-mobile$/, '');
  const knownGeos = KNOWN_GEOS_BY_BRAND[brand] ?? [];
  return credentialsFor(brand, knownGeos.includes(geo) ? geo : (knownGeos[0] ?? geo));
}

import * as fs from 'fs';
import * as path from 'path';
import type { Browser } from '@playwright/test';

/**
 * Several brands' COM/ROW markets have a registration form whose
 * mobile-country dropdown auto-detects from the tester's REAL IP/VPN rather
 * than a fixed GEO (confirmed live repeatedly: Cyprus, South Africa, Malta,
 * UAE have all shown up here depending on which VPN was active that
 * session — see registration.spec.ts's isRowFormat/isMcComFormat/etc.
 * branches). Every one of those branches used to hardcode whichever mobile
 * generator matched the LAST session's VPN, which silently breaks the next
 * time someone tests from a different country — this is now the second
 * time that exact mistake has caused a flaky/failing run (ROW, 2026-08-12).
 *
 * This module detects the real country ONCE per run (in global-setup.ts,
 * before any spec starts) and writes it to disk so spec files — which run
 * in separate worker processes and can't share in-memory state with
 * global-setup — can read it synchronously at import time.
 */

const DETECTED_GEO_PATH = path.join(__dirname, '..', 'test-results', 'detected-geo.json');

export interface DetectedGeo {
  countryCode: string; // ISO 3166-1 alpha-2, e.g. "ZA", "CY"
  city?: string;
  region?: string;
  ip?: string;
}

/**
 * Calls ipinfo.io/json (the same service already used to manually verify
 * VPN IPs throughout this project's geo-features.ts comments) via a real
 * browser page so it goes out over whatever VPN/proxy the test run itself
 * is using, not this machine's default network path.
 */
export async function detectRealCountry(browser: Browser): Promise<DetectedGeo | null> {
  const page = await browser.newPage();
  try {
    const res = await page.request.get('https://ipinfo.io/json', { timeout: 10_000 });
    if (!res.ok()) return null;
    const body = await res.json();
    if (!body?.country) return null;
    return { countryCode: body.country, city: body.city, region: body.region, ip: body.ip };
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

export function writeDetectedGeo(geo: DetectedGeo): void {
  fs.mkdirSync(path.dirname(DETECTED_GEO_PATH), { recursive: true });
  fs.writeFileSync(DETECTED_GEO_PATH, JSON.stringify(geo, null, 2));
}

/** Returns null if global-setup's detection never ran or failed — callers must have a fallback. */
export function readDetectedGeo(): DetectedGeo | null {
  try {
    return JSON.parse(fs.readFileSync(DETECTED_GEO_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

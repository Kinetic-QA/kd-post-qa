/**
 * Strapi connection test
 * ──────────────────────
 * Usage:
 *   npx ts-node src/test-strapi-connection.ts GC
 *
 * Attempts to authenticate against the given brand's Strapi CMS.
 * Reports only success/failure — never prints credentials, tokens, or JWTs.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { StrapiClient, STRAPI_BRANDS, StrapiBrand } from './strapi-client';

async function main() {
  const brandArg = process.argv[2]?.toUpperCase();

  if (!brandArg || !STRAPI_BRANDS.includes(brandArg as StrapiBrand)) {
    console.error(`Usage: npx ts-node src/test-strapi-connection.ts <BRAND>`);
    console.error(`Supported brands: ${STRAPI_BRANDS.join(', ')}`);
    process.exit(1);
  }

  const brand = brandArg as StrapiBrand;
  console.log(`\nTesting Strapi connection for ${brand}...\n`);

  let client: StrapiClient;
  try {
    client = new StrapiClient(brand);
  } catch (e) {
    console.error(`[FAIL] Could not initialize client: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  const result = await client.verifyAuth();

  if (result.ok) {
    console.log(`[PASS] Authenticated successfully via ${result.mode} mode.\n`);
  } else {
    console.error(`[FAIL] Authentication failed via ${result.mode} mode: ${result.error}\n`);
    process.exit(1);
  }
}

main();

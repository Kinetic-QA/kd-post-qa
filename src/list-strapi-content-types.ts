/**
 * Strapi content-type discovery
 * ──────────────────────────────
 * Usage:
 *   npx ts-node src/list-strapi-content-types.ts GC
 *
 * Lists the registered "api::" content types for a brand's Strapi CMS —
 * used to find the real UIDs for things like promotions and game pages.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { StrapiClient, STRAPI_BRANDS, StrapiBrand } from './strapi-client';

async function main() {
  const brandArg = process.argv[2]?.toUpperCase();

  if (!brandArg || !STRAPI_BRANDS.includes(brandArg as StrapiBrand)) {
    console.error(`Usage: npx ts-node src/list-strapi-content-types.ts <BRAND>`);
    console.error(`Supported brands: ${STRAPI_BRANDS.join(', ')}`);
    process.exit(1);
  }

  const brand = brandArg as StrapiBrand;
  const client = new StrapiClient(brand);

  console.log(`\nContent types for ${brand}:\n`);
  try {
    const types = await client.listContentTypes();
    if (types.length === 0) {
      console.log('  (none found)');
    }
    for (const t of types) {
      console.log(`  ${t.uid.padEnd(45)} ${t.kind.padEnd(18)} "${t.displayName}"`);
    }
  } catch (e) {
    console.error(`[FAIL] ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
  console.log('');
}

main();

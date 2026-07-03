/**
 * Strapi credential presence check
 * ─────────────────────────────────
 * Usage:
 *   npx ts-node src/check-strapi-env.ts
 *
 * Prints which brands have usable Strapi credentials configured in .env —
 * never prints the actual values, only whether each var is set.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { STRAPI_BRANDS } from './strapi-client';

function isSet(value: string | undefined): boolean {
  return !!value && value.trim().length > 0;
}

console.log(`\n${'═'.repeat(60)}`);
console.log('  STRAPI CREDENTIAL CHECK');
console.log(`${'═'.repeat(60)}\n`);

for (const brand of STRAPI_BRANDS) {
  const prefix = `STRAPI_${brand}`;
  const baseUrl = isSet(process.env[`${prefix}_BASE_URL`]);
  const token = isSet(process.env[`${prefix}_TOKEN`]);
  const username = isSet(process.env[`${prefix}_USERNAME`]);
  const password = isSet(process.env[`${prefix}_PASSWORD`]);

  const hasAuth = token || (username && password);
  const authMode = token ? 'token' : (username && password) ? 'admin-login' : 'none';
  const status = baseUrl && hasAuth ? 'READY' : 'INCOMPLETE';

  console.log(`  ${brand.padEnd(4)} base_url=${baseUrl ? 'yes' : 'no '}  token=${token ? 'yes' : 'no '}  username=${username ? 'yes' : 'no '}  password=${password ? 'yes' : 'no '}  →  auth=${authMode.padEnd(11)} [${status}]`);
}

console.log(`\n${'─'.repeat(60)}\n`);

/**
 * CMS Agent
 * ─────────
 * Assists the main JIRA QA agent (agent.ts) on CMS-related tickets by talking
 * to the relevant brand's Strapi instance. Called automatically when a ticket
 * looks CMS-related — never run standalone against a ticket key.
 *
 * Current scope (intentionally minimal until the exact check semantics are
 * decided — see CLAUDE session notes): confirm the brand's CMS is reachable
 * and that the two content types QA cares about most (Promotions, Games) are
 * present. This is a foundation to build real per-ticket checks on top of,
 * not a full CMS QA pass.
 */

import { StrapiClient, StrapiBrand, STRAPI_BRANDS } from './strapi-client';
import { JiraTicket } from './jira-client';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline/promises';

export interface CmsCheckResult {
  brand: StrapiBrand | null;
  ranCheck: boolean;
  summary: string;
  details: string[];
}

// Maps a Jira project key to the Strapi brand it corresponds to.
// Extend this as more CMS-backed projects come online.
const PROJECT_BRAND_MAP: Record<string, StrapiBrand> = {
  GSP: 'GC', // GC Safer Play
};

// Mappings confirmed interactively at runtime get persisted here so the same
// project is never asked about twice. Not sensitive — just a lookup table —
// safe to commit.
const LEARNED_BRAND_MAP_FILE = path.join(process.cwd(), 'config', 'cms-brand-map.json');

function loadLearnedBrandMap(): Record<string, StrapiBrand> {
  try {
    return JSON.parse(fs.readFileSync(LEARNED_BRAND_MAP_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveLearnedBrandMap(map: Record<string, StrapiBrand>): void {
  fs.mkdirSync(path.dirname(LEARNED_BRAND_MAP_FILE), { recursive: true });
  fs.writeFileSync(LEARNED_BRAND_MAP_FILE, JSON.stringify(map, null, 2) + '\n');
}

// Asks in the terminal which brand an unrecognized project maps to. If the
// agent isn't running attended (no TTY — e.g. a scheduled/unattended run),
// there's no one to confirm with, so this returns null immediately rather
// than hanging on stdin.
async function promptForBrand(projectKey: string): Promise<StrapiBrand | null> {
  if (!process.stdin.isTTY) {
    console.log(`      [CMS] No Strapi brand mapped for project "${projectKey}" and no interactive`);
    console.log(`            terminal to confirm with — skipping CMS check for this ticket.`);
    return null;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`\n      [CMS] Not sure which Strapi brand project "${projectKey}" belongs to.`);
    console.log(`            Options: ${STRAPI_BRANDS.join(', ')}`);
    const answer = (await rl.question(`      Which brand should "${projectKey}" map to? (blank to skip): `))
      .trim()
      .toUpperCase();
    if (!answer) return null;
    if (!STRAPI_BRANDS.includes(answer as StrapiBrand)) {
      console.log(`      "${answer}" isn't a recognized brand — skipping.`);
      return null;
    }
    return answer as StrapiBrand;
  } finally {
    rl.close();
  }
}

const CMS_KEYWORDS = /\b(cms|strapi)\b/i;

// ─── Detection ────────────────────────────────────────────────────────────────
// Keyword check, mirroring parseTestType's approach — no AI call needed for this.

export function needsCmsCheck(summary: string, description: string): boolean {
  return CMS_KEYWORDS.test(summary) || CMS_KEYWORDS.test(description);
}

export async function resolveCmsBrand(ticketKey: string): Promise<StrapiBrand | null> {
  const projectKey = ticketKey.split('-')[0];
  if (PROJECT_BRAND_MAP[projectKey]) return PROJECT_BRAND_MAP[projectKey];

  const learned = loadLearnedBrandMap();
  if (learned[projectKey]) return learned[projectKey];

  const confirmed = await promptForBrand(projectKey);
  if (confirmed) {
    learned[projectKey] = confirmed;
    saveLearnedBrandMap(learned);
    console.log(`      Saved: project "${projectKey}" → ${confirmed} (config/cms-brand-map.json)`);
  }
  return confirmed;
}

// ─── Agent entry point ─────────────────────────────────────────────────────────

export async function runCmsAgent(ticket: JiraTicket): Promise<CmsCheckResult> {
  const brand = await resolveCmsBrand(ticket.key);
  if (!brand) {
    return {
      brand: null,
      ranCheck: false,
      summary: `Ticket looked CMS-related but no Strapi brand could be confirmed for project "${ticket.key.split('-')[0]}".`,
      details: [],
    };
  }

  let client: StrapiClient;
  try {
    client = new StrapiClient(brand);
  } catch (e) {
    return {
      brand,
      ranCheck: false,
      summary: `Could not initialize Strapi client for ${brand}: ${e instanceof Error ? e.message : e}`,
      details: [],
    };
  }

  const auth = await client.verifyAuth();
  if (!auth.ok) {
    return {
      brand,
      ranCheck: false,
      summary: `Could not reach ${brand} Strapi CMS: ${auth.error}`,
      details: [],
    };
  }

  const types = await client.listContentTypes();
  const details: string[] = [];
  for (const uid of ['api::promotion.promotion', 'api::game.game']) {
    const found = types.find(t => t.uid === uid);
    details.push(found ? `${found.displayName} (${uid}) — present` : `${uid} — NOT FOUND on ${brand}`);
  }

  return {
    brand,
    ranCheck: true,
    summary: `CMS check ran against ${brand} Strapi (${types.length} content types found).`,
    details,
  };
}

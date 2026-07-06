/**
 * brand-urls.ts — KD Brand QA URL Library
 *
 * Central reference for all KD brand QA and live environments.
 * Used by the agent to resolve the correct QA (and, where needed, live)
 * site for any ticket.
 *
 * Pre-checks always run against QA — never production.
 * The agent extracts BRAND and GEO from the Jira ticket (e.g. "[SNG AB]")
 * and calls getQAUrl() to get the correct QA base URL. liveUrl is kept
 * alongside for reference/comparison checks only, and is null for markets
 * that have a QA environment but haven't gone live yet (e.g. SNG/AB, MC/AB).
 *
 * To add or update entries: edit the BRAND_URLS array below.
 * Source of truth: Brand Sites Information.xlsx (KD internal)
 */

export interface BrandEnvironment {
  brand: string;  // KD brand short code (e.g. 'SNG', 'SC', 'GC')
  geo: string;    // Market/GEO identifier (e.g. 'UK', 'AB', 'ON', 'COM', 'DE')
  qaUrl: string;  // Full QA base URL including trailing slash
  liveUrl: string | null;  // Full live/production base URL, or null if the market isn't live yet
}

export const BRAND_URLS: BrandEnvironment[] = [

  // ── Genting Casino (GC) ───────────────────────────────────────────────
  { brand: 'GC',  geo: 'UK',    qaUrl: 'https://qa.gentingcasino.com/',        liveUrl: 'https://www.gentingcasino.com/' },
  { brand: 'GC',  geo: 'ROW',   qaUrl: 'https://qa.gentingcasino.com/en-row/', liveUrl: 'https://www.gentingcasino.com/en-ROW/' },
  { brand: 'GC',  geo: 'IE',    qaUrl: 'https://qa.gentingcasino.com/en-IE/', liveUrl: 'https://www.gentingcasino.com/en-IE/' },
  { brand: 'GC',  geo: 'ES',    qaUrl: 'https://qa.gentingcasino.es/',        liveUrl: 'https://www.gentingcasino.es/' },
  { brand: 'GC',  geo: 'SE',    qaUrl: 'https://qa.gentingcasino.se/',        liveUrl: 'https://www.gentingcasino.se/' },
  { brand: 'GC',  geo: 'DK',    qaUrl: 'https://qa.gentingcasino.dk/',        liveUrl: 'https://www.gentingcasino.dk/' },

  // ── Mega Casino (MC) ──────────────────────────────────────────────────
  { brand: 'MC',  geo: 'UK',    qaUrl: 'https://qa.megacasino.co.uk/',    liveUrl: 'https://www.megacasino.co.uk/' },
  { brand: 'MC',  geo: 'COM',   qaUrl: 'https://qa.megacasino.com/',      liveUrl: 'https://www.megacasino.com/' },
  { brand: 'MC',  geo: 'CA',    qaUrl: 'https://qa.megacasino.com/en-CA/', liveUrl: 'https://www.megacasino.com/en-CA/' },
  { brand: 'MC',  geo: 'IE',    qaUrl: 'https://qa.megacasino.com/en-IE/', liveUrl: 'https://www.megacasino.com/en-IE/' },
  { brand: 'MC',  geo: 'DE',    qaUrl: 'https://qa.megaspielhalle.de/',   liveUrl: 'https://www.megaspielhalle.de/' },
  { brand: 'MC',  geo: 'FR-CA', qaUrl: 'https://qa.megacasino.com/fr-CA/', liveUrl: 'https://www.megacasino.com/fr-ca/' },
  { brand: 'MC',  geo: 'DK',    qaUrl: 'https://qa.megacasino.dk/',       liveUrl: 'https://www.megacasino.dk/' },
  { brand: 'MC',  geo: 'SE',    qaUrl: 'https://qa-se.megacasino.com/',   liveUrl: 'https://se.megacasino.com/' },
  { brand: 'MC',  geo: 'ES',    qaUrl: 'https://qa.megacasinos.es/',      liveUrl: 'https://www.megacasinos.es/' },
  { brand: 'MC',  geo: 'AB',    qaUrl: 'http://qa.megacasino.ca/ab',      liveUrl: null }, // AB market not live yet

  // ── Slingo (SC) ───────────────────────────────────────────────────────
  { brand: 'SC',  geo: 'UK',    qaUrl: 'https://qa.slingo.com/',          liveUrl: 'https://www.slingo.com/' },
  { brand: 'SC',  geo: 'ROW',   qaUrl: 'https://qa.slingo.com/en-ROW/',   liveUrl: 'https://www.slingo.com/en-ROW/' },
  { brand: 'SC',  geo: 'IE',    qaUrl: 'https://qa.slingo.com/en-IE/',    liveUrl: 'https://www.slingo.com/en-IE/' },
  { brand: 'SC',  geo: 'DE',    qaUrl: 'https://qa.slingospiel.de/',      liveUrl: 'https://www.slingospiel.de/' },
  { brand: 'SC',  geo: 'ES',    qaUrl: 'https://qa.slingocasino.es/',     liveUrl: 'https://www.slingocasino.es/' },
  { brand: 'SC',  geo: 'SE',    qaUrl: 'https://qa-se.slingo.com/',       liveUrl: 'https://se.slingo.com/' },

  // ── ICE36 (I36) ───────────────────────────────────────────────────────
  { brand: 'I36', geo: 'UK',    qaUrl: 'https://qa.ice36.co.uk/',      liveUrl: 'https://www.ice36.co.uk/' },
  { brand: 'I36', geo: 'COM',   qaUrl: 'https://qa.ice36.com/',        liveUrl: 'https://www.ice36.com/' },
  { brand: 'I36', geo: 'IE',    qaUrl: 'https://qa.ice36.com/en-IE/',  liveUrl: 'https://www.ice36.com/en-IE/' },
  { brand: 'I36', geo: 'CA',    qaUrl: 'https://qa.ice36.com/en-CA/',  liveUrl: 'https://www.ice36.com/en-CA/' },
  { brand: 'I36', geo: 'DE',    qaUrl: 'https://qa.ice36.de/',         liveUrl: 'https://www.ice36.de/' },
  { brand: 'I36', geo: 'ES',    qaUrl: 'https://qa.ice36.es/',         liveUrl: 'https://www.ice36.es/' },
  { brand: 'I36', geo: 'DK',    qaUrl: 'https://qa.ice36.dk/',         liveUrl: 'https://www.ice36.dk/' },

  // ── SpinGenie (SNG) ───────────────────────────────────────────────────
  { brand: 'SNG', geo: 'UK',    qaUrl: 'https://qa.spingenie.com/',        liveUrl: 'https://www.spingenie.com/' },
  { brand: 'SNG', geo: 'ROW',   qaUrl: 'https://qa.spingenie.com/en-row/', liveUrl: 'https://www.spingenie.com/en-ROW/' },
  { brand: 'SNG', geo: 'CA',    qaUrl: 'https://qa.spingenie.com/en-CA/',  liveUrl: 'https://www.spingenie.com/en-CA/' },
  { brand: 'SNG', geo: 'IE',    qaUrl: 'https://qa.spingenie.com/en-IE/',  liveUrl: 'https://www.spingenie.com/en-IE/' },
  { brand: 'SNG', geo: 'DE',    qaUrl: 'https://qa.spingenie.de/',         liveUrl: 'https://www.spingenie.de/' },
  { brand: 'SNG', geo: 'FR-CA', qaUrl: 'https://qa.spingenie.com/fr-CA/',  liveUrl: 'https://www.spingenie.com/fr-CA/' },
  { brand: 'SNG', geo: 'SE',    qaUrl: 'https://qa-se.spingenie.com/',     liveUrl: 'https://se.spingenie.com/' },
  { brand: 'SNG', geo: 'ON',    qaUrl: 'https://qa-on.spingenie.ca/',      liveUrl: 'https://on.spingenie.ca/' },
  { brand: 'SNG', geo: 'ES',    qaUrl: 'https://qa.spingenie.es/',         liveUrl: 'https://www.spingenie.es/' },
  { brand: 'SNG', geo: 'AB',    qaUrl: 'https://qa-ab.spingenie.ca/',      liveUrl: null }, // AB market not live yet

  // ── Prime Slots (PSL) ─────────────────────────────────────────────────
  { brand: 'PSL', geo: 'UK',    qaUrl: 'https://qa.primeslots.co.uk/',     liveUrl: 'https://www.primeslots.co.uk/' },
  { brand: 'PSL', geo: 'COM',   qaUrl: 'https://qa.primeslots.com/',       liveUrl: 'https://www.primeslots.com/' },
  { brand: 'PSL', geo: 'CA',    qaUrl: 'https://qa.primeslots.com/en-CA/', liveUrl: 'https://www.primeslots.com/en-CA/' },
  { brand: 'PSL', geo: 'IE',    qaUrl: 'https://qa.primeslots.com/en-IE/', liveUrl: 'https://www.primeslots.com/en-IE/' },
  { brand: 'PSL', geo: 'DE',    qaUrl: 'https://qa.primeslots.de/',        liveUrl: 'https://www.primeslots.de/' },

  // ── Prime Scratch Cards (PSC) ─────────────────────────────────────────
  { brand: 'PSC', geo: 'UK',    qaUrl: 'https://qa.primescratchcards.co.uk/',     liveUrl: 'https://www.primescratchcards.co.uk/' },
  { brand: 'PSC', geo: 'COM',   qaUrl: 'https://qa.primescratchcards.com/',       liveUrl: 'https://www.primescratchcards.com/' },
  { brand: 'PSC', geo: 'CA',    qaUrl: 'https://qa.primescratchcards.com/en-CA/', liveUrl: 'https://www.primescratchcards.com/en-CA/' },

  // ── Prime Casino (PC) ─────────────────────────────────────────────────
  { brand: 'PC',  geo: 'UK',    qaUrl: 'https://qa.primecasino.co.uk/',    liveUrl: 'https://www.primecasino.co.uk/' },
  { brand: 'PC',  geo: 'COM',   qaUrl: 'https://qa.primecasino.com/',      liveUrl: 'https://www.primecasino.com/' },
  { brand: 'PC',  geo: 'CA',    qaUrl: 'https://qa.primecasino.com/en-CA/', liveUrl: 'https://www.primecasino.com/en-CA/' },
  { brand: 'PC',  geo: 'IE',    qaUrl: 'https://qa.primecasino.com/en-IE/', liveUrl: 'https://www.primecasino.com/en-IE/' },
  { brand: 'PC',  geo: 'DE',    qaUrl: 'https://qa.primespielhalle.de/',   liveUrl: 'https://www.primespielhalle.de/' },
  { brand: 'PC',  geo: 'ES',    qaUrl: 'https://qa.primecasino.es/',       liveUrl: 'https://www.primecasino.es/' },
  { brand: 'PC',  geo: 'SE',    qaUrl: 'https://qa-se.primecasino.com/',   liveUrl: 'https://se.primecasino.com/' },

  // ── Lucky Me Slots (LMS) ──────────────────────────────────────────────
  { brand: 'LMS', geo: 'UK',    qaUrl: 'https://qa.luckymeslots.co.uk/',     liveUrl: 'https://www.luckymeslots.co.uk/' },
  { brand: 'LMS', geo: 'COM',   qaUrl: 'https://qa.luckymeslots.com/',       liveUrl: 'https://www.luckymeslots.com/' },
  { brand: 'LMS', geo: 'CA',    qaUrl: 'https://qa.luckymeslots.com/en-CA/', liveUrl: 'https://www.luckymeslots.com/en-CA/' },
  { brand: 'LMS', geo: 'DE',    qaUrl: 'https://qa.luckymeslots.de/',        liveUrl: 'https://www.luckymeslots.de/' },
  { brand: 'LMS', geo: 'DK',    qaUrl: 'https://qa.luckymeslots.dk/',        liveUrl: 'https://www.luckymeslots.dk/' },
  { brand: 'LMS', geo: 'SE',    qaUrl: 'https://qa-se.luckymeslots.com/',    liveUrl: 'https://se.luckymeslots.com/' },

  // ── Simba Games (SG) ──────────────────────────────────────────────────
  { brand: 'SG',  geo: 'UK',    qaUrl: 'https://qa.simbagames.co.uk/',     liveUrl: 'https://www.simbagames.co.uk/' },
  { brand: 'SG',  geo: 'COM',   qaUrl: 'https://qa.simbagames.com/',       liveUrl: 'https://www.simbagames.com/' },
  { brand: 'SG',  geo: 'CA',    qaUrl: 'https://qa.simbagames.com/en-CA/', liveUrl: 'https://www.simbagames.com/en-CA/' },
  { brand: 'SG',  geo: 'DE',    qaUrl: 'https://qa.simbagames.de/',        liveUrl: 'https://www.simbagames.de/' },
  { brand: 'SG',  geo: 'DK',    qaUrl: 'https://qa.simbagames.dk/',        liveUrl: 'https://www.simbagames.dk/' },
  { brand: 'SG',  geo: 'SE',    qaUrl: 'https://qa-se.simbagames.com/',    liveUrl: 'https://se.simbagames.com/' },

  // ── Lord Ping (LP) ────────────────────────────────────────────────────
  { brand: 'LP',  geo: 'UK',    qaUrl: 'https://qa.lordping.co.uk/',     liveUrl: 'https://www.lordping.co.uk/' },
  { brand: 'LP',  geo: 'COM',   qaUrl: 'https://qa.lordping.com/',       liveUrl: 'https://www.lordping.com/' },
  { brand: 'LP',  geo: 'CA',    qaUrl: 'https://qa.lordping.com/en-CA/', liveUrl: 'https://www.lordping.com/en-ca/' },
  { brand: 'LP',  geo: 'IE',    qaUrl: 'https://qa.lordping.com/en-IE/', liveUrl: 'https://www.lordping.com/en-IE/' },
  { brand: 'LP',  geo: 'DE',    qaUrl: 'https://qa.lordping.de/',        liveUrl: 'https://www.lordping.de/' },
  { brand: 'LP',  geo: 'ES',    qaUrl: 'https://qa.lordping.es/',        liveUrl: 'https://www.lordping.es/' },
  { brand: 'LP',  geo: 'SE',    qaUrl: 'https://qa.lordping.se/',        liveUrl: 'https://www.lordping.se/' },

  // ── Zingo Bingo (ZI) ──────────────────────────────────────────────────
  { brand: 'ZI',  geo: 'UK',    qaUrl: 'https://qa.zingobingo.co.uk/', liveUrl: 'https://www.zingobingo.co.uk/' },
  { brand: 'ZI',  geo: 'COM',   qaUrl: 'https://qa.zingobingo.com/',   liveUrl: 'https://www.zingobingo.com/' },

];

/**
 * Returns the QA base URL for a given brand + GEO combination.
 * Matching is case-insensitive.
 * Returns null if no entry exists — the agent will warn and not run silently.
 *
 * Example:
 *   getQAUrl('SNG', 'AB') → 'https://qa-ab.spingenie.ca/'
 *   getQAUrl('SC', 'UK')  → 'https://qa.slingo.com/'
 */
export function getQAUrl(brand: string, geo: string): string | null {
  const b = brand.trim().toUpperCase();
  const g = geo.trim().toUpperCase();
  return BRAND_URLS.find(
    e => e.brand.toUpperCase() === b && e.geo.toUpperCase() === g
  )?.qaUrl ?? null;
}

/**
 * Returns the full BrandEnvironment entry for a brand + GEO.
 * Useful when the agent needs more context alongside the QA URL.
 */
export function getBrandEntry(brand: string, geo: string): BrandEnvironment | null {
  const b = brand.trim().toUpperCase();
  const g = geo.trim().toUpperCase();
  return BRAND_URLS.find(
    e => e.brand.toUpperCase() === b && e.geo.toUpperCase() === g
  ) ?? null;
}

/**
 * Returns all QA URLs for a given brand across all its GEOs.
 * Useful for running a check across every market a brand operates in.
 */
export function getAllQAUrlsForBrand(brand: string): BrandEnvironment[] {
  const b = brand.trim().toUpperCase();
  return BRAND_URLS.filter(e => e.brand.toUpperCase() === b);
}

/**
 * Returns the live/production base URL for a given brand + GEO combination.
 * Matching is case-insensitive. Returns null if no entry exists, or if the
 * market hasn't gone live yet (e.g. SNG/AB, MC/AB).
 *
 * Example:
 *   getLiveUrl('SNG', 'ON') → 'https://on.spingenie.ca/'
 *   getLiveUrl('SNG', 'AB') → null (not live yet)
 */
export function getLiveUrl(brand: string, geo: string): string | null {
  const b = brand.trim().toUpperCase();
  const g = geo.trim().toUpperCase();
  return BRAND_URLS.find(
    e => e.brand.toUpperCase() === b && e.geo.toUpperCase() === g
  )?.liveUrl ?? null;
}

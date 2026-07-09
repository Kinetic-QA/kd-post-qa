/**
 * geo-features.ts — Per-brand, per-GEO page/feature availability.
 *
 * Not every brand site has the same pages in every market — e.g. Slingo's
 * Blog only exists on UK and ES, and the Promotions page lives at a
 * different path (or doesn't exist at all) depending on GEO. Tests use this
 * config to skip a check cleanly when a page genuinely doesn't exist for the
 * current GEO, instead of failing on a false negative.
 *
 * Paths are baseURL-relative with NO leading slash (see helpers/common.ts
 * gotoPath/siteUrl) — a leading slash resets to the domain root and silently
 * drops path-prefixed GEOs like Slingo ROW (/en-row/) and IE (/en-IE/).
 *
 * uiLocalized: true means header/CTA copy is in the local language, not
 * English — every test asserting on English strings (LOG IN, Logout, Join,
 * etc.) needs a localized string map before it can run reliably there (see
 * helpers/locale-strings.ts). That work is confirmed done for ES; not yet
 * for DE/SE.
 *
 * Verified live 2026-07-06 against each GEO's production site.
 */

import { test } from '@playwright/test';

export interface SocialMediaHandles {
  twitter: string | null;   // substring to match in the twitter.com href
  facebook: string | null;  // substring to match in the facebook.com href
  instagram: string | null; // substring to match in the instagram.com href
}

export interface GeoFeatureConfig {
  locale: string;             // BCP-47-ish language code seen on <html lang>
  uiLocalized: boolean;       // false = English UI, safe for current English-only assertions
  hasBlog: boolean;
  blogPath: string | null;    // baseURL-relative, no leading slash
  hasPromotionsPage: boolean;
  promotionsPath: string | null; // baseURL-relative, no leading slash
  featuresPath: string | null;   // baseURL-relative, no leading slash — the "Features"/"Funciones" hub page
  mobileAppPath: string;         // baseURL-relative, no leading slash — slug differs per GEO (confirmed: ES uses "app-casino-movil/", not "mobile-app/")
  bingoCardGeneratorPath: string; // baseURL-relative, no leading slash — slug differs per GEO (confirmed: ES uses "generador-cartones-bingo/")
  currencySymbol: string;     // displayed currency symbol for this market (e.g. game prices, bonus copy)
  contactEmail: string;       // support mailto: address shown on /contact/
  socialMedia: SocialMediaHandles;
}

export const GEO_FEATURES: Record<string, Record<string, GeoFeatureConfig>> = {
  SC: {
    UK:  { locale: 'en', uiLocalized: false, hasBlog: true,  blogPath: 'blog/', hasPromotionsPage: true,  promotionsPath: 'casino-promotions/', featuresPath: 'casino-features/', mobileAppPath: 'mobile-app/',        bingoCardGeneratorPath: 'bingo-card-generator/',        currencySymbol: '£', contactEmail: 'contact@slingo.com', socialMedia: { twitter: 'Slingo_official', facebook: 'SlingoCom', instagram: 'slingoofficial' } },
    ROW: { locale: 'en', uiLocalized: false, hasBlog: false, blogPath: null,    hasPromotionsPage: true,  promotionsPath: 'casino-promotions/', featuresPath: 'casino-features/', mobileAppPath: 'mobile-app/',        bingoCardGeneratorPath: 'bingo-card-generator/',        currencySymbol: '€', contactEmail: 'contact@slingo.com', socialMedia: { twitter: 'Slingo_official', facebook: 'SlingoCom', instagram: 'slingoofficial' } }, // confirmed live: promo banner shows "€100"
    IE:  { locale: 'en', uiLocalized: false, hasBlog: false, blogPath: null,    hasPromotionsPage: true,  promotionsPath: 'casino-promotions/', featuresPath: 'casino-features/', mobileAppPath: 'mobile-app/',        bingoCardGeneratorPath: 'bingo-card-generator/',        currencySymbol: '€', contactEmail: 'contact@slingo.com', socialMedia: { twitter: 'Slingo_official', facebook: 'SlingoCom', instagram: 'slingoofficial' } }, // Ireland uses Euro
    DE:  { locale: 'de', uiLocalized: true,  hasBlog: false, blogPath: null,    hasPromotionsPage: true,  promotionsPath: 'promotions/',         featuresPath: 'casino-features/', mobileAppPath: 'mobile-app/',        bingoCardGeneratorPath: 'bingo-card-generator/',        currencySymbol: '€', contactEmail: 'contact@slingo.com', socialMedia: { twitter: 'Slingo_official', facebook: 'SlingoCom', instagram: 'slingoofficial' } }, // contactEmail/featuresPath/social/mobileAppPath/bingoCardGeneratorPath not yet confirmed for DE — placeholder UK values
    ES:  { locale: 'es', uiLocalized: true,  hasBlog: true,  blogPath: 'blog/', hasPromotionsPage: true,  promotionsPath: 'promociones/',        featuresPath: 'funciones/',       mobileAppPath: 'app-casino-movil/', bingoCardGeneratorPath: 'generador-cartones-bingo/',    currencySymbol: '€', contactEmail: 'soporte@slingocasino.es', socialMedia: { twitter: 'slingoespana', facebook: 'slingospain', instagram: 'slingoespana' } },
    SE:  { locale: 'sv', uiLocalized: true,  hasBlog: false, blogPath: null,    hasPromotionsPage: false, promotionsPath: null,                  featuresPath: 'casino-features/', mobileAppPath: 'mobile-app/',        bingoCardGeneratorPath: 'bingo-card-generator/',        currencySymbol: 'kr', contactEmail: 'contact@slingo.com', socialMedia: { twitter: 'Slingo_official', facebook: 'SlingoCom', instagram: 'slingoofficial' } }, // Swedish Krona; contactEmail/featuresPath/social/mobileAppPath/bingoCardGeneratorPath not yet confirmed for SE — placeholder UK values
  },
};

const FALLBACK: GeoFeatureConfig = {
  locale: 'en',
  uiLocalized: false,
  hasBlog: false,
  blogPath: null,
  hasPromotionsPage: false,
  promotionsPath: null,
  featuresPath: null,
  mobileAppPath: 'mobile-app/',
  bingoCardGeneratorPath: 'bingo-card-generator/',
  currencySymbol: '£',
  contactEmail: 'contact@slingo.com',
  socialMedia: { twitter: null, facebook: null, instagram: null },
};

/**
 * Returns the feature config for a brand + GEO. Falls back to the most
 * conservative config (nothing available) if brand/GEO isn't mapped yet,
 * so an unmapped GEO skips optional-page tests rather than false-failing.
 */
export function getGeoFeatures(brand: string, geo: string): GeoFeatureConfig {
  const b = brand.trim().toUpperCase();
  const g = geo.trim().toUpperCase();
  return GEO_FEATURES[b]?.[g] ?? FALLBACK;
}

/**
 * Current test's brand/GEO. GEO comes from the active Playwright *project*
 * name (playwright.config.ts names each project after its GEO), not
 * process.env.TEST_GEO — that env var is fixed for the whole process, so in
 * a multi-GEO run (TEST_GEOS="UK,IE") it can't tell UK's tests from IE's.
 * Must be called from inside a running test/hook (uses test.info()), never
 * at module scope.
 */
export function currentGeoFeatures(): GeoFeatureConfig {
  const brand = process.env.TEST_BRAND ?? 'SC';
  // Mobile projects are named "<geo>-mobile" (see playwright.config.ts) so
  // they can be targeted separately via --project; strip the suffix so GEO
  // resolution is unaffected by which viewport is running.
  const geo = test.info().project.name.replace(/-mobile$/, '');
  return getGeoFeatures(brand, geo);
}

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
 * helpers/locale-strings.ts). That work is confirmed done for ES and DE;
 * not yet for SE.
 *
 * Verified live 2026-07-06 against each GEO's production site (DE re-verified 2026-07-13).
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
  hasSocialMedia: boolean;    // false = confirmed live no social icon strip at all for this GEO (skip FS-01 entirely, not just per-icon)
  searchTerm: string;         // GS-01's search query — GEOs with no Casino category (DE, SE) need a term that actually returns results, e.g. "Slots"
  searchResultHrefSubstrings: string[]; // substrings used to identify a real game result link in the search panel for this GEO's searchTerm
  hasGameFilterCarousel: boolean; // false = confirmed live homepage has no [class*="GamesSlider_wrapper"] slider at all (games shown as a plain grid instead) — skip GF-01 entirely, not a broken selector
  hasFeedbackForm: boolean;   // false = confirmed live no "Report a problem"/feedback link anywhere in the login flow for this GEO — skip FF-01 entirely
  hasGameCategoryNav: boolean; // false = confirmed live no Slingo/Slots/Bingo/Casino category nav links anywhere on the homepage (no exact "/slots/" link exists at all, only individual game tiles) — skip GCN entirely, not a broken selector
  hasLoginRegistration: boolean; // false = this GEO has no traditional username/password login+registration widget to test (e.g. SE's Pay N Play/Trustly-based deposit flow, no test account exists) — skip login/registration specs entirely
  hasAccountModal: boolean;   // false = clicking into Play/Deposit CTAs does NOT open an "#account" login/registration modal for this GEO (e.g. SE's Pay N Play flow requires real BankID auth, confirmed live no modal opens at all) — skip just the "opens account modal" assertion in specs that otherwise still apply (game-info-modal, website-header, banner, sidebar-navigation)
  hasPaymentMethodsPage: boolean; // false = confirmed live /payment-methods/ 404s for this GEO — skip PM-01 entirely
}

export const GEO_FEATURES: Record<string, Record<string, GeoFeatureConfig>> = {
  SC: {
    UK:  { locale: 'en', uiLocalized: false, hasBlog: true,  blogPath: 'blog/', hasPromotionsPage: true,  promotionsPath: 'casino-promotions/', featuresPath: 'casino-features/', mobileAppPath: 'mobile-app/',        bingoCardGeneratorPath: 'bingo-card-generator/',        currencySymbol: '£', contactEmail: 'contact@slingo.com', socialMedia: { twitter: 'Slingo_official', facebook: 'SlingoCom', instagram: 'slingoofficial' }, hasSocialMedia: true,  searchTerm: 'Casino', searchResultHrefSubstrings: ['/slots/casino', '/casino/other/casino'], hasGameFilterCarousel: true, hasFeedbackForm: true, hasGameCategoryNav: true, hasLoginRegistration: true, hasAccountModal: true, hasPaymentMethodsPage: true },
    ROW: { locale: 'en', uiLocalized: false, hasBlog: false, blogPath: null,    hasPromotionsPage: true,  promotionsPath: 'casino-promotions/', featuresPath: 'casino-features/', mobileAppPath: 'mobile-app/',        bingoCardGeneratorPath: 'bingo-card-generator/',        currencySymbol: '€', contactEmail: 'contact@slingo.com', socialMedia: { twitter: 'Slingo_official', facebook: 'SlingoCom', instagram: 'slingoofficial' }, hasSocialMedia: false, searchTerm: 'Casino', searchResultHrefSubstrings: ['/slots/casino', '/casino/other/casino'], hasGameFilterCarousel: true, hasFeedbackForm: true, hasGameCategoryNav: true, hasLoginRegistration: true, hasAccountModal: true, hasPaymentMethodsPage: true }, // confirmed live: promo banner shows "€100"; no social icon strip on the homepage
    IE:  { locale: 'en', uiLocalized: false, hasBlog: false, blogPath: null,    hasPromotionsPage: true,  promotionsPath: 'casino-promotions/', featuresPath: 'casino-features/', mobileAppPath: 'mobile-app/',        bingoCardGeneratorPath: 'bingo-card-generator/',        currencySymbol: '€', contactEmail: 'contact@slingo.com', socialMedia: { twitter: 'Slingo_official', facebook: 'SlingoCom', instagram: 'slingoofficial' }, hasSocialMedia: false, searchTerm: 'Casino', searchResultHrefSubstrings: ['/slots/casino', '/casino/other/casino'], hasGameFilterCarousel: true, hasFeedbackForm: true, hasGameCategoryNav: true, hasLoginRegistration: true, hasAccountModal: true, hasPaymentMethodsPage: true }, // Ireland uses Euro; no social icon strip on the homepage
    DE:  { locale: 'de', uiLocalized: true,  hasBlog: false, blogPath: null,    hasPromotionsPage: true,  promotionsPath: 'promotions/',         featuresPath: null,               mobileAppPath: 'mobile-app/',        bingoCardGeneratorPath: 'bingo-card-generator/',        currencySymbol: '€', contactEmail: 'contact@slingo.com', socialMedia: { twitter: null, facebook: null, instagram: null }, hasSocialMedia: false, searchTerm: 'Slots',  searchResultHrefSubstrings: ['/slots/'], hasGameFilterCarousel: false, hasFeedbackForm: false, hasGameCategoryNav: false, hasLoginRegistration: true, hasAccountModal: true, hasPaymentMethodsPage: true }, // confirmed live 2026-07-13: no /casino-features/, /blog/, /mobile-app/, or /bingo-card-generator/ pages (all 404), no social icon strip in footer, no Casino category — "Slots" confirmed to return real results (/slots/monkey-slots/); homepage has no slider carousel at all, games shown as a plain grid instead; no "Report a problem"/feedback link anywhere in the login flow; no Slingo/Slots/Bingo/Casino category nav links at all (no exact "/slots/" link exists, only individual game tiles)
    ES:  { locale: 'es', uiLocalized: true,  hasBlog: true,  blogPath: 'blog/', hasPromotionsPage: true,  promotionsPath: 'promociones/',        featuresPath: 'funciones/',       mobileAppPath: 'app-casino-movil/', bingoCardGeneratorPath: 'generador-cartones-bingo/',    currencySymbol: '€', contactEmail: 'soporte@slingocasino.es', socialMedia: { twitter: 'slingoespana', facebook: 'slingospain', instagram: 'slingoespana' }, hasSocialMedia: true, searchTerm: 'Casino', searchResultHrefSubstrings: ['/slots/casino', '/casino/other/casino'], hasGameFilterCarousel: true, hasFeedbackForm: true, hasGameCategoryNav: true, hasLoginRegistration: true, hasAccountModal: true, hasPaymentMethodsPage: true },
    SE:  { locale: 'sv', uiLocalized: true,  hasBlog: false, blogPath: null,    hasPromotionsPage: false, promotionsPath: null,                  featuresPath: null,               mobileAppPath: 'mobile-app/',        bingoCardGeneratorPath: 'bingo-card-generator/',        currencySymbol: 'kr', contactEmail: 'contact@slingo.com', socialMedia: { twitter: null, facebook: null, instagram: null }, hasSocialMedia: false, searchTerm: 'Casino', searchResultHrefSubstrings: ['/slots/'], hasGameFilterCarousel: true, hasFeedbackForm: false, hasGameCategoryNav: true, hasLoginRegistration: false, hasAccountModal: false, hasPaymentMethodsPage: false }, // confirmed live 2026-07-13: Swedish Krona; footer confirms Slingo/Slots/Casino category links exist (SE DOES have a Casino category, unlike DE), no social icon strip, contactEmail correct, 2 GamesSlider_wrapper carousels present. Searching "Casino" returns real results under /slots/ (e.g. "Mighty Hot Wilds"), not a /casino/-specific path. No traditional login/registration — header shows "INSÄTTNING" (Deposit) / "SPELA" (Play) instead of Login/Join, footer has Trustly + Pay N Play links (Swedish BankID/Trustly-based instant-deposit model, no username/password account) — no test credentials exist, skip login/registration specs entirely (hasLoginRegistration: false). Clicking the game info modal's "SPELA" button does NOT open an #account modal (confirmed live — no navigation, no modal) — hasAccountModal: false. /payment-methods/ confirmed 404 (real page-not-found, not a selector issue) — hasPaymentMethodsPage: false. featuresPath not yet independently verified live — placeholder assumption carried over from DE
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
  hasSocialMedia: false,
  searchTerm: 'Casino',
  searchResultHrefSubstrings: ['/slots/casino', '/casino/other/casino'],
  hasGameFilterCarousel: true,
  hasFeedbackForm: true,
  hasLoginRegistration: true,
  hasGameCategoryNav: true,
  hasAccountModal: true,
  hasPaymentMethodsPage: true,
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

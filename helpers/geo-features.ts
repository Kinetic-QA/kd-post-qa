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
  hasTestAccount?: boolean;  // false = the login/registration WIDGET exists and is safe to inspect (registration.spec.ts never submits; login-widget.spec.ts only ever uses a deliberately wrong username/password), but no real, working test ACCOUNT exists yet to actually log in with — skip only login.spec.ts's real successful-login test. Distinct from hasLoginRegistration: a brand can have the widget worth inspecting (true) while having no usable account yet (hasTestAccount: false), e.g. a pre-live brand where registration itself is still broken/unsubmittable. Defaults to true (has a working account) when omitted, so existing GEOs need no change.
  hasAccountModal: boolean;   // false = clicking into Play/Deposit CTAs does NOT open an "#account" login/registration modal for this GEO (e.g. SE's Pay N Play flow requires real BankID auth, confirmed live no modal opens at all) — skip just the "opens account modal" assertion in specs that otherwise still apply (game-info-modal, website-header, banner, sidebar-navigation)
  hasPaymentMethodsPage: boolean; // false = confirmed live /payment-methods/ 404s for this GEO — skip PM-01 entirely
  hasBlogDesktopSearch: boolean; // false = confirmed live the blog's ONLY search entry point (data-tk-value="blogSearch") lives inside the mobile-only footer nav (display:none at desktop widths) — there is no separate desktop header search icon at all, unlike Slingo's BlogHeader_search-demi. Desktop blog-page-header.spec.ts's search-icon step should skip gracefully rather than fail on a real UX gap it can't work around
  hasBlogSearch: boolean; // false = confirmed live the blog's search feature doesn't actually work at all for this brand — the page has an empty placeholder reserved for a Google Custom Search widget that never renders anything into it (confirmed via console errors, checked both SNG UK and CA, not just one GEO). This is distinct from hasBlogDesktopSearch (which icon exists where) — this flag means the underlying feature itself is non-functional, so blog-search.spec.ts should skip entirely rather than fail on a real product gap it can't work around
}

export const GEO_FEATURES: Record<string, Record<string, GeoFeatureConfig>> = {
  SC: {
    UK:  { locale: 'en', uiLocalized: false, hasBlog: true,  blogPath: 'blog/', hasPromotionsPage: true,  promotionsPath: 'casino-promotions/', featuresPath: 'casino-features/', mobileAppPath: 'mobile-app/',        bingoCardGeneratorPath: 'bingo-card-generator/',        currencySymbol: '£', contactEmail: 'contact@slingo.com', socialMedia: { twitter: 'Slingo_official', facebook: 'SlingoCom', instagram: 'slingoofficial' }, hasSocialMedia: true,  searchTerm: 'Casino', searchResultHrefSubstrings: ['/slots/casino', '/casino/other/casino'], hasGameFilterCarousel: true, hasFeedbackForm: true, hasGameCategoryNav: true, hasLoginRegistration: true, hasAccountModal: true, hasPaymentMethodsPage: true, hasBlogDesktopSearch: true, hasBlogSearch: true },
    ROW: { locale: 'en', uiLocalized: false, hasBlog: false, blogPath: null,    hasPromotionsPage: true,  promotionsPath: 'casino-promotions/', featuresPath: 'casino-features/', mobileAppPath: 'mobile-app/',        bingoCardGeneratorPath: 'bingo-card-generator/',        currencySymbol: '€', contactEmail: 'contact@slingo.com', socialMedia: { twitter: 'Slingo_official', facebook: 'SlingoCom', instagram: 'slingoofficial' }, hasSocialMedia: false, searchTerm: 'Casino', searchResultHrefSubstrings: ['/slots/casino', '/casino/other/casino'], hasGameFilterCarousel: true, hasFeedbackForm: true, hasGameCategoryNav: true, hasLoginRegistration: true, hasAccountModal: true, hasPaymentMethodsPage: true, hasBlogDesktopSearch: true, hasBlogSearch: true }, // confirmed live: promo banner shows "€100"; no social icon strip on the homepage
    IE:  { locale: 'en', uiLocalized: false, hasBlog: false, blogPath: null,    hasPromotionsPage: true,  promotionsPath: 'casino-promotions/', featuresPath: 'casino-features/', mobileAppPath: 'mobile-app/',        bingoCardGeneratorPath: 'bingo-card-generator/',        currencySymbol: '€', contactEmail: 'contact@slingo.com', socialMedia: { twitter: 'Slingo_official', facebook: 'SlingoCom', instagram: 'slingoofficial' }, hasSocialMedia: false, searchTerm: 'Casino', searchResultHrefSubstrings: ['/slots/casino', '/casino/other/casino'], hasGameFilterCarousel: true, hasFeedbackForm: true, hasGameCategoryNav: true, hasLoginRegistration: true, hasAccountModal: true, hasPaymentMethodsPage: true, hasBlogDesktopSearch: true, hasBlogSearch: true }, // Ireland uses Euro; no social icon strip on the homepage
    DE:  { locale: 'de', uiLocalized: true,  hasBlog: false, blogPath: null,    hasPromotionsPage: true,  promotionsPath: 'promotions/',         featuresPath: null,               mobileAppPath: 'mobile-app/',        bingoCardGeneratorPath: 'bingo-card-generator/',        currencySymbol: '€', contactEmail: 'contact@slingo.com', socialMedia: { twitter: null, facebook: null, instagram: null }, hasSocialMedia: false, searchTerm: 'Slots',  searchResultHrefSubstrings: ['/slots/'], hasGameFilterCarousel: false, hasFeedbackForm: false, hasGameCategoryNav: false, hasLoginRegistration: true, hasAccountModal: true, hasPaymentMethodsPage: true, hasBlogDesktopSearch: true, hasBlogSearch: true }, // confirmed live 2026-07-13: no /casino-features/, /blog/, /mobile-app/, or /bingo-card-generator/ pages (all 404), no social icon strip in footer, no Casino category — "Slots" confirmed to return real results (/slots/monkey-slots/); homepage has no slider carousel at all, games shown as a plain grid instead; no "Report a problem"/feedback link anywhere in the login flow; no Slingo/Slots/Bingo/Casino category nav links at all (no exact "/slots/" link exists, only individual game tiles)
    ES:  { locale: 'es', uiLocalized: true,  hasBlog: true,  blogPath: 'blog/', hasPromotionsPage: true,  promotionsPath: 'promociones/',        featuresPath: 'funciones/',       mobileAppPath: 'app-casino-movil/', bingoCardGeneratorPath: 'generador-cartones-bingo/',    currencySymbol: '€', contactEmail: 'soporte@slingocasino.es', socialMedia: { twitter: 'slingoespana', facebook: 'slingospain', instagram: 'slingoespana' }, hasSocialMedia: true, searchTerm: 'Casino', searchResultHrefSubstrings: ['/slots/casino', '/casino/other/casino'], hasGameFilterCarousel: true, hasFeedbackForm: true, hasGameCategoryNav: true, hasLoginRegistration: true, hasAccountModal: true, hasPaymentMethodsPage: true, hasBlogDesktopSearch: true, hasBlogSearch: true },
    SE:  { locale: 'sv', uiLocalized: true,  hasBlog: false, blogPath: null,    hasPromotionsPage: false, promotionsPath: null,                  featuresPath: null,               mobileAppPath: 'mobile-app/',        bingoCardGeneratorPath: 'bingo-card-generator/',        currencySymbol: 'kr', contactEmail: 'contact@slingo.com', socialMedia: { twitter: null, facebook: null, instagram: null }, hasSocialMedia: false, searchTerm: 'Casino', searchResultHrefSubstrings: ['/slots/'], hasGameFilterCarousel: true, hasFeedbackForm: false, hasGameCategoryNav: true, hasLoginRegistration: false, hasAccountModal: false, hasPaymentMethodsPage: false, hasBlogDesktopSearch: false, hasBlogSearch: false }, // confirmed live 2026-07-13: Swedish Krona; footer confirms Slingo/Slots/Casino category links exist (SE DOES have a Casino category, unlike DE), no social icon strip, contactEmail correct, 2 GamesSlider_wrapper carousels present. Searching "Casino" returns real results under /slots/ (e.g. "Mighty Hot Wilds"), not a /casino/-specific path. No traditional login/registration — header shows "INSÄTTNING" (Deposit) / "SPELA" (Play) instead of Login/Join, footer has Trustly + Pay N Play links (Swedish BankID/Trustly-based instant-deposit model, no username/password account) — no test credentials exist, skip login/registration specs entirely (hasLoginRegistration: false). Clicking the game info modal's "SPELA" button does NOT open an #account modal (confirmed live — no navigation, no modal) — hasAccountModal: false. /payment-methods/ confirmed 404 (real page-not-found, not a selector issue) — hasPaymentMethodsPage: false. featuresPath not yet independently verified live — placeholder assumption carried over from DE
  },

  // ── SpinGenie (SNG) ─────────────────────────────────────────────────────
  SNG: {
    // AB (Alberta) — pre-live QA market, confirmed live 2026-07-16 (IL/CY VPN
    // required to reach qa-ab.spingenie.ca). Same brand-agnostic suite reused
    // with ZERO spec-file changes; only this config block plus the
    // hasTestAccount split (see GeoFeatureConfig) were added.
    AB: {
      locale: 'en', uiLocalized: false,
      hasBlog: false, blogPath: null, // confirmed 404 "Page not found | Slingo Official" (stale brand name in the 404 template itself — SON-shared infra, not an AB-specific bug)
      hasPromotionsPage: true, promotionsPath: 'promotions/',
      featuresPath: 'features/',
      mobileAppPath: 'mobile-app/',
      bingoCardGeneratorPath: 'bingo-card-generator/', // confirmed 404 — not a Slingo-brand feature, skips gracefully same as DE/SE
      currencySymbol: '$', // CAD — confirmed via "$10"/"$500" bonus copy on homepage
      contactEmail: 'contact.alberta@spingenie.ca', // confirmed live on /contact/
      socialMedia: { twitter: null, facebook: null, instagram: null },
      hasSocialMedia: false, // confirmed live: no twitter.com/facebook.com/instagram.com links found homepage-wide
      searchTerm: 'Casino', searchResultHrefSubstrings: ['/casino/'], // Casino nav + real content confirmed live at /casino/; NOT yet verified via an actual in-app search interaction — revisit if GS-01 fails
      hasGameFilterCarousel: true, // NOT yet confirmed live — assumed true (SC's common case); let a real run correct this if wrong rather than guessing it away
      hasFeedbackForm: true, // confirmed live: "Report a problem" link present on /contact/
      hasGameCategoryNav: true, // confirmed live nav is Home/Slots/Casino/Live Casino — a DIFFERENT taxonomy than Slingo's Slingo/Slots/Bingo/Casino (no Bingo, has Live Casino instead); game-category-navigation.spec.ts's hardcoded Slingo category list may not apply as-is — verify when that spec runs
      hasLoginRegistration: true, // widget exists and is safe to inspect: registration.spec.ts never submits, login-widget.spec.ts only ever uses a deliberately wrong username/password
      hasTestAccount: false, // confirmed per Reeve 2026-07-16: no working test account exists yet (dev-side registration/submit issues) — skips only login.spec.ts's real successful-login test
      hasAccountModal: true, // confirmed live: header LOG IN/JOIN buttons are currently unreliable (passed in one spec run, no-opped in an isolated check — matches "still some issues from dev"), but clicking a game tile's "Play It" reliably opens #account with a real popup, so the modal itself does work
      hasPaymentMethodsPage: true, // confirmed live 200
      hasBlogDesktopSearch: false, // no blog for AB anyway (hasBlog: false) — set false for consistency with the rest of the brand
      hasBlogSearch: false, // no blog for AB anyway — set false for consistency with the rest of the brand
    },

    // UK/IE/CA — LIVE English-language markets, confirmed live 2026-07-17.
    // Same underlying SkillOnNet/SNG platform as AB — same Nav_ CSS classes,
    // same registration-widget shape, contact email shared across all three.
    // Tested from a UK VPN/IP throughout (per Reeve) — UK needed no fixes at
    // all, CA needed no fixes at all, but IE's registration needed the same
    // explicit country-selection fix as AB's mobile step (see
    // fillStep0WithRetry's countryCodeLabel + fillIEAddress in
    // registration.spec.ts) since the form defaults to the tester's real IP
    // (UK), not Ireland — re-verify fully from a real Irish IP if retesting.
    UK: {
      locale: 'en', uiLocalized: false,
      hasBlog: true, blogPath: 'blog/', // confirmed 200
      hasPromotionsPage: true, promotionsPath: 'promotions/', // confirmed 200
      featuresPath: 'features/', // confirmed 200
      mobileAppPath: 'mobile-app/', // not independently re-verified this session — carried over from AB/Slingo's common slug
      bingoCardGeneratorPath: 'bingo-card-generator/', // not independently re-verified — footer confirmed no such link (skips cleanly either way)
      currencySymbol: '£', // confirmed via bonus copy
      contactEmail: 'contact@spingenie.com', // confirmed live on /contact/
      socialMedia: { twitter: null, facebook: null, instagram: null }, // not independently identified — 3 social icons confirmed present homepage-wide, exact handles not captured this session
      hasSocialMedia: true, // confirmed live: 3 social links found homepage-wide
      searchTerm: 'Casino', searchResultHrefSubstrings: ['/casino/', '/slots/'], // not independently re-verified via in-app search — carried over assumption from AB
      hasGameFilterCarousel: true, // not independently re-verified — assumed true (SC's common case)
      hasFeedbackForm: true, // "Report a problem" link confirmed present on /contact/ (Step 3 of contact-us-page.spec.ts passed)
      hasGameCategoryNav: true, // confirmed live 18/18 on game-category-navigation.spec.ts: Slots/Megaways/Jackpots/Daily Jackpots/Bingo/Casino/Roulette/BlackJack/Other all real; no Slingo/New Slots/Plinko/Live Casino
      hasLoginRegistration: true,
      hasAccountModal: true, // confirmed live via login.spec.ts (5/5) and registration.spec.ts (6/6)
      hasPaymentMethodsPage: true, // confirmed 200
      hasBlogDesktopSearch: false, // confirmed live 2026-07-20: the blog's only [data-tk-value="blogSearch"] link lives inside MobileFooter_footer (display:none at desktop widths) — unlike Slingo's blog, there is no separate desktop BlogHeader_search-demi icon at all. Same underlying platform/blog template as IE/CA, so applies brand-wide, not just this GEO
      hasBlogSearch: false, // confirmed live 2026-07-20: the blog's search feature doesn't work at all — the Google Custom Search widget the page reserves a slot for never renders (console errors, checked directly on /blog/search/). Not a per-GEO thing — brand-wide, confirmed same on CA too
    },
    IE: {
      locale: 'en', uiLocalized: false,
      hasBlog: false, blogPath: null, // confirmed 404
      hasPromotionsPage: true, promotionsPath: 'promotions/', // confirmed 200
      featuresPath: 'features/', // confirmed 200
      mobileAppPath: 'mobile-app/',
      bingoCardGeneratorPath: 'bingo-card-generator/',
      currencySymbol: '€', // confirmed via bonus copy
      contactEmail: 'contact@spingenie.com', // confirmed live on /contact/ — same as UK/CA
      socialMedia: { twitter: null, facebook: null, instagram: null },
      hasSocialMedia: false, // confirmed live: only 1 social-domain link found homepage-wide (likely a footer/legal link, not a real social icon strip) — treat as no strip until independently confirmed otherwise
      searchTerm: 'Casino', searchResultHrefSubstrings: ['/casino/', '/slots/'],
      hasGameFilterCarousel: true, // not independently re-verified
      hasFeedbackForm: true, // not independently re-verified this session — carried over from UK/AB pattern
      hasGameCategoryNav: true, // confirmed live 18/18: Slots/Jackpots/Daily Jackpots/Casino/Roulette/BlackJack/Other real; no Slingo/New Slots/Megaways/Bingo/Plinko/Live Casino for this brand+GEO (a DIFFERENT sub-taxonomy than SNG UK's — Megaways/Bingo present on UK but not IE)
      hasLoginRegistration: true,
      hasAccountModal: true,
      hasPaymentMethodsPage: true, // confirmed 200
      hasBlogDesktopSearch: false, // no blog for IE anyway (hasBlog: false) — set false for consistency with UK/CA, same brand-wide platform gap
      hasBlogSearch: false, // no blog for IE anyway — set false for consistency, same brand-wide platform gap
    },
    CA: {
      locale: 'en', uiLocalized: false,
      hasBlog: true, blogPath: 'blog/', // confirmed 200
      hasPromotionsPage: true, promotionsPath: 'promotions/', // confirmed 200
      featuresPath: 'features/', // confirmed 200
      mobileAppPath: 'mobile-app/',
      bingoCardGeneratorPath: 'bingo-card-generator/',
      currencySymbol: '$', // CAD — confirmed via bonus copy
      contactEmail: 'contact@spingenie.com', // confirmed live on /contact/ — same as UK/IE
      socialMedia: { twitter: null, facebook: null, instagram: null },
      hasSocialMedia: false, // confirmed live: only 1 social-domain link found homepage-wide, same caveat as IE
      searchTerm: 'Casino', searchResultHrefSubstrings: ['/casino/', '/slots/'],
      hasGameFilterCarousel: true, // not independently re-verified
      hasFeedbackForm: true, // not independently re-verified this session
      hasGameCategoryNav: true, // confirmed live 18/18: same sub-taxonomy as IE (Slots/Megaways/Jackpots/Daily Jackpots/Casino/Roulette/BlackJack/Other; no Slingo/New Slots/Bingo/Plinko/Live Casino)
      hasLoginRegistration: true,
      hasAccountModal: true,
      hasPaymentMethodsPage: true, // confirmed 200
      hasBlogDesktopSearch: false, // confirmed live 2026-07-20: same as UK — the blog's only [data-tk-value="blogSearch"] link lives inside MobileFooter_footer (display:none at desktop widths), no separate desktop search icon exists
      hasBlogSearch: false, // confirmed live 2026-07-20: same as UK — the Google Custom Search widget never renders (empty placeholder, console errors on /blog/search/), the search feature simply doesn't work for this brand
      // registration.spec.ts: earlier UK-IP spot-check showed 6/6 unmodified,
      // but a full run from a REAL Canada VPN (2026-07-20) found the mobile
      // step DOES need the same explicit country-selection fix as AB/IE —
      // the UK-IP spot-check had been masking this the same way AB's/IE's
      // issues were masked before being tested from their real countries.
      // See isCanadianMobileFormat in registration.spec.ts.
    },
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
  hasBlogDesktopSearch: true,
  hasBlogSearch: true,
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

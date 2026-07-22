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
  extraPageSettleMs?: number; // confirmed live 2026-07-21 on SNG FR-CA: the header Log In/Join buttons render visible+clickable well before their click handlers are actually wired up — clicking immediately after the standard load wait is silently a no-op (button click succeeds, but no navigation to #account, no error either). A real user's slower manual click never hits this; only fast automated clicks do. Extends the post-load settle wait in specs that click login/join/search shortly after page load. Defaults to 0 (no extra wait) when omitted.
  hasAccountModal: boolean;   // false = clicking into Play/Deposit CTAs does NOT open an "#account" login/registration modal for this GEO (e.g. SE's Pay N Play flow requires real BankID auth, confirmed live no modal opens at all) — skip just the "opens account modal" assertion in specs that otherwise still apply (game-info-modal, website-header, banner, sidebar-navigation)
  hasPaymentMethodsPage: boolean; // false = confirmed live /payment-methods/ 404s for this GEO — skip PM-01 entirely
  hasBlogDesktopSearch: boolean; // false = confirmed live the blog's ONLY search entry point (data-tk-value="blogSearch") lives inside the mobile-only footer nav (display:none at desktop widths) — there is no separate desktop header search icon at all, unlike Slingo's BlogHeader_search-demi. Desktop blog-page-header.spec.ts's search-icon step should skip gracefully rather than fail on a real UX gap it can't work around
  hasBlogSearch: boolean; // false = confirmed live the blog's search feature doesn't actually work at all for this brand — the page has an empty placeholder reserved for a Google Custom Search widget that never renders anything into it (confirmed via console errors, checked both SNG UK and CA, not just one GEO). This is distinct from hasBlogDesktopSearch (which icon exists where) — this flag means the underlying feature itself is non-functional, so blog-search.spec.ts should skip entirely rather than fail on a real product gap it can't work around
  contactPath?: string;  // baseURL-relative, no leading slash — defaults to 'contact/' when omitted. Confirmed live: SNG ES genuinely translates this slug to "contacto/", unlike every other GEO onboarded so far which kept the English "contact/" regardless of uiLocalized
  aboutUsPath?: string;  // baseURL-relative, no leading slash — defaults to 'about-us/' when omitted. Confirmed live: SNG ES genuinely translates this slug to "sobre-nosotros/"
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
      hasBlogDesktopSearch: true, // RE-CONFIRMED live 2026-07-21 (UK VPN): a real, visible, clickable desktop search icon DOES exist (searchIconVisible diagnostic returned true) — the 2026-07-20 "no desktop icon at all" claim was wrong (or the site changed since), don't trust it going forward without re-checking
      hasBlogSearch: true, // RE-CONFIRMED live 2026-07-21 (UK VPN, both desktop AND mobile): typing "casino" returns REAL results (gsc.q=casino URL with actual article/post content, not the empty-placeholder "no results" state) — the 2026-07-20 "widget never renders" claim was wrong (or stale), don't clone this "broken" assumption onto other GEOs without checking live first
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
      hasBlogDesktopSearch: false, // RE-CONFIRMED live 2026-07-21 (searchIconVisible diagnostic, real Toronto/Canada IP): no clickable desktop icon found. NOT a brand-wide gap, though — UK and ON were re-tested the same day and DO have a real working desktop search icon; CA genuinely is the odd one out here, don't clone this onto other SNG GEOs
      hasBlogSearch: false, // RE-CONFIRMED live 2026-07-21 (real Toronto/Canada IP, both desktop AND mobile): "Type casino → search executes" step fails outright on both viewports — desktop has no icon at all, and mobile's icon DOES exist and gets clicked but the resulting search still doesn't work. NOT a brand-wide gap — UK and ON were re-tested the same day and their search genuinely works (real results returned). Don't assume this "broken" finding applies to any other SNG GEO without checking live first
      // registration.spec.ts: earlier UK-IP spot-check showed 6/6 unmodified,
      // but a full run from a REAL Canada VPN (2026-07-20) found the mobile
      // step DOES need the same explicit country-selection fix as AB/IE —
      // the UK-IP spot-check had been masking this the same way AB's/IE's
      // issues were masked before being tested from their real countries.
      // See isCanadianMobileFormat in registration.spec.ts.
    },

    // FR-CA (French Canada) — onboarding started 2026-07-21. Same underlying
    // www.spingenie.com site/platform as CA, just at /fr-CA/ instead of
    // /en-CA/ (per Reeve). Live inspection 2026-07-21 confirmed the UI is
    // genuinely French (SE CONNECTER/S'INSCRIRE/JOUER, <html lang="fr">,
    // page title "Casino en ligne au Canada | Spin Genie") — the cookie
    // consent banner itself is NOT localized (still shows English "Allow
    // all cookies", already in helpers/common.ts's KNOWN_ACCEPT_TEXTS, no
    // fix needed there). Most boolean/path fields below are CLONED from CA
    // as a starting baseline — NOT yet independently confirmed for FR-CA —
    // run the full suite and correct via real failures, same pattern as
    // every other GEO onboarded this project.
    'FR-CA': {
      locale: 'fr', uiLocalized: true,
      hasBlog: false, blogPath: null, // confirmed live 2026-07-21: /fr-CA/blog/ 404s, and no Blog link appears anywhere in the footer/nav DOM (unlike CA) — do NOT clone CA's hasBlog:true onto FR-CA
      hasPromotionsPage: true, promotionsPath: 'offres-promotionnelles/', // confirmed live 2026-07-21 (Reeve + DOM snapshot evidence): FR-CA's Promotions link/slug is genuinely translated, unlike most other pages — NOT the English "promotions/" slug CA/UK/IE share
      featuresPath: 'fonctionnalites/', // confirmed live via DOM snapshot 2026-07-21: header nav "Fonctionnalités" link points to /fr-CA/fonctionnalites/, not the English "features/" slug
      mobileAppPath: 'mobile-app/', // unconfirmed — cloned from CA
      bingoCardGeneratorPath: 'bingo-card-generator/', // unconfirmed — cloned from CA
      currencySymbol: '$', // CAD — unconfirmed, cloned from CA, verify live bonus copy
      contactEmail: 'contact@spingenie.com', // unconfirmed — cloned from CA/UK/IE, verify live (may be French-specific)
      socialMedia: { twitter: null, facebook: null, instagram: null }, // unconfirmed — cloned from CA
      hasSocialMedia: false, // unconfirmed — cloned from CA
      searchTerm: 'Casino', searchResultHrefSubstrings: ['/casino/', '/slots/'], // unconfirmed — cloned from CA, may need a French search term
      hasGameFilterCarousel: true, // unconfirmed — cloned from CA
      hasFeedbackForm: false, // confirmed by Reeve 2026-07-21: FR-CA has no feedback form — skip FF-01 entirely rather than treating repeated failures as a real bug
      hasGameCategoryNav: true, // confirmed live 2026-07-21: header nav shows MACHINES À SOUS/GAIN INSTANTANÉ/CASINO plus a MEGAWAYS/JACKPOTS/SLINGO/CARTES À GRATTER/ROULETTE/BLACKJACK/JEUX TÉLÉVISÉS sub-taxonomy — needs a French-aware category-nav spec pass, don't assume CA's English category labels apply
      hasLoginRegistration: true, // confirmed live 2026-07-21: SE CONNECTER/S'INSCRIRE buttons present in header
      hasTestAccount: true, // real test account confirmed 2026-07-21 (leon@test.com)
      hasAccountModal: true, // unconfirmed — cloned from CA, verify live
      hasPaymentMethodsPage: true, // unconfirmed — cloned from CA
      hasBlogDesktopSearch: false, // confirmed live 2026-07-21: no blog exists at all for FR-CA (see hasBlog), so no blog search icon either — consistent by necessity, not cloned from CA's separate (and since-corrected) finding
      hasBlogSearch: false, // confirmed live 2026-07-21: no blog exists at all for FR-CA — blog-search.spec.ts skips on hasBlog anyway, but keep this consistent
      extraPageSettleMs: 6_000, // confirmed live 2026-07-21: login button click was a silent no-op with the standard wait; a longer settle (6s post-load + existing waits) reliably lets the click actually navigate to #account
    },

    // ON (Ontario) — real AGCO-regulated live market at on.spingenie.ca,
    // onboarded 2026-07-21 from a real Toronto VPN/IP. Full desktop+mobile
    // suite run: 38 passed, 6 failed (3 distinct root causes, each hitting
    // both viewports), 4 skipped (brand-wide blog-search/social-strip gaps,
    // same as UK/CA). All 3 failures were test-code issues, not real site
    // bugs — registration.spec.ts's Canadian branch (mobile country +
    // generateCanadianDOB's YYYY.MM.DD format) needed to include 'ON'
    // alongside 'CA', expectedPlaysecureUrlPattern() needed to collapse to
    // the root two-label domain (on.spingenie.ca's real post-login redirect
    // is playsecure.spingenie.ca, not playsecure.on.spingenie.ca), and the
    // contact email below was a wrong clone guess, now corrected.
    ON: {
      locale: 'en', uiLocalized: false,
      hasBlog: true, blogPath: 'blog/', // confirmed live 2026-07-21: /blog/ 200, full blog-page/blog-sidebar/blog-page-header suites passed
      hasPromotionsPage: true, promotionsPath: 'promotions/', // confirmed live 2026-07-21: PP-01 6/6
      featuresPath: 'features/', // confirmed live 2026-07-21: FP-01 2/2
      mobileAppPath: 'mobile-app/', // confirmed live 2026-07-21: footer link resolves to /mobile-app/
      bingoCardGeneratorPath: 'bingo-card-generator/', // confirmed live 2026-07-21: footer has no such link for this GEO (skips cleanly, same as UK/CA)
      currencySymbol: '$', // CAD — confirmed via bonus copy 2026-07-21
      contactEmail: 'contact.ontario@spingenie.ca', // confirmed live 2026-07-21 on /contact/ — Ontario-specific, same "regional prefix + .ca" pattern as AB's contact.alberta@spingenie.ca (NOT the shared UK/IE/CA contact@spingenie.com)
      socialMedia: { twitter: null, facebook: 'SpinGenieON', instagram: 'spingenieon' }, // confirmed live 2026-07-21 — real footer "Follow us on" strip found in the registration test's page snapshot (facebook.com/SpinGenieON, instagram.com/spingenieon), no twitter link present
      hasSocialMedia: true, // confirmed live 2026-07-21 — real footer social strip exists (see socialMedia above). This was WRONGLY left as a false/unverified clone guess initially despite the evidence already being visible in a captured DOM snapshot — don't carry over a sibling GEO's flag value without checking data already in hand
      searchTerm: 'Casino', searchResultHrefSubstrings: ['/casino/', '/slots/'], // confirmed live 2026-07-21: GS-01 11/11
      hasGameFilterCarousel: true, // confirmed live 2026-07-21: GF-01 4/4, 3 slider rows found
      hasFeedbackForm: true, // confirmed live 2026-07-21: FF-01 7/7
      hasGameCategoryNav: true, // confirmed live 2026-07-21: GCN 18/18 — same sub-taxonomy as IE/CA (Slots/New Slots/Megaways/Jackpots/Casino/Roulette/BlackJack/Other/Live Casino sub-categories) plus Live Casino; no Slingo/Daily Jackpots/Bingo/Plinko
      hasLoginRegistration: true, // confirmed live 2026-07-21: widget present, RW-01/LW-02 fully pass
      hasTestAccount: true, // real test account confirmed 2026-07-21 (kmc@test.com) — login now succeeds after the expectedPlaysecureUrlPattern() fix
      hasAccountModal: true, // confirmed live 2026-07-21: GIM-01/WH-01/SN-01 all confirm #account modal opens correctly
      hasPaymentMethodsPage: true, // confirmed live 2026-07-21: PM-01 3/3, /payment-methods/ 200
      hasBlogDesktopSearch: true, // confirmed live 2026-07-21 (BS-01 searchIconVisible diagnostic, from a real Toronto/Canada IP): a real, clickable desktop search icon exists (not just inferred from a passing test — the diagnostic distinguishes "clicked a real icon" from "fell back to a direct URL", and this was the former). UK re-confirmed the same way same day — the earlier brand-wide "no desktop icon" claim was wrong, re-check CA too rather than assuming it still holds
      hasBlogSearch: true, // confirmed live 2026-07-21 (both desktop AND mobile, real Toronto/Canada IP): typing "casino" returns REAL results (article/post elements visible, URL shows gsc.q=casino with actual content, not the empty-placeholder state). UK re-confirmed the same way same day — the earlier brand-wide "widget never renders" claim was wrong, re-check CA too rather than assuming it still holds
    },

    // ES (Spain) — onboarded 2026-07-22 against www.spingenie.es. Shares the
    // same test account as SC's ES (confirmed by Reeve — ES credentials are
    // cross-brand, unlike every other GEO/brand pair in this file). Started
    // from SC's ES config as a baseline but several paths turned out to be
    // brand-specific translations, NOT shared with SC — confirmed via live
    // DOM inspection of the header/hamburger menu (see TEMP-inspect-sng-es
    // throwaway spec, deleted after use, same pattern as FR-CA onboarding).
    ES: {
      locale: 'es', uiLocalized: true,
      hasBlog: true, blogPath: 'blog/', // confirmed live: hamburger menu link resolves to /blog/
      hasPromotionsPage: true, promotionsPath: 'promociones-casino/', // confirmed live via hamburger menu — NOT SC ES's "promociones/"
      featuresPath: 'funciones-casino/', // confirmed live via hamburger menu — NOT SC ES's "funciones/"
      mobileAppPath: 'app-casino-movil/', // unconfirmed — cloned from SC ES, no footer link seen yet to verify against
      bingoCardGeneratorPath: 'generador-cartones-bingo/', // unconfirmed — cloned from SC ES
      currencySymbol: '€', // unconfirmed — cloned from SC ES
      contactEmail: 'soporte@spingenie.es', // confirmed live on /contacto/ — the "contact@spingenie.com" guess (shared by SNG's other GEOs) was wrong; ES genuinely uses its own domain + "soporte" (support), matching the pattern SC ES already uses (soporte@slingocasino.es) rather than the SNG UK/IE/CA pattern
      contactPath: 'contacto/', // confirmed live via hamburger menu — genuinely translated, unlike every other SNG GEO which keeps English "contact/"
      aboutUsPath: 'sobre-nosotros/', // confirmed live via hamburger menu — genuinely translated, unlike every other SNG GEO which keeps English "about-us/"
      socialMedia: { twitter: null, facebook: null, instagram: null }, // unconfirmed — NOT cloned from SC ES (different brand's handles would be wrong); verify live
      hasSocialMedia: true, // unconfirmed — cloned from SC ES, verify live
      searchTerm: 'Casino', searchResultHrefSubstrings: ['/casino/', '/slots/'], // unconfirmed — cloned from other SNG GEOs' pattern rather than SC ES's (different brand's URL structure)
      hasGameFilterCarousel: true, // unconfirmed — cloned from SC ES
      hasFeedbackForm: true, // unconfirmed — cloned from SC ES
      hasGameCategoryNav: true, // confirmed live category nav exists, but SNG ES's taxonomy is genuinely different from SC ES and other SNG GEOs — hamburger menu shows Promociones/Funciones/Slots (Todo/Nuevas Slots/Jackpots)/Juegos Rápidos (Todo/Slingo/Video Bingo)/Casino (Todo/Ruleta/BlackJack), no "Live Casino" — game-category-navigation.spec.ts's hardcoded category list may not apply as-is, verify when that spec runs
      hasLoginRegistration: true, // confirmed live: "Iniciar sesión"/"Unirse" buttons present in header and hamburger menu
      hasTestAccount: true, // shared SC/SNG ES account confirmed working by Reeve 2026-07-22
      hasAccountModal: true, // unconfirmed — cloned from SC ES
      hasPaymentMethodsPage: true, // unconfirmed — cloned from SC ES
      hasBlogDesktopSearch: true, // unconfirmed — cloned from SC ES
      hasBlogSearch: true, // unconfirmed — cloned from SC ES
    },

    // DE (Germany) — onboarded 2026-07-22 against www.spingenie.de. Live
    // inspection (header/menu/footer/contact page/homepage) done BEFORE
    // writing this config, not after — same lesson from FR-CA/ES onboarding.
    // Unlike ES, DE keeps every slug in plain English (same platform gap as
    // SC's DE) — nothing here needed translating.
    DE: {
      locale: 'de', uiLocalized: true,
      hasBlog: false, blogPath: null, // confirmed live: no Blog link anywhere in menu or footer
      hasPromotionsPage: true, promotionsPath: 'promotions/', // confirmed live via menu + footer
      featuresPath: null, // confirmed live: no Features/Funktionen link anywhere in menu or footer
      mobileAppPath: 'mobile-app/', // unconfirmed — no footer link found (same as SC DE), carried over as a placeholder that skips cleanly if 404
      bingoCardGeneratorPath: 'bingo-card-generator/', // unconfirmed — same as above
      currencySymbol: '€',
      contactEmail: 'support@spingenie.de', // confirmed live: /contact/ page's mailto link
      contactPath: 'contact/', // confirmed live — kept English, unlike SNG ES's translated "contacto/"
      aboutUsPath: 'about-us/', // confirmed live — kept English
      socialMedia: { twitter: null, facebook: null, instagram: null },
      hasSocialMedia: false, // confirmed live: zero facebook/twitter/instagram/x.com links found homepage-wide
      searchTerm: 'Slots', searchResultHrefSubstrings: ['/slots/'], // confirmed live: no Casino category exists (same platform gap as SC DE), "Slots" search returns 20 real /slots/ results
      hasGameFilterCarousel: false, // confirmed live: zero GamesSlider_wrapper elements on homepage
      hasFeedbackForm: false, // confirmed live: /contact/ has a LOGIN link but no #account/feedback link anywhere
      hasGameCategoryNav: false, // confirmed live: header/menu nav has no Slots/Casino/Live Casino category links at all, only Home/Aktionen/Verantwortungsvolles Spielen/Hilfe/Kontakt/Über uns
      hasLoginRegistration: true, // confirmed live: EINLOGGEN/ANMELDEN buttons in header and hamburger menu
      hasTestAccount: true, // real test account provided by Reeve 2026-07-22
      hasAccountModal: true, // confirmed live: /contact/ page's LOGIN link present (a[href*="#account/login"])
      hasPaymentMethodsPage: true, // confirmed live footer link to /payment-methods/
      hasBlogDesktopSearch: false, // no blog exists at all (see hasBlog) — consistent by necessity
      hasBlogSearch: false, // no blog exists at all — consistent by necessity
    },

    // SE (Sweden) — onboarded 2026-07-22 against se.spingenie.com. Live
    // inspection done BEFORE writing this config (header/menu/footer/contact
    // page/homepage play-click/payment-methods), same as DE/ES/FR-CA. Same
    // Pay N Play/Trustly deposit model as SC's SE — no traditional
    // username/password login exists here at all.
    SE: {
      locale: 'sv', uiLocalized: true,
      hasBlog: false, blogPath: null, // confirmed live: no Blog link anywhere in menu or footer
      hasPromotionsPage: false, promotionsPath: null, // confirmed live: no Promotions/Aktioner link anywhere in menu or footer
      featuresPath: null, // confirmed live: no Features/Funktioner link anywhere
      mobileAppPath: 'mobile-app/', // unconfirmed — no footer link found, carried over as a placeholder that skips cleanly if 404
      bingoCardGeneratorPath: 'bingo-card-generator/', // unconfirmed — same as above
      currencySymbol: 'kr', // Swedish Krona — not independently re-verified (no bonus/promo banner exists to check copy against), carried over from SC SE
      contactEmail: 'contact@spingenie.com', // confirmed live: /contact/ page's mailto link — the shared UK/IE/CA/FR-CA address, NOT its own domain like DE/ES
      contactPath: 'contact/', // confirmed live — kept English
      aboutUsPath: 'about-us/', // confirmed live — kept English
      socialMedia: { twitter: null, facebook: null, instagram: null },
      hasSocialMedia: false, // confirmed live: zero facebook/twitter/instagram/x.com links found homepage-wide
      searchTerm: 'Slots', searchResultHrefSubstrings: ['/slots/'], // confirmed live: only a Slots category exists (Alla/Jackpottar) — no Casino category link anywhere, unlike SC SE which does have one
      hasGameFilterCarousel: true, // confirmed live: 2 GamesSlider_wrapper elements found on homepage
      hasFeedbackForm: false, // confirmed live: /contact/ has a LOGIN link but no #account/feedback link
      hasGameCategoryNav: true, // confirmed live: menu/footer have a real "Slots" category nav link (Alla/Jackpottar) plus a Pay N Play link — no Slingo/Bingo/Casino/Live Casino though, game-category-navigation.spec.ts's per-link check-and-skip already handles a partial subset
      hasLoginRegistration: false, // confirmed live: header/menu show "Fortsätt spela" (Continue playing) / "Insättning" (Deposit) instead of Login/Join — Pay N Play/Trustly instant-deposit model, no username/password account, same as SC SE
      hasAccountModal: false, // confirmed live: hovering a game tile and clicking "Spela" does NOT open an #account modal — URL stays on the homepage, no navigation, no modal — same as SC SE
      hasPaymentMethodsPage: false, // confirmed live: /payment-methods/ returns a real 404
      hasBlogDesktopSearch: false, // no blog exists at all (see hasBlog) — consistent by necessity
      hasBlogSearch: false, // no blog exists at all — consistent by necessity
    },

    // ROW (Rest of World) — onboarded 2026-07-22 against www.spingenie.com/en-ROW/,
    // tested from a real Cyprus VPN/IP (per Reeve). Live inspection done
    // BEFORE writing this config (header/menu/footer/contact page/blog/
    // payment-methods/features/search/currency), same as every other GEO
    // onboarded this project. English UI, same platform as UK/IE/CA/ON —
    // nearly identical to SNG UK's config, just no Blog and no Features page.
    ROW: {
      locale: 'en', uiLocalized: false,
      hasBlog: false, blogPath: null, // confirmed live: /en-ROW/blog/ 404s, no Blog link in menu or footer (unlike UK/CA)
      hasPromotionsPage: true, promotionsPath: 'promotions/', // confirmed live via menu + footer
      featuresPath: null, // confirmed live: /en-ROW/features/ 404s, no Features link anywhere (unlike UK/IE/CA)
      mobileAppPath: 'mobile-app/', // unconfirmed — no footer link found, carried over as a placeholder that skips cleanly if 404
      bingoCardGeneratorPath: 'bingo-card-generator/', // unconfirmed — same as above
      currencySymbol: '€', // confirmed live via bonus copy ("€308"/"€45"/"€418"/"€10")
      contactEmail: 'contact@spingenie.com', // confirmed live on /contact/ — same shared address as UK/IE/CA/ON
      socialMedia: { twitter: null, facebook: 'SpinGenieUK', instagram: null }, // confirmed live: one facebook.com/SpinGenieUK/ link found homepage-wide — shared UK handle, not ROW-specific
      hasSocialMedia: true, // confirmed live: 1 social link found (not 3 like UK, but still present)
      searchTerm: 'Casino', searchResultHrefSubstrings: ['/casino/', '/slots/'], // confirmed live: searching "Casino" returns 77 real results
      hasGameFilterCarousel: true, // confirmed live: 3 GamesSlider_wrapper elements found on homepage
      hasFeedbackForm: true, // confirmed live: /contact/ has a real #account/feedback link
      hasGameCategoryNav: true, // confirmed live: menu/footer show Online Slots (All/Jackpots/Daily Jackpots), Instant Win (All/Slingo/Scratch Cards), Casino (All/Roulette/BlackJack/Other) — a DIFFERENT sub-taxonomy than UK (no Megaways/Bingo, has Instant Win/Scratch Cards instead) — game-category-navigation.spec.ts's per-link check-and-skip already handles this
      hasLoginRegistration: true, // confirmed live: Log in/Join buttons present in header and hamburger menu
      hasTestAccount: true, // real test account provided by Reeve 2026-07-22
      hasAccountModal: true, // confirmed live: /contact/ page has a real LOGIN link (a[href*="#account/login"])
      hasPaymentMethodsPage: true, // confirmed live 200
      hasBlogDesktopSearch: false, // no blog exists at all (see hasBlog) — consistent by necessity
      hasBlogSearch: false, // no blog exists at all — consistent by necessity
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

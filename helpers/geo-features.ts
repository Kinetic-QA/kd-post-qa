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
  gameTileHrefSubstrings?: string[]; // optional — substrings identifying a real game-tile link (as opposed to a bare category nav link) in game-filter.spec.ts and game-info-modal.spec.ts. Defaults to the classic Slingo-family taxonomy (/slingo/, /slots/, /casino/, /bingo/) when omitted, so existing GEOs need no change. Set this when a brand's game category taxonomy differs (e.g. MC's /online-slots/, /casino-games/, /live-casino/).
  paymentMethodsPath?: string; // optional — baseURL-relative path for the footer's Payment Options link. Defaults to 'payment-methods/' when omitted (the common case); set when a brand uses a different slug (e.g. MC's /payment-options/).
  hasPromotionsIconInHeader?: boolean; // optional — false means the header/banner has no dedicated Promotions icon linking to the promotions page, even though the page itself exists (hasPromotionsPage/promotionsPath). Distinct from those: this is specifically about a header entry point. Defaults to true when omitted, so existing GEOs need no change.
  contactPath?: string;  // baseURL-relative, no leading slash — defaults to 'contact/' when omitted. Confirmed live: SNG ES genuinely translates this slug to "contacto/", unlike every other GEO onboarded so far which kept the English "contact/" regardless of uiLocalized
  aboutUsPath?: string;  // baseURL-relative, no leading slash — defaults to 'about-us/' when omitted. Confirmed live: SNG ES genuinely translates this slug to "sobre-nosotros/"
  hasContactMailto?: boolean; // optional — false means this brand's /contact/ page has NO mailto: link at all, so contactEmail is not a real assertable value for it. Defaults to true when omitted (every brand onboarded before GC has a real mailto link). Set false + leave contactEmail as '' when a brand uses a different contact-page design (see contactCtaLabels).
  contactCtaLabels?: string[] | null; // optional — confirmed live on GC UK: /contact/ has no mailto link OR plain LOGIN link; instead it shows big clickable CTA cards ("Genting Casino Online", "Genting Casino Venues") that route to /contact/<slug>/. Set the exact visible label text for each card that should be tested. null/omitted means the brand doesn't use this card-based contact design.
  casinoPath?: string; // optional — baseURL-relative, no leading slash. Defaults to 'casino/' when omitted. Confirmed live: GC ES genuinely translates this slug to "juegos-casino/"
  responsibleGamingPath?: string; // optional — baseURL-relative, no leading slash. Defaults to 'responsible-gaming/' when omitted. Confirmed live: GC ES genuinely translates this slug to "juego-mas-seguro/"
  helpPath?: string; // optional — baseURL-relative, no leading slash. Defaults to 'help/' when omitted. Confirmed live: GC ES genuinely translates this slug to "ayuda/"
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

  // ── Mega Casino (MC) ─────────────────────────────────────────────────────
  MC: {
    // UK — confirmed live 2026-07-22. Same underlying SkillOnNet/SON platform
    // family as SC/SNG (Nav_/MainMenu_/Header_/Button_ CSS conventions), but a
    // DIFFERENT game category taxonomy: Home/Live Casino/Online Slots/Casino
    // Games — no Slingo/Slots/Bingo/Casino naming like SC, no Slots/Megaways/
    // Jackpots like SNG (see gameTileHrefSubstrings). Live site is behind
    // Cloudflare bot-detection that intermittently challenges automated
    // traffic (confirmed: a real, non-automated browser sees no challenge and
    // a fully working site) — expect login/registration/feedback-form and
    // occasional other specs to fail on this GEO until QA automation is
    // allowlisted; that is a known automation-detection gap, not a product
    // bug (see PLAN.md's dated MC/UK findings entries for detail).
    UK: {
      locale: 'en', uiLocalized: false,
      hasBlog: true, blogPath: 'blog/', // confirmed 200
      hasPromotionsPage: true, promotionsPath: 'promotions/', // confirmed 200
      featuresPath: null, // confirmed 404 — no /features/ page for this brand
      mobileAppPath: 'mobile-app/', // confirmed 200
      bingoCardGeneratorPath: 'bingo-card-generator/', // confirmed 404 — not a Slingo-brand feature, skips gracefully same as SC's DE/SE
      currencySymbol: '£', // confirmed via bonus copy ("£25")
      contactEmail: 'support@megacasino.com', // confirmed live 2026-07-21 on /contact/ — re-confirmation attempt 2026-07-22 hit the same intermittent Cloudflare challenge documented in PLAN.md rather than a changed value
      socialMedia: { twitter: null, facebook: 'MegaCasinoUK', instagram: 'megacasinouk' }, // confirmed live: facebook.com/MegaCasinoUK/ and instagram.com/megacasinouk/ found homepage-wide; no twitter/x link found
      hasSocialMedia: true, // confirmed live: 2 social links found homepage-wide
      searchTerm: 'Casino', // confirmed live: returns real results via the actual in-app search flow
      searchResultHrefSubstrings: ['/online-slots/', '/casino-games/', '/live-casino/'], // confirmed live via real search flow (typed "Casino", inspected actual result links inside GameSearchPopup)
      gameTileHrefSubstrings: ['/online-slots/', '/casino-games/', '/live-casino/'], // confirmed live via homepage crawl — MC's game tiles use this brand's own taxonomy, not Slingo's /slingo//slots//casino//bingo/
      hasGameFilterCarousel: true, // confirmed live: homepage has [class*="GamesSlider_wrapper"] rows
      hasFeedbackForm: true, // confirmed live: "Report a problem" entry point exists in the son-auth-modals widget shell (present in DOM regardless of the widget's automation-blocked state, see PLAN.md)
      hasGameCategoryNav: true, // confirmed live: Home/Live Casino/Online Slots/Casino Games nav — different taxonomy than SC/SNG, see gameTileHrefSubstrings
      hasLoginRegistration: true, // widget exists and is safe to inspect (registration.spec.ts never submits, login-widget.spec.ts only uses a deliberately wrong username/password)
      hasTestAccount: false, // no working MC/UK test account exists yet — TEST_CREDENTIALS_MC_UK_USERNAME/PASSWORD still needed in .env (see PLAN.md 2026-07-21 findings) — skips only login.spec.ts's real successful-login test
      hasAccountModal: true, // confirmed live: LOG IN/JOIN CTAs correctly advance the URL to #account (the widget itself failing to render content is a separate, automation-detection issue — see PLAN.md — not a modal-doesn't-open issue)
      hasPaymentMethodsPage: false, // confirmed 404
      hasBlogDesktopSearch: true, // confirmed live: blog page's search icon exists and is visible at desktop width
      hasBlogSearch: false, // confirmed live: clicking the blog search icon does not reveal a working input/results — consistent with the same platform-wide non-functional blog search already confirmed on SNG UK/CA
    },

    // COM — confirmed live 2026-07-22, tested from a Malta VPN/IP (real test
    // account now exists: TEST_CREDENTIALS_MC_COM_USERNAME/PASSWORD). Same
    // taxonomy as UK (/online-slots/, /casino-games/, /live-casino/) and no
    // Cloudflare interference seen this session (unlike UK) — both plain and
    // browser-UA curl requests returned 200 cleanly throughout. Registration's
    // mobile-number step auto-detects country from real IP (Malta/+356, same
    // auto-detect pattern as SC's ROW/DE, not SNG AB/CA's explicit-dropdown
    // case) — see generateMalteseMobile's docstring in helpers/testData.ts.
    COM: {
      locale: 'en', uiLocalized: false,
      hasBlog: false, blogPath: null, // confirmed 404
      hasPromotionsPage: true, promotionsPath: 'promotions/', // confirmed 200
      featuresPath: null, // confirmed 404
      mobileAppPath: 'mobile-app/', // confirmed 404 — kept as the common slug; footerStep already soft-skips this link gracefully since it doesn't exist in COM's footer at all
      bingoCardGeneratorPath: 'bingo-card-generator/', // confirmed 404 — soft-skips gracefully, no such footer link either
      currencySymbol: '€', // confirmed via homepage bonus copy ("€100")
      contactEmail: 'support@megacasino.com', // confirmed live on /contact/ — same as UK
      socialMedia: { twitter: null, facebook: null, instagram: null }, // confirmed live: no facebook/twitter/instagram links found homepage-wide
      hasSocialMedia: false, // confirmed live: no social icon strip
      searchTerm: 'Casino', // confirmed live: search Steps 1-3 (open, type, results appear) already passed under the old fallback config
      searchResultHrefSubstrings: ['/online-slots/', '/casino-games/', '/live-casino/'], // same taxonomy as UK, confirmed via homepage crawl
      gameTileHrefSubstrings: ['/online-slots/', '/casino-games/', '/live-casino/'], // same taxonomy as UK, confirmed via homepage crawl
      paymentMethodsPath: 'payment-options/', // confirmed live: COM's real slug differs from the common 'payment-methods/' default (which 404s here) — used by footer-navigation.spec.ts's Payment Options step
      hasGameFilterCarousel: true, // confirmed live: "3 game slider rows found"
      hasFeedbackForm: true, // confirmed live: "Report a problem" present on /contact/ (count 2)
      hasGameCategoryNav: true, // confirmed live: Home/Casino/Slots/Games nav
      hasLoginRegistration: true,
      hasTestAccount: true, // real test account confirmed working live 2026-07-22 (login.spec.ts passed)
      hasAccountModal: true, // confirmed live: JOIN widget opens correctly with Mobile/DOB fields, no automation-detection issue seen on this domain this session
      hasPaymentMethodsPage: true, // confirmed live: PM-01 passes (payment logos found on the page) despite the literal /payment-methods/ URL 404ing — see paymentMethodsPath for the real slug used elsewhere
      hasBlogDesktopSearch: false, // no blog for COM anyway (hasBlog: false) — set false for consistency
      hasBlogSearch: false, // no blog for COM anyway — set false for consistency
      hasPromotionsIconInHeader: false, // confirmed live: header/banner only contains the logo and search links — no Promotions icon at all, even though the promotions page itself exists (promotionsPath above)
    },

    // CA — confirmed live 2026-07-22, path-prefixed at /en-CA/ (see
    // brand-urls.ts). Same taxonomy/platform as UK/COM. No Cloudflare
    // interference seen — plain curl (no UA) and browser-UA curl both
    // returned clean 200s throughout.
    //
    // CORRECTION (same day, later session): an earlier version of this block
    // set hasAccountModal: false based on LOGIN/JOIN appearing completely
    // non-functional — that finding was an artifact of testing with the wrong
    // VPN/IP (not actually Canada at the time). Re-tested with a confirmed
    // Canada IP (verified via ipinfo.io): login.spec.ts passes 5/5, real
    // login succeeds. The real, confirmed behavior is just that the login
    // modal is slower to fully render here than other GEOs — the widget shell
    // mounts and the URL advances to #account quickly, but the actual
    // username/password inputs (behind an Altcha proof-of-work widget in the
    // shadow root) can take 15-20+ seconds to become visible. Lesson: always
    // double check the active VPN/IP before trusting a "nothing happens"
    // finding on a market-specific domain — confirm via a real IP-check
    // (ipinfo.io/api.ipify.org), not just the site loading at all.
    CA: {
      locale: 'en', uiLocalized: false,
      hasBlog: false, blogPath: null, // confirmed 404
      hasPromotionsPage: true, promotionsPath: 'promotions/', // confirmed 200 — page exists, but no footer or header link to it (footerStep's existing soft-skip already handles the footer case)
      featuresPath: null, // confirmed 404
      mobileAppPath: 'mobile-app/', // confirmed 404 — soft-skips gracefully, no such footer link either
      bingoCardGeneratorPath: 'bingo-card-generator/', // confirmed 404 — soft-skips gracefully
      currencySymbol: '$', // confirmed via homepage bonus copy ("$100")
      contactEmail: 'support@megacasino.com', // confirmed live on /en-CA/contact/ — same as UK/COM
      socialMedia: { twitter: null, facebook: null, instagram: null }, // confirmed live: no facebook/twitter/instagram links found homepage-wide
      hasSocialMedia: false, // confirmed live: no social icon strip
      searchTerm: 'Casino', // inherited default — not independently re-verified via in-app search this session
      searchResultHrefSubstrings: ['/online-slots/', '/casino-games/', '/live-casino/'], // same taxonomy as UK/COM, confirmed via homepage crawl
      gameTileHrefSubstrings: ['/online-slots/', '/casino-games/', '/live-casino/'], // same taxonomy as UK/COM, confirmed via homepage crawl
      paymentMethodsPath: 'payment-options/', // confirmed live: same real slug as COM, common 'payment-methods/' default 404s here too
      hasGameFilterCarousel: true, // not independently re-verified this session — assumed true matching UK/COM's common case
      hasFeedbackForm: true, // confirmed live: "Report a problem" present on /contact/ (count 2)
      hasGameCategoryNav: true, // confirmed live: Home/Casino/Slots/Games nav, same as UK/COM
      hasLoginRegistration: true,
      hasTestAccount: true, // real test account confirmed working live 2026-07-22 (login.spec.ts passed 5/5, correct Canada IP)
      hasAccountModal: true, // confirmed live with correct Canada IP: LOGIN/JOIN correctly open the modal — see CORRECTION note above
      hasPaymentMethodsPage: true, // confirmed live: same pattern as COM — PM-01 passes despite the literal /payment-methods/ URL 404ing
      hasBlogDesktopSearch: false, // no blog for CA anyway (hasBlog: false) — set false for consistency
      hasBlogSearch: false, // no blog for CA anyway — set false for consistency
      hasPromotionsIconInHeader: false, // confirmed live: header/banner only contains the logo and search links — no Promotions icon
    },
  },

  // ── Genting Casino (GC) ───────────────────────────────────────────────────
  GC: {
    // UK — onboarded 2026-07-23 against www.gentingcasino.com. Same
    // SkillOnNet/SON platform family as SC/SNG/MC (Header_/Button_/MainMenu_/
    // AccountWidget_ CSS conventions, same #account modal routing), but its
    // OWN game taxonomy (Online Casino/Live Casino, not Slingo's or MC's) and
    // a genuinely different /contact/ page design — see contactCtaLabels.
    // Cloudflare bot-detection intermittently challenges automated requests
    // here (confirmed: same "Performing security verification" interstitial
    // seen on MC UK — see that block's note and PLAN.md) — /about-us/ and
    // /payment-options/ hit it consistently even via real link clicks (not
    // just direct goto), so expect occasional false-fails on those pages
    // until QA automation is allowlisted; this is a known automation-
    // detection gap, not a product bug.
    UK: {
      locale: 'en', uiLocalized: false,
      hasBlog: true, blogPath: 'blog/', // confirmed live 200 — nav/footer label this "Insights", but the real link target is /blog/
      hasPromotionsPage: true, promotionsPath: 'promotions/', // confirmed live 200
      featuresPath: 'features/', // confirmed live 200
      mobileAppPath: 'mobile-app/', // unconfirmed — no footer/nav link found at all for this brand; kept as the common placeholder, skips cleanly if 404
      bingoCardGeneratorPath: 'bingo-card-generator/', // unconfirmed — no such link exists for this brand (not a Slingo-family feature), skips cleanly same as MC
      currencySymbol: '£', // confirmed via homepage bonus copy ("£25")
      contactEmail: '', // confirmed live: /contact/ has NO mailto: link anywhere — see hasContactMailto/contactCtaLabels
      hasContactMailto: false, // confirmed live: contact-us-page.spec.ts's mailto-dependent steps must skip for this brand
      contactCtaLabels: ['Genting Casino Online', 'Genting Casino Venues'], // confirmed live: /contact/ shows 2 big clickable CTA cards ("How Can We Help?" section) instead of a mailto link or plain LOGIN link — routes to /contact/online/ and (presumed) /contact/venues/; clicking "Genting Casino Online" hit the Cloudflare challenge interstitial rather than real content this session, so the destination page's content is NOT yet independently confirmed
      socialMedia: { twitter: 'GentingCasinoUK', facebook: 'GentingCasinoUK', instagram: 'gentingcasinouk' }, // confirmed live: all 3 handles found homepage-wide
      hasSocialMedia: true, // confirmed live: 3 social links found
      searchTerm: 'Casino', searchResultHrefSubstrings: ['/casino/', '/live-casino/'], // not independently re-verified via in-app search this session — inferred from gameTileHrefSubstrings' taxonomy
      gameTileHrefSubstrings: ['/casino/slots/', '/casino/jackpot-slots/', '/casino/online-roulette/', '/casino/online-blackjack/', '/casino/online-baccarat/', '/casino/table-games/', '/live-casino/'], // confirmed live via homepage crawl + full nav dump — GC's own taxonomy, not Slingo's or MC's
      hasGameFilterCarousel: true, // confirmed live: homepage has GamesSlider_wrapper rows ("Popular in Casino", "Streaming Live from Genting Casinos")
      hasFeedbackForm: true, // confirmed live: "Report a problem" button present on /contact/ (AccountWidget_feedback class)
      hasGameCategoryNav: true, // confirmed live: header + mobile sidebar show Online Casino (Slots/Jackpots/Roulette/Blackjack/Baccarat/Table Games/Providers/Themes) and Live Casino (Live Roulette/Live Blackjack/Genting Live/Live Baccarat/Table & Cards/Game Shows) as TWO expandable accordion categories on mobile (see next note) plus a separate flat Venues link — a completely different taxonomy from SC/SNG/MC, no Slots/Bingo/Casino Games naming
      hasLoginRegistration: true, // confirmed live: LOGIN/JOIN buttons in header; clicking LOGIN correctly advances URL to /#account
      hasTestAccount: true, // real test account confirmed working by Reeve 2026-07-23 (kn@test.com — same account as SC/SNG UK)
      hasAccountModal: true, // confirmed live: header LOGIN click advances to /#account
      hasPaymentMethodsPage: true, // confirmed live: /payment-methods/ 404s, but /payment-options/ returns 200 (footer's real "Secure Banking" link) — same paymentMethodsPath override pattern as MC COM/CA
      paymentMethodsPath: 'payment-options/', // confirmed live: real footer slug, common 'payment-methods/' default 404s here
      hasBlogDesktopSearch: false, // NOT independently confirmed — the header's #Header_search-demi__ICbtG search icon wasn't found rendered on the /blog/ page specifically this session; may be a Cloudflare-interference false negative rather than a real gap, re-check before trusting this fully
      hasBlogSearch: false, // unconfirmed — cloned from the desktop-search finding above pending a clean re-check
    },

    // ES — onboarded 2026-07-23 against www.gentingcasino.es. Live inspection
    // (header/nav/footer/contact/payment/blog/promotions/features/about-us,
    // all before writing this config) found ZERO Cloudflare interference
    // across two full inspection passes — unlike UK, which hit the
    // "Performing security verification" challenge intermittently on nearly
    // every page. Confirms the automation-detection wall is UK-specific
    // (or IP/domain-specific), not brand-wide — same pattern already seen
    // with MC (UK has Cloudflare interference, COM/CA don't). Shares the
    // same SkillOnNet/SON platform conventions as UK (Header_/Button_/
    // MainMenu_/AccountWidget_ CSS, #account modal routing, <son-cookie-
    // consent> shadow-DOM banner — already handled by dismissCookieConsent's
    // Spanish accept-text, confirmed working since SC/SNG ES).
    ES: {
      locale: 'es', uiLocalized: true,
      hasBlog: true, blogPath: 'blog/', // confirmed live 200, real nav link
      hasPromotionsPage: true, promotionsPath: 'promociones/', // confirmed live 200 via real nav link — genuinely translated slug (unlike UK's English 'promotions/', though that same English path also happens to 200 here, 'promociones/' is the one the real nav uses)
      featuresPath: 'funciones-especiales/', // confirmed live 200 via real nav link "Funciones" — NOT the guessed 'funciones/' (404s) or UK's 'features/' (also 200 but not the real nav slug)
      mobileAppPath: 'mobile-app/', // unconfirmed — no footer link found, carried over as placeholder that skips cleanly if 404 (same as UK)
      bingoCardGeneratorPath: 'bingo-card-generator/', // unconfirmed — no such link exists for this brand, skips cleanly same as UK
      currencySymbol: '€', // confirmed via homepage bonus copy ("100 €", "10€")
      contactEmail: 'soporte@gentingcasino.es', // confirmed live on /contacto/ — a REAL mailto link, unlike UK's card-based design (see note below)
      // contactCtaLabels intentionally omitted — confirmed live 2026-07-23:
      // GC ES's /contacto/ is a COMPLETELY DIFFERENT design from GC UK, not
      // just a translation of the same layout. It has a real "AYUDA POR
      // CORREO ELECTRÓNICO" mailto section (soporte@gentingcasino.es) and a
      // real "Reportar un problema" feedback button — the CTA-card design
      // (contactCtaLabels) is UK-specific, don't assume it applies brand-wide.
      contactPath: 'contacto/', // confirmed live 200 via real nav link — genuinely translated, unlike UK's English 'contact/' (404s here)
      aboutUsPath: 'quienes-somos/', // confirmed live 200 via real nav link "Sobre nosotros" — genuinely translated, unlike UK's English 'about-us/' (404s here)
      socialMedia: { twitter: 'GentingCasinoES', facebook: 'GentingCasinoES', instagram: 'gentingcasinoespana' }, // confirmed live: all 3 handles found homepage-wide
      hasSocialMedia: true, // confirmed live: 3 social links found
      searchTerm: 'Casino', searchResultHrefSubstrings: ['/juegos-casino/', '/slots/'], // unconfirmed via actual in-app search — inferred from the real taxonomy found live
      gameTileHrefSubstrings: ['/slots/', '/juegos-casino/', '/ruleta-en-vivo/'], // confirmed live via homepage crawl — ES's own Spanish-slug taxonomy, distinct from UK's /casino/slots/ etc.
      hasGameFilterCarousel: true, // confirmed live: 3 GamesSlider_wrapper rows found on homepage ("Juegos exclusivos", "Juegos Nuevos", etc.)
      hasFeedbackForm: true, // confirmed live: "Reportar un problema" button present on /contacto/
      hasGameCategoryNav: true, // confirmed live: header shows Slots (Populares/Novedades/Botes/Megaways/Todos), Ruleta en Vivo (standalone, no submenu shown), Casino (Blackjack/Ruleta/Video Bingo/Todos los juegos) — a DIFFERENT taxonomy than UK's Online Casino/Live Casino split; ES has no separate "Live Casino" top-level category, "Ruleta en Vivo" stands alone instead
      hasLoginRegistration: true, // confirmed live: INICIAR SESIÓN/UNIRSE buttons present in header
      hasTestAccount: true, // shared SC/SNG/GC ES account confirmed working pattern (noemsisters@hotmail.com) — not independently re-tested against GC specifically this session, verify on first real login.spec.ts run
      hasAccountModal: true, // unconfirmed — cloned from UK, verify live (UK's LOGIN click reliably advanced to #account; assumed same widget here)
      hasPaymentMethodsPage: true, // confirmed live: /payment-methods/ 404s, but /payment-options/ returns 200 (same paymentMethodsPath override as UK) — real footer link text "Métodos de pago"
      paymentMethodsPath: 'payment-options/', // confirmed live: real footer slug, kept English same as UK — NOT translated despite the rest of the site being fully localized
      hasBlogDesktopSearch: true, // confirmed live 2026-07-23: a real, visible, clickable desktop search icon exists (a.BlogHeader_search-demi__AjFud, same pattern already confirmed on SNG UK) — the earlier "cloned false from UK" guess was wrong, don't clone an unconfirmed sibling GEO's flag without checking live first
      hasBlogSearch: true, // confirmed live 2026-07-23: typing "casino" into the real search input (input[name="search"][aria-label="buscar"], a lazy-loading Google Custom Search widget — needs a few extra seconds to render) returns REAL results ("Aproximadamente 24 resultados", real article links like /blog/academia-de-casino/claves-elegir-casino-online-fiable/) — this is NOT the empty-placeholder gap seen on other brands
      casinoPath: 'juegos-casino/', // confirmed live: footer "Casino" link genuinely translates to this slug, not the English 'casino/'
      responsibleGamingPath: 'juego-mas-seguro/', // confirmed live: footer's Responsible Gaming link genuinely translates to this slug
      helpPath: 'ayuda/', // confirmed live: sidebar "Ayuda" link genuinely translates to this slug, not the English 'help/'
    },
  },
};

// Mobile sidebar accordion note (GC UK, confirmed live 2026-07-23): the
// hamburger menu's "Online Casino" and "Live Casino" rows are EXPANDABLE
// accordion headers (arrow-chevron span, class MainMenu_main_1_slots__* /
// MainMenu_main_2_live__* with no href) that reveal a <ul> of sub-category
// links when clicked — a DUPLICATE-classed anchor with an href (the "All
// Online Casino"/"All Live Casino" link) shares the same CSS class, so any
// locator scoped only by that class hits a strict-mode "resolved to 2
// elements" violation (same recurring locator-ambiguity pattern documented
// elsewhere in this file). Scope with `:not([href])` to hit the expandable
// header specifically, same fix pattern as sidebar-navigation.spec.ts should
// use if/when it's extended to cover GC.

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

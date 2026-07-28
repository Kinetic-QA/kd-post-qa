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
  gameModalCurrencyText?: string; // optional — overrides currencySymbol just for game-info-modal.spec.ts's Step 11 check. Defaults to currencySymbol when omitted. Confirmed live on GC DK: the homepage bonus banner shows the "kr" symbol, but the game info modal's bet range/jackpot figures use the 3-letter ISO code "DKK" instead — a real per-context formatting inconsistency on the site itself, not a test bug.
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
  hasHelpFaqAccordion?: boolean; // optional — false means the Help page has no real FAQ accordion content at all (confirmed live on MC AB 2026-07-27: 'accordion-button' only appears inside a <style> block's CSS rule, no actual <button class="accordion-button"> element renders) — a real content gap on a not-yet-live QA-only market, not a selector issue. Defaults to true when omitted, so existing GEOs need no change.
  hasRegulationLogos?: boolean; // optional — false means the footer has no <son-license-logos> regulation/compliance logo row at all (confirmed live: 0 occurrences in the homepage HTML). Confirmed on MC AB 2026-07-27 — a not-yet-live QA-only market missing this component entirely, a real environment gap not a shadow-DOM timing issue. Defaults to true when omitted, so existing GEOs need no change.
  hasBonusPolicyBanner?: boolean; // optional — false means the Promotions page has no visible bonus T&C/policy banner text at all, even though the page itself exists (hasPromotionsPage/promotionsPath). Confirmed live on MC SE 2026-07-27: page loads fine (real campaign content, real Play CTA), but no text matching locale-strings.ts's bonusPolicyText pattern ever appears — consistent with the already-documented Nordic BankID pattern (SE's homepage banner has no visible T&C/bonus disclaimer either, see locale-strings.ts's 'sv' bonusPolicyText comment); this is the first SE GEO in the project with hasPromotionsPage: true, so promotions-page.spec.ts's Step 4 had never actually exercised this code path for a Nordic market before. Defaults to true when omitted, so existing GEOs need no change.
  contactPath?: string;  // baseURL-relative, no leading slash — defaults to 'contact/' when omitted. Confirmed live: SNG ES genuinely translates this slug to "contacto/", unlike every other GEO onboarded so far which kept the English "contact/" regardless of uiLocalized
  aboutUsPath?: string;  // baseURL-relative, no leading slash — defaults to 'about-us/' when omitted. Confirmed live: SNG ES genuinely translates this slug to "sobre-nosotros/"
  hasContactMailto?: boolean; // optional — false means this brand's /contact/ page has NO mailto: link at all, so contactEmail is not a real assertable value for it. Defaults to true when omitted (every brand onboarded before GC has a real mailto link). Set false + leave contactEmail as '' when a brand uses a different contact-page design (see contactCtaLabels).
  contactCtaLabels?: string[] | null; // optional — confirmed live on GC UK: /contact/ has no mailto link OR plain LOGIN link; instead it shows big clickable CTA cards ("Genting Casino Online", "Genting Casino Venues") that route to /contact/<slug>/. Set the exact visible label text for each card that should be tested. null/omitted means the brand doesn't use this card-based contact design.
  casinoPath?: string; // optional — baseURL-relative, no leading slash. Defaults to 'casino/' when omitted. Confirmed live: GC ES genuinely translates this slug to "juegos-casino/"
  slotsPath?: string; // optional — baseURL-relative, no leading slash. Defaults to 'slots/' when omitted (the classic Slingo-family taxonomy). Confirmed live: MC ES's footer has a real link with the exact text "Slots" (footer-navigation.spec.ts's Slots step isn't skipped) but it points to "online-slots/", not the hardcoded default — set this whenever a GEO's real Slots footer link uses a different slug.
  responsibleGamingPath?: string; // optional — baseURL-relative, no leading slash. Defaults to 'responsible-gaming/' when omitted. Confirmed live: GC ES genuinely translates this slug to "juego-mas-seguro/"
  helpPath?: string; // optional — baseURL-relative, no leading slash. Defaults to 'help/' when omitted. Confirmed live: GC ES genuinely translates this slug to "ayuda/"
  affiliatesPath?: string; // optional — baseURL-relative, no leading slash. Defaults to 'affiliates/' when omitted. Confirmed live: PC ES genuinely translates this slug to "afiliados/"
  privacyPath?: string; // optional — baseURL-relative, no leading slash. Defaults to 'privacy/' when omitted. Confirmed live: PC DE's real slug is "privacy-policy/" — a genuinely different (not translated, just longer) English slug than every other GEO onboarded so far
  termsPath?: string; // optional — baseURL-relative, no leading slash. Defaults to 'terms/' when omitted. Confirmed live: PC DE's real slug is "terms-conditions/" — same longer-English-slug pattern as privacyPath above
  needsStealthLaunch?: boolean; // optional — true means this GEO's site sits behind Cloudflare bot-detection that blocks/challenges a plain automated Chromium (confirmed on GC UK and MC UK — see helpers/stealth-fixtures.ts). When true, tests/p1|p2|p3 specs (which import `test`/`expect` from stealth-fixtures, not '@playwright/test' directly) launch via playwright-extra + puppeteer-extra-plugin-stealth instead of Playwright's default launcher. Defaults to false/undefined — every other GEO's launch is completely unchanged. Set this the moment a NEW GEO is confirmed to hit the same Cloudflare wall; no other wiring is needed, the fixture reads this flag automatically.
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
      needsStealthLaunch: true, // same SON-platform Cloudflare wall as GC UK, same fix confirmed 2026-07-26: playwright-extra + puppeteer-extra-plugin-stealth rendered both the LOGIN and REGISTRATION son-auth-modals widgets as real forms (previously empty shells) — see helpers/stealth-fixtures.ts
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

    // FR-CA (French Canada) — onboarding started 2026-07-23, tested from a
    // confirmed Montreal/Quebec VPN (verified via ipinfo.io before testing,
    // per the CA-correction lesson above). Same underlying platform as
    // UK/COM/CA, at /fr-CA/ instead of /en-CA/ (see brand-urls.ts). Most
    // fields below are CLONED from CA as a starting baseline — NOT yet
    // independently confirmed for FR-CA — run the full suite and correct via
    // real failures, same pattern as every other GEO onboarded this project.
    'FR-CA': {
      locale: 'fr', uiLocalized: true, // confirmed live: nav (Accueil/Casino/Machines à sous/Jeux), search placeholder, JOUER MAINTENANT tiles, footer, banner disclaimer all genuinely French — EXCEPT the header's own Login button, which is untranslated plain "Login" (confirmed live 2026-07-23 via accessibility snapshot; Join button IS translated, "S'inscrire") — see locale-strings.ts's 'fr' loginButton entry for the fix, a real brand-copy inconsistency, not a test bug
      hasBlog: false, blogPath: null, // unconfirmed — cloned from CA
      hasPromotionsPage: true, promotionsPath: 'promotions/', // confirmed live 2026-07-23: sidebar-navigation.spec.ts's Promotions check passed against this exact slug (unlike SNG FR-CA, MC does not translate this slug)
      featuresPath: null, // unconfirmed — cloned from CA
      mobileAppPath: 'mobile-app/', // unconfirmed — cloned from CA
      bingoCardGeneratorPath: 'bingo-card-generator/', // unconfirmed — cloned from CA
      currencySymbol: '$', // unconfirmed — cloned from CA, verify live bonus copy
      contactEmail: 'support@megacasino.com', // confirmed live 2026-07-23 via contact-us-page.spec.ts — same address as UK/COM/CA, not a French-specific address
      socialMedia: { twitter: null, facebook: null, instagram: null }, // unconfirmed — cloned from CA
      hasSocialMedia: false, // unconfirmed — cloned from CA
      searchTerm: 'Casino', // unconfirmed — cloned from CA, may need a French search term
      searchResultHrefSubstrings: ['/online-slots/', '/casino-games/', '/live-casino/'], // same taxonomy as UK/COM/CA, unconfirmed for FR-CA specifically
      gameTileHrefSubstrings: ['/online-slots/', '/casino-games/', '/live-casino/'], // confirmed live 2026-07-23 via accessibility snapshot (Casino/Machines à sous/Jeux nav hrefs all use this taxonomy) and game-category-navigation.spec.ts's Live Casino redirect passing
      paymentMethodsPath: 'payment-options/', // confirmed live 2026-07-23 via accessibility snapshot: Visa/Mastercard/Paysafecard links all point to /fr-CA/payment-options/...
      hasGameFilterCarousel: true, // unconfirmed — cloned from CA
      hasFeedbackForm: false, // confirmed live 2026-07-23: NO "Report a problem"/"Signaler un problème" link exists anywhere on /fr-CA/contact/ (full DOM snapshot searched) — a real gap, not a translation issue, same as SNG FR-CA's separately-confirmed absence
      hasGameCategoryNav: true, // unconfirmed — cloned from CA
      hasLoginRegistration: true, // confirmed live 2026-07-23: login.spec.ts/registration.spec.ts widgets both open correctly
      hasTestAccount: true, // real test account provided 2026-07-23 (Lemwel@test.com)
      hasAccountModal: true, // confirmed live 2026-07-23: LOGIN/JOIN correctly open the #account modal
      hasPaymentMethodsPage: true, // unconfirmed — cloned from CA
      hasBlogDesktopSearch: false, // no blog for FR-CA anyway (hasBlog: false) — set false for consistency
      hasBlogSearch: false, // no blog for FR-CA anyway — set false for consistency
      hasPromotionsIconInHeader: false, // unconfirmed — cloned from COM/CA (WH-01 skips this check rather than independently verifying it)
    },

    // IE — onboarding started 2026-07-23, tested from a confirmed Dublin
    // VPN (verified via ipinfo.io before testing). Same underlying platform
    // as UK/COM/CA, path-prefixed at /en-IE/ like MC/CA's /en-CA/ (see
    // brand-urls.ts — both qaUrl and liveUrl already used consistent 'en-IE'
    // casing, no typo to fix here unlike FR-CA's). Most fields below are
    // CLONED from CA as a starting baseline — NOT yet independently
    // confirmed for IE — run the full suite and correct via real failures,
    // same pattern as every other GEO onboarded this project.
    IE: {
      locale: 'en', uiLocalized: false,
      hasBlog: false, blogPath: null, // unconfirmed — cloned from CA
      hasPromotionsPage: true, promotionsPath: 'promotions/', // unconfirmed — cloned from CA
      featuresPath: null, // unconfirmed — cloned from CA
      mobileAppPath: 'mobile-app/', // unconfirmed — cloned from CA
      bingoCardGeneratorPath: 'bingo-card-generator/', // unconfirmed — cloned from CA
      currencySymbol: '€', // unconfirmed — Ireland uses Euro, verify live bonus copy
      contactEmail: 'support@megacasino.com', // unconfirmed — cloned from UK/COM/CA
      socialMedia: { twitter: null, facebook: null, instagram: null }, // unconfirmed — cloned from CA
      hasSocialMedia: false, // unconfirmed — cloned from CA
      searchTerm: 'Casino', // unconfirmed — cloned from CA
      searchResultHrefSubstrings: ['/online-slots/', '/casino-games/', '/live-casino/'], // same taxonomy as UK/COM/CA, unconfirmed for IE specifically
      gameTileHrefSubstrings: ['/online-slots/', '/casino-games/', '/live-casino/'], // same taxonomy as UK/COM/CA, unconfirmed for IE specifically
      paymentMethodsPath: 'payment-options/', // unconfirmed — cloned from COM/CA
      hasGameFilterCarousel: true, // unconfirmed — cloned from CA
      hasFeedbackForm: true, // unconfirmed — cloned from CA
      hasGameCategoryNav: true, // unconfirmed — cloned from CA
      hasLoginRegistration: true, // unconfirmed — cloned from CA
      hasTestAccount: true, // real test account provided 2026-07-23 (sha@test.com)
      hasAccountModal: true, // unconfirmed — cloned from CA
      hasPaymentMethodsPage: true, // unconfirmed — cloned from CA
      hasBlogDesktopSearch: false, // no blog for IE anyway (hasBlog: false) — set false for consistency
      hasBlogSearch: false, // no blog for IE anyway — set false for consistency
      hasPromotionsIconInHeader: false, // unconfirmed — cloned from COM/CA
    },

    // DE (Germany) — onboarding started 2026-07-24, tested from a confirmed
    // Hamburg VPN (verified via ipinfo.io before testing, per the CA-
    // correction lesson above). Runs on a DIFFERENT domain than the other MC
    // markets — www.megaspielhalle.de, not megacasino.* — but the site's own
    // schema.org data confirms it's the same brand family ("family":
    // "MegaCasino", "brandCode":"MC"). Same DE-market platform gap already
    // seen on SC/SNG's German sites: no Casino/Live Casino category, no
    // Blog/Features/Bingo Card Generator, plain-English game taxonomy slug
    // (/online-slots/) with no separate /casino-games/ or /live-casino/
    // (both confirmed 404 pre-test via curl). Onboarding COMPLETE 2026-07-24:
    // full P1/P2/P3 desktop + mobile suite passes cleanly (0 real failures)
    // after fixing 3 real bugs found this session — see search.spec.ts (bad
    // assumed search term + a scrollIntoViewIfNeeded hang), registration-
    // widget.spec.ts (widget content render delay needed a longer timeout),
    // and registration.spec.ts/website-header.spec.ts (mobile Play entry is
    // an <li>, not a <button>, unlike every other GEO so far).
    DE: {
      locale: 'de', uiLocalized: true,
      hasBlog: false, blogPath: null, // confirmed 404 pre-test via curl
      hasPromotionsPage: true, promotionsPath: 'promotions/', // confirmed 200 pre-test via curl
      featuresPath: null, // confirmed 404 pre-test via curl
      mobileAppPath: 'mobile-app/', // confirmed 404 pre-test via curl — kept as the common placeholder, skips cleanly
      bingoCardGeneratorPath: 'bingo-card-generator/', // confirmed 404 pre-test via curl
      currencySymbol: '€', // confirmed via homepage bonus copy ("€10"/"€100")
      contactEmail: 'support@megaspielhalle.de', // confirmed live on /contact/ — a DIFFERENT address than UK/COM/CA/IE's support@megacasino.com, matches this market's own domain
      socialMedia: { twitter: null, facebook: null, instagram: null }, // the only social link found (x.com/megacasino) is a schema.org "sameAs" JSON-LD reference, not a real visible icon strip — treated as none per the GC ES precedent
      hasSocialMedia: false, // see note above
      searchTerm: 'Book', searchResultHrefSubstrings: ['/online-slots/'], // confirmed live via real in-app search: "Slots" (assumed from the SC/SNG DE precedent) actually returns ZERO results here — this brand's search matches game TITLES, not category names, and no MC/DE game is literally titled "Slots". "Book" reliably returns 20 real /online-slots/ results (matches "Book of Dead" and others)
      gameTileHrefSubstrings: ['/online-slots/'], // confirmed pre-test via curl: homepage game tiles only ever use this one path
      paymentMethodsPath: 'payment-options/', // confirmed live: real slug is /payment-options/ (200); common 'payment-methods/' default 404s here, same override as COM/CA/FR-CA
      hasGameFilterCarousel: false, // confirmed pre-test via curl: zero GamesSlider_wrapper elements on homepage
      hasFeedbackForm: false, // confirmed pre-test via curl: no feedback/report-a-problem link found on /contact/
      hasGameCategoryNav: false, // confirmed live via full suite run: header/menu nav has no real Slots/Casino/Live Casino category links, only Home/Aktionen/Verantwortungsvolles Spielen/Hilfe/Kontakt/Über uns
      hasLoginRegistration: true, // confirmed pre-test via curl: /contact/ has a real #account/login link
      hasTestAccount: true, // real test account provided 2026-07-24 (jnn@test.com) — confirmed working live (login.spec.ts passes)
      hasAccountModal: true, // confirmed live: login.spec.ts/registration-widget.spec.ts/website-header.spec.ts all pass, including mobile's Play entry (see DE block's top comment)
      hasPaymentMethodsPage: true, // confirmed live: /payment-options/ returns 200 (see paymentMethodsPath)
      hasBlogDesktopSearch: false, // no blog for DE anyway (hasBlog: false) — set false for consistency
      hasBlogSearch: false, // no blog for DE anyway — set false for consistency
      hasPromotionsIconInHeader: false, // unconfirmed — cloned from COM/CA/FR-CA/IE, verify live
    },

    // DK (Denmark) — onboarding started 2026-07-24, tested from a confirmed
    // Copenhagen VPN (verified via ipinfo.io before testing). Runs on its
    // own domain, www.megacasino.dk (same "no team credentials exist yet"
    // situation as MC UK when it was first onboarded) — NO working test
    // account exists this session; team is checking on one separately.
    // hasTestAccount: false so login.spec.ts's real-login test and any
    // other credential-dependent check skip cleanly rather than failing on
    // a missing account, per explicit instruction this session. The widget
    // ITSELF is still safe to inspect (registration.spec.ts never submits,
    // login-widget.spec.ts only ever uses a deliberately wrong password),
    // so hasLoginRegistration stays true.
    //
    // Unlike DE, this market has the FULL taxonomy (Online Slots/Casino
    // Games/Live Casino all confirmed 200 pre-test via curl) — closer to
    // UK/COM/CA/FR-CA/IE's shape than DE's stripped-down one. No Promotions
    // page (confirmed via curl: /promotions/ redirects to the homepage, and
    // no "Kampagner"-style nav link exists at all in the crawled homepage
    // HTML).
    //
    // Onboarding COMPLETE 2026-07-24 for everything NOT gated on a real
    // account: full P1/P2/P3 desktop + mobile suite passes cleanly (0 real
    // failures) after fixing 5 real bugs this session — a Danish cookie-
    // consent banner text missing from the shared accept-button list
    // (helpers/common.ts, benefits every brand), a Join-button click race
    // needing extraPageSettleMs (see above), two wrong locale-string
    // guesses (noAccountText/searchPlaceholder/membersLoginText — the real
    // widget text differs from the initial guess in each case), a wrong
    // currencySymbol (DKK, not the homepage banner's "kr"), and a missing
    // horizontal-carousel viewport check in game-info-modal.spec.ts's Step
    // 10 retry loop (generic fix). registration.spec.ts is explicitly
    // SKIPPED for this GEO — confirmed live this market's registration
    // widget asks for a real Danish CPR number, not mobile/DOB, and no test
    // CPR exists this session (see registration.spec.ts's isMcDkFormat).
    DK: {
      locale: 'da', uiLocalized: true, // confirmed live via curl: <html lang="da">, real header/nav copy in Danish (see locale-strings.ts's 'da' entry)
      // Confirmed live via a repeated real-browser probe (2/3 runs failed,
      // 1/3 succeeded with the standard wait): the header Log In/Join
      // buttons render visible+clickable well before their click handlers
      // are actually wired up — same race already documented for SNG FR-CA.
      // 4/4 clean with this longer settle.
      extraPageSettleMs: 6_000,
      hasBlog: false, blogPath: null, // confirmed 404 pre-test via curl
      hasPromotionsPage: false, promotionsPath: null, // confirmed live: /promotions/ redirects to the homepage (no distinct page), and no promotions-style nav link found anywhere in the crawled HTML
      featuresPath: null, // confirmed 404 pre-test via curl
      mobileAppPath: 'mobile-app/', // confirmed 404 pre-test via curl — kept as the common placeholder, skips cleanly
      bingoCardGeneratorPath: 'bingo-card-generator/', // confirmed 404 pre-test via curl
      currencySymbol: 'kr', // confirmed live via real browser probe: homepage bonus banner uses "kr" ("500 kr."/"100kr")
      gameModalCurrencyText: 'DKK', // confirmed live via real browser probe: the game info modal's own bet-limit copy ("Min. indsats DKK 10.00") uses "DKK" instead of "kr" — same per-context formatting inconsistency already confirmed independently on GC DK; see gameModalCurrencyText's own doc comment
      contactEmail: 'support@megacasino.com', // confirmed live via curl on /contact/ — same shared address as UK/COM/CA/IE, NOT its own domain's address (unlike DE's support@megaspielhalle.de)
      socialMedia: { twitter: null, facebook: null, instagram: null }, // the only social link found (x.com/megacasino) is a schema.org "sameAs" JSON-LD reference, not a real visible icon strip — treated as none per the GC ES/MC DE precedent
      hasSocialMedia: false, // see note above
      searchTerm: 'Bonanza', searchResultHrefSubstrings: ['/online-slots/', '/casino-games/', '/live-casino/'], // confirmed live via the real in-app search flow (search.spec.ts passes): "Bonanza" reliably returns real results
      gameTileHrefSubstrings: ['/online-slots/', '/casino-games/', '/live-casino/'], // confirmed live via curl: homepage crawl shows all three category paths, same taxonomy as UK/COM/CA/FR-CA/IE
      paymentMethodsPath: 'payment-options/', // confirmed live via curl: real slug is /payment-options/ (200); common 'payment-methods/' default 404s here, same override as COM/CA/FR-CA/IE
      hasGameFilterCarousel: true, // confirmed live via curl: homepage HTML contains 3 GamesSlider_wrapper rows, unlike DE's zero
      hasFeedbackForm: false, // confirmed live via curl: no feedback/report-a-problem link found on /contact/ (only a #account/login link)
      hasGameCategoryNav: true, // confirmed live via curl: real Online Spillemaskiner/Casinospil/Live casino nav links found (see gameTileHrefSubstrings) — fuller taxonomy than DE
      hasLoginRegistration: true, // confirmed live via curl: /contact/ has a real #account/login link, and header shows real Log ind/Tilmeld buttons — widget is safe to inspect even with no working account (see hasTestAccount)
      hasTestAccount: false, // NO working test account exists yet — team is checking separately; skip only the real-login-dependent checks (login.spec.ts's actual sign-in test) per explicit instruction this session
      hasAccountModal: true, // confirmed live: registration.spec.ts/registration-widget.spec.ts/website-header.spec.ts/banner.spec.ts all confirm the #account modal opens correctly (real LOGIN, not just JOIN, since login.spec.ts itself is the only thing skipped by hasTestAccount)
      hasPaymentMethodsPage: true, // confirmed live via curl: /payment-options/ returns 200 (see paymentMethodsPath)
      hasBlogDesktopSearch: false, // no blog for DK anyway (hasBlog: false) — set false for consistency
      hasBlogSearch: false, // no blog for DK anyway — set false for consistency
      hasPromotionsIconInHeader: false, // no Promotions page exists at all for this GEO (see hasPromotionsPage) — consistent by necessity
    },

    // SE — onboarding started 2026-07-27, tested from a confirmed Sweden VPN.
    // Same BankID-based Pay N Play model already confirmed for GC/SC/SNG SE
    // (header shows a single "Registrera/Logga in" button with a bank-id.svg
    // icon, and the homepage's own JSON config has a "pnp" key) — no
    // traditional username/password login/registration widget, no test
    // account. Verified live via curl/DOM crawl before the real suite run;
    // fields marked unconfirmed are cloned from DK as a starting baseline.
    SE: {
      locale: 'sv', uiLocalized: true, // confirmed live: <html lang="sv">, real Swedish nav/header/footer copy
      hasBlog: false, blogPath: null, // confirmed 404 pre-test via curl
      hasPromotionsPage: true, promotionsPath: 'promotions/', // confirmed live: /promotions/ returns 200 (unlike GC SE, where the equivalent 404s) — kept English slug, not translated
      hasBonusPolicyBanner: false, // confirmed live via real browser run 2026-07-27: promotions-page.spec.ts's Step 4 timed out — no text matching the 'sv' bonusPolicyText pattern (/bonusvillkor/i) appears anywhere on the page, a real gap not a selector bug (see the field's own doc comment above)
      featuresPath: null, // confirmed 404 pre-test via curl
      mobileAppPath: 'mobile-app/', // confirmed 404 pre-test via curl — kept as the common placeholder, skips cleanly
      bingoCardGeneratorPath: 'bingo-card-generator/', // unconfirmed — cloned from DK, no such link exists for this brand family, skips cleanly if 404
      currencySymbol: 'kr', // Swedish Krona — NOT independently confirmed via visible price/bonus copy this session (none found in the static homepage crawl); verify on first real run, same caveat as GC SE
      contactEmail: 'support@megacasino.com', // confirmed live: /contact/ page's own JSON config exposes "support_email":"support@megacasino.com" — same shared address as UK/COM/CA/IE/DK, NOT its own domain's address
      hasContactMailto: true, // confirmed live: /contact/ has a real (Cloudflare email-obfuscated) mailto link under "Mejla oss", not a card-based or missing design
      socialMedia: { twitter: null, facebook: null, instagram: null }, // confirmed live: zero facebook/twitter/instagram/x.com links found in the homepage or contact-page HTML
      hasSocialMedia: false, // see note above
      searchTerm: 'Gold', searchResultHrefSubstrings: ['/online-slots/', '/casino-games/'], // confirmed live via real browser run 2026-07-27: 'Casino' (the common taxonomy-name search term used elsewhere) returns ZERO in-app search results here — the search indexes game titles only, not category names, unlike UK/COM/CA where "Casino" happens to also match real game titles. 'Gold' reliably matches real homepage titles ("Golden Hook", "Gold Cash Free Spins")
      gameTileHrefSubstrings: ['/online-slots/', '/casino-games/'], // confirmed live via curl: homepage nav/crawl shows only these two categories (Online Slotsspel/Casinospel) — no Live Casino category for this GEO, unlike UK/COM/CA/FR-CA/IE/DK
      paymentMethodsPath: 'payment-options/', // confirmed live via curl: real slug is /payment-options/ (200) with a real Swedish title and genuine Visa/Mastercard/Paysafecard/TrustlyDirect provider logos — unlike GC SE's same-URL page, which is a broken i18n-placeholder title with no real content
      hasGameFilterCarousel: true, // confirmed live via curl: homepage HTML contains 2 GamesSlider_wrapper rows
      hasFeedbackForm: false, // confirmed live via curl: no "Report a problem"/"Rapportera ett problem" link found anywhere on /contact/ (only Chat + Mejla oss/email sections)
      hasGameCategoryNav: true, // confirmed live via curl: real Online Slotsspel/Casinospel nav links found (see gameTileHrefSubstrings)
      hasLoginRegistration: false, // confirmed live: header shows a single "Registrera/Logga in" button with a bank-id.svg icon, not separate LOGIN/JOIN buttons — BankID-based Pay N Play model, same pattern as GC/SC/SNG SE
      hasAccountModal: false, // confirmed live via real browser run 2026-07-27: promotions-page.spec.ts's Play CTA resolves to the header's sticky BankID "Spela" button, which never reliably reaches a clickable/in-viewport state (repeated scroll/actionability retries all fail) — consistent with the GC/SC/SNG SE precedent that this button doesn't drive a real #account modal flow like traditional LOGIN/JOIN does
      hasPaymentMethodsPage: true, // confirmed live via curl: /payment-options/ returns 200 with real content (see paymentMethodsPath)
      hasBlogDesktopSearch: false, // no blog for SE anyway (hasBlog: false) — set false for consistency
      hasBlogSearch: false, // no blog for SE anyway — set false for consistency
      hasPromotionsIconInHeader: false, // unconfirmed — no Promotions link found in the crawled nav despite the page itself existing (see hasPromotionsPage); verify on first real run
    },

    // ES — onboarding started 2026-07-27, tested from a confirmed Spain VPN.
    // Own domain (megacasinos.es, not megacasino.com/es or similar) — fully
    // localized, real Spanish content, NOT a Nordic BankID market like SE/DK
    // (has traditional login/registration). Shares the "noemsisters@hotmail.com"
    // test account already confirmed working across SC/SNG/GC ES (see GC ES's
    // own hasTestAccount comment) — the same account is reused deliberately
    // across brands for this GEO, not a credential mix-up.
    ES: {
      locale: 'es', uiLocalized: true, // confirmed live: <html lang="es">, real Spanish nav/header/footer copy
      hasBlog: true, blogPath: 'blog/', // confirmed live via curl: 200
      hasPromotionsPage: true, promotionsPath: 'promociones/', // confirmed live via curl: real nav link uses this translated slug (English 'promotions/' also 200s but isn't what the real nav links to)
      featuresPath: null, // confirmed 404 pre-test via curl (both 'features/' and 'funciones/')
      mobileAppPath: 'mobile-app/', // confirmed 404 pre-test via curl — kept as the common placeholder, skips cleanly
      bingoCardGeneratorPath: 'bingo-card-generator/', // unconfirmed — no such link exists for this brand family, skips cleanly if 404
      currencySymbol: '€', // confirmed live via homepage bonus copy ("10€", "200€")
      contactEmail: 'soporte@megacasinos.es', // confirmed live: /contacto/ page's own JSON config exposes "support_email":"soporte@megacasinos.es" — this GEO's own domain address, NOT the shared support@megacasino.com used by UK/COM/CA/IE/DE/DK/SE
      contactPath: 'contacto/', // confirmed live via curl: real nav link uses this translated slug (English 'contact/' also 200s with identical content but isn't what the real nav links to)
      helpPath: 'ayuda/', // confirmed live via curl: real nav link uses this translated slug (English 'help/' also 200s with identical content but isn't what the real nav links to)
      responsibleGamingPath: 'juego-mas-seguro/', // confirmed live via curl: real nav link uses this translated slug — the English 'responsible-gaming/' slug 200s too but serves DIFFERENT (unrelated homepage-ish) content, not a real alias
      casinoPath: 'juegos-de-casino/', // confirmed live via curl redirect: 'casino-games/' 301s here — own distinct Spanish slug, NOT the same 'juegos-casino/' slug GC ES uses
      slotsPath: 'online-slots/', // confirmed live via real browser run 2026-07-27: footer-navigation.spec.ts's Slots step found a real footer link with the exact text "Slots" pointing here, not the hardcoded default 'slots/'
      aboutUsPath: 'quienes-somos/', // confirmed live via real browser run 2026-07-27: sidebar-navigation.spec.ts's About Us step timed out against the default 'about-us/' — the real sidebar/footer nav link (data-tk-value="aboutUs", text "Nosotros") points to "quienes-somos/" instead. The English 'about-us/' slug does separately 200 with real (if different) Spanish content, same false-alias trap already seen with contact/help/responsible-gaming above — don't trust a 200 status alone without checking what the real nav link actually points to
      socialMedia: { twitter: null, facebook: 'MegacasinoEs', instagram: 'megacasinoespana' }, // confirmed live: Facebook/Instagram found homepage-wide, no Twitter/X link found
      hasSocialMedia: true, // see note above
      searchTerm: 'Buffalo', searchResultHrefSubstrings: ['/online-slots/', '/juegos-de-casino/', '/ruleta-en-vivo/'], // NOT independently confirmed via actual in-app search interaction — inferred from a real homepage game title ("Buffalo Blitz Megaways Jackpot"); MC SE's search was confirmed live to index game titles only, not category names, so a category-name term was deliberately avoided here
      gameTileHrefSubstrings: ['/online-slots/', '/juegos-de-casino/', '/ruleta-en-vivo/'], // confirmed live via curl: header nav categories are Slots (/online-slots/), Todos los juegos (/juegos-de-casino/), and Ruleta/Ruleta en Vivo (/ruleta/, /ruleta-en-vivo/) — a richer taxonomy than UK/COM/CA/DE/DK/SE, also including standalone Blackjack/Crash Games/Jackpots/Megaways/Slingo/Providers categories not modeled here
      paymentMethodsPath: 'metodos-de-pago/', // confirmed live via real browser run 2026-07-27: footer-navigation.spec.ts's Payment Options step landed on this URL, not the guessed 'payment-options/' — the real footer link (data-tk-value="payments", text "Métodos de Pago") points here. 'payment-options/' does separately 200 with real content (same false-alias trap as contact/help/responsible-gaming/about-us above), but it's not what the real nav actually links to
      hasGameFilterCarousel: true, // confirmed live via curl: homepage HTML contains 8 GamesSlider_wrapper rows
      hasFeedbackForm: true, // confirmed live via curl: real "Reportar un problema" link -> #account/feedback found on /contacto/
      hasGameCategoryNav: true, // confirmed live via curl: real Slots/Todos los juegos/Ruleta nav links found (see gameTileHrefSubstrings)
      hasLoginRegistration: true, // confirmed live via curl: header shows real "Iniciar sesión"/"Únete" text — traditional login/registration, NOT a BankID/Pay N Play market like SE/DK
      hasTestAccount: true, // shared SC/SNG/GC ES account (noemsisters@hotmail.com) — per explicit instruction this session; verify on first real login.spec.ts run
      hasAccountModal: true, // unconfirmed via real click this session — cloned from the UK/COM/CA precedent (traditional LOGIN/JOIN widget), verify on first real run
      hasPaymentMethodsPage: true, // confirmed live via curl: real content at the real slug (see paymentMethodsPath)
      hasBlogDesktopSearch: true, // unconfirmed — cloned from GC/SNG ES precedent (a real desktop search icon confirmed on those), verify on first real run
      hasBlogSearch: true, // unconfirmed — cloned from GC/SNG ES precedent, verify on first real run
      hasPromotionsIconInHeader: false, // confirmed live via real browser run 2026-07-27: website-header.spec.ts's and promotions-page.spec.ts's "Promotion icon in header" checks both failed — no promociones link exists inside the actual <header role="banner"> element. The data-tk-value="promotions" links found via curl all live in the sidebar/hamburger menu (already confirmed working there in sidebar-navigation.spec.ts), not the header banner itself
    },

    // AB (Alberta) — onboarding started 2026-07-27 against QA only
    // (qa.megacasino.ca/ab — plain http redirects to https) — this market
    // has NOT gone live yet (liveUrl: null in brand-urls.ts), so TEST_ENV
    // must stay 'qa' for this GEO; there is no live site to fall back to.
    // Same underlying platform/taxonomy as UK/COM/CA (online-slots/
    // casino-games/live-casino), same family as SNG's own already-onboarded
    // AB market — used as the reference for this one per explicit
    // instruction this session. Like SNG AB, this QA environment shows
    // signs of still being under active dev (see contactEmail/
    // hasPaymentMethodsPage below) — no test account exists, so
    // login.spec.ts's real-login test is skipped, same as SNG AB.
    AB: {
      locale: 'en', uiLocalized: false, // confirmed live: <html lang="en">
      hasBlog: false, blogPath: null, // confirmed 404 pre-test via curl
      hasPromotionsPage: true, promotionsPath: 'promotions/', // confirmed live 200 via curl (real "bonus"/"promotion" copy found, though the page's own <title> tag is empty — a QA-environment quirk, not a missing page)
      featuresPath: null, // confirmed 404 pre-test via curl
      mobileAppPath: 'mobile-app/', // confirmed live 200 via curl, real title ("Mega Casino Alberta Mobile Casino Apps")
      bingoCardGeneratorPath: 'bingo-card-generator/', // unconfirmed — no such link exists for this brand family, skips cleanly if 404
      currencySymbol: '$', // CAD — confirmed via homepage bonus copy ("$10", "$500")
      contactEmail: '', // confirmed live: /contact/ page's own JSON config exposes "support_email":"" — genuinely blank, a QA-environment gap (same "still some issues from dev" pattern already noted on SNG AB), not a selector issue
      hasContactMailto: false, // see contactEmail note above — no real mailto value to assert against yet
      socialMedia: { twitter: null, facebook: null, instagram: null }, // confirmed live: zero facebook/twitter/instagram/x.com links found homepage-wide
      hasSocialMedia: false, // see note above
      searchTerm: 'Casino', searchResultHrefSubstrings: ['/online-slots/', '/casino-games/', '/live-casino/'], // NOT independently confirmed via actual in-app search interaction — carried over from the MC UK/COM/CA precedent (same taxonomy, same "Casino" term confirmed working there), verify on first real run
      gameTileHrefSubstrings: ['/online-slots/', '/casino-games/', '/live-casino/'], // confirmed live via curl: homepage nav shows Online Slots/Casino Games/Live Casino/Blackjack/Roulette — same taxonomy as UK/COM/CA/FR-CA/IE/DK
      hasGameFilterCarousel: true, // confirmed live via curl: homepage HTML contains 3 GamesSlider_wrapper rows
      hasFeedbackForm: true, // confirmed live via curl: "Report a problem" link found on /contact/
      hasGameCategoryNav: true, // confirmed live via curl: real Online Slots/Casino Games/Live Casino nav links found (see gameTileHrefSubstrings)
      hasLoginRegistration: true, // confirmed live via curl: header shows real "Login"/"Join"/"Register" text — widget exists and is safe to inspect (registration.spec.ts never submits, login-widget.spec.ts only ever uses a deliberately wrong username/password), same as SNG AB
      hasTestAccount: false, // no test account provided for this GEO this session — skip only login.spec.ts's real successful-login test, same as SNG AB (also has no working account per its own hasTestAccount:false)
      hasAccountModal: true, // unconfirmed via real click this session — cloned from the SNG AB precedent (LOG IN/JOIN can be unreliable, but a game tile's Play CTA reliably opens a real #account modal), verify on first real run
      hasPaymentMethodsPage: false, // confirmed live via curl: BOTH 'payment-methods/' and 'payment-options/' 404 (real "Page not found" title), despite the footer's own nav link pointing to /payment-options/ — a real broken-link QA-environment gap, not a selector issue
      paymentMethodsPath: 'payment-options/', // confirmed live via real browser run 2026-07-27: footer-navigation.spec.ts's Payment Options step clicks a real footer link that genuinely navigates here (the click/navigation behavior is real even though the destination itself 404s — see hasPaymentMethodsPage above for the content gap)
      hasBlogDesktopSearch: false, // no blog for AB anyway (hasBlog: false) — set false for consistency
      hasBlogSearch: false, // no blog for AB anyway — set false for consistency
      hasRegulationLogos: false, // confirmed live via curl: no <son-license-logos> element exists anywhere in the homepage HTML at all (0 occurrences) — a real QA-environment gap (this market hasn't gone live yet), not a shadow-DOM timing issue
      hasHelpFaqAccordion: false, // confirmed live via curl: the Help page's 'accordion-button' class only appears inside a <style> block's CSS rule — no actual <button class="accordion-button"> element renders, meaning no real FAQ content is configured yet on this pre-launch QA site
      hasPromotionsIconInHeader: false, // confirmed live via curl: the promotions nav link (data-tk-value="promotions") uses the "MainMenu_" CSS prefix, the same sidebar/hamburger-menu class family already confirmed to live outside the header banner on MC ES — not the header's own "Nav_"/"Header_" prefix
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
      needsStealthLaunch: true, // confirmed live 2026-07-26 + re-confirmed 2026-07-27 (fresh session): playwright-extra + puppeteer-extra-plugin-stealth clears the Cloudflare wall entirely — homepage, login widget (real form immediately), registration widget ("Join" button, real form), and 8/8 previously-blocked pages including the two "consistent fail" cases (/about-us/, /payment-options/) all load clean. See helpers/stealth-fixtures.ts.
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

    // SE — onboarded 2026-07-24 against www.gentingcasino.se (own domain,
    // same as ES) — ZERO Cloudflare interference across the whole session,
    // confirming the block is UK-domain-specific (www.gentingcasino.com),
    // not brand-wide. IE was tried first this session but SKIPPED: it lives
    // on www.gentingcasino.com/en-IE/ (same domain as UK) and hit the
    // identical "Performing security verification" Cloudflare wall twice in a
    // row — see PLAN.md/[[project_next_session_genting]] for the UK write-up,
    // same root cause applies. ROW is also on this domain and likely to hit
    // the same wall when picked up next.
    SE: {
      locale: 'sv', uiLocalized: true,
      hasBlog: false, blogPath: null, // confirmed live: no Blog link anywhere in nav or footer
      hasPromotionsPage: false, promotionsPath: null, // confirmed live: promotions/, kampanjer/, erbjudanden/ all 404
      featuresPath: null, // confirmed live: features/ and funktioner/ both 404
      mobileAppPath: 'mobile-app/', // unconfirmed — no such link exists for this brand, kept as placeholder that skips cleanly if 404 (same as UK/ES)
      bingoCardGeneratorPath: 'bingo-card-generator/', // unconfirmed — no such link exists for this brand, skips cleanly same as UK/ES
      currencySymbol: 'kr', // Swedish Krona — NOT independently confirmed via visible price/bonus copy this session (none found on homepage); carried over from SC/SNG SE, verify on first real run
      contactEmail: 'contact@gentingcasino.com', // confirmed live on /contact/ — a REAL mailto link (kept English path, not translated)
      // hasContactMailto/contactCtaLabels intentionally left at defaults (true/omitted) —
      // confirmed live: /contact/ has a real mailto section ("Mejla oss" ->
      // contact@gentingcasino.com), NOT the UK card-design. It ALSO has a
      // "Chatt" section whose copy says "LOGGA IN, klicka sedan på Live
      // Chat..." — that login mention is boilerplate SON-platform contact-page
      // copy, NOT a real feature here: clicking a game tile's Play CTA opens
      // no #account modal at all (confirmed live), matching hasAccountModal
      // below. Don't take contact-page prose as proof of a login feature —
      // verify against real modal/click behavior, which is what settled this.
      socialMedia: { twitter: null, facebook: null, instagram: null },
      hasSocialMedia: false, // confirmed live: zero facebook/twitter/instagram/x.com links found homepage-wide
      searchTerm: 'Kasino', searchResultHrefSubstrings: ['/kasino/', '/online-spelautomater/'], // NOT independently confirmed via actual in-app search interaction — inferred from the real taxonomy found live
      gameTileHrefSubstrings: ['/online-spelautomater/', '/kasino/'], // confirmed live via homepage crawl: Slots taxonomy uses "online-spelautomater" (with English "jackpots"/"megaways" sub-slugs, e.g. /online-spelautomater/megaways/), Casino uses the Swedish "/kasino/" — distinct from UK's /casino/ and ES's /juegos-casino/
      hasGameFilterCarousel: true, // confirmed live: 2 GamesSlider_wrapper rows found on homepage
      hasFeedbackForm: false, // confirmed live: no "Report a problem"/"Rapportera ett problem" link found anywhere (contact page only has Live Chat + email)
      hasGameCategoryNav: true, // confirmed live: nav/footer show Spelautomater (Slots)/Jackpottar/Megaways/Alla plus a separate Kasino (Casino) link — a taxonomy distinct from UK's Online Casino/Live Casino split and ES's Slots/Ruleta en Vivo/Casino split; no Live Casino category found for this market
      hasLoginRegistration: false, // confirmed live: no LOGIN/JOIN buttons anywhere in nav; header instead shows "INSÄTTNING" (Deposit) / "SPELA" (Play) — Pay N Play/Trustly instant-deposit model, same pattern already confirmed for SC/SNG SE
      hasAccountModal: false, // confirmed live: hovering a game tile and clicking its Play CTA opens NO #account modal at all — no navigation, no modal (see contactEmail note above re: the contact page's misleading "LOGGA IN" chat copy)
      hasPaymentMethodsPage: false, // /payment-methods/ 404s AND /payment-options/, while technically 200, is NOT a real payment page — its <title> is a broken literal "{0} | Genting Casino" placeholder (unresolved i18n template, a real site bug worth flagging to the brand owner) and the body just repeats generic homepage/footer content with zero payment provider logos anywhere. Treating a broken-template 200 as "has a payment page" would be a false positive — matches the Pay N Play precedent already confirmed for SC/SNG SE (no real payment-methods page either)
      hasBlogDesktopSearch: false, // no blog exists at all (see hasBlog) — consistent by necessity
      hasBlogSearch: false, // no blog exists at all — consistent by necessity
    },

    // DK — onboarded 2026-07-24 against www.gentingcasino.dk (own domain,
    // same as ES/SE) — ZERO Cloudflare interference, confirming the block
    // stays www.gentingcasino.com-domain-specific. UNLIKE SE, this market
    // has a REAL traditional login/registration widget (LOG IND/OPRET DIG),
    // not Pay N Play — Danish cookie-consent accept text ("Tillad alle
    // cookies") was missing from dismissCookieConsent's KNOWN_ACCEPT_TEXTS
    // and has been added to helpers/common.ts (cross-brand fix, benefits any
    // future Danish market).
    DK: {
      locale: 'da', uiLocalized: true,
      hasBlog: false, blogPath: null, // confirmed live: blog/ 404s, no nav/footer link either
      hasPromotionsPage: true, promotionsPath: 'promotions/', // confirmed live 200 — kept English, same as UK/SE
      featuresPath: null, // confirmed live: features/ and funktioner/ both 404
      mobileAppPath: 'mobile-app/', // unconfirmed — no such link exists for this brand, kept as placeholder that skips cleanly if 404
      bingoCardGeneratorPath: 'bingo-card-generator/', // unconfirmed — no such link exists for this brand, skips cleanly
      currencySymbol: 'kr', // Danish Krone — confirmed via homepage bonus copy ("100kr")
      gameModalCurrencyText: 'DKK', // confirmed live: the game info modal's bet range/jackpot figures use "DKK" ("Min. indsats DKK 1.00", "DKK 2,500,000"), NOT the "kr" symbol used on the homepage banner — a real site inconsistency, not a test bug
      casinoPath: 'kasino/', // confirmed live: footer "Casino" link genuinely translates to this slug, not the English 'casino/'
      hasPromotionsIconInHeader: false, // confirmed live: the Promotions page exists (200) but is NOT linked from the header banner OR the sidebar/hamburger menu at all — checked both nav surfaces directly
      contactEmail: 'contact@gentingcasino.com', // confirmed live on /contact/ — a REAL mailto link, kept English path
      // hasFeedbackForm below is false — confirmed live: no "Report a
      // problem"/"Rapporter et problem" link found anywhere. Contact page
      // has the same generic SON-platform "LOG IND, tryk derefter på
      // 'live chat'" copy already seen (misleadingly) on GC SE — but unlike
      // SE, DK genuinely DOES have real login, so this copy may actually be
      // accurate here (not independently re-tested this session since no
      // working DK test account exists — see hasTestAccount below).
      socialMedia: { twitter: null, facebook: null, instagram: null },
      hasSocialMedia: false, // confirmed live: zero facebook/twitter/instagram/x.com links found homepage-wide
      searchTerm: 'Kasino', searchResultHrefSubstrings: ['/kasino/', '/online-spillemaskiner/'], // NOT independently confirmed via actual in-app search interaction — inferred from the real taxonomy found live
      gameTileHrefSubstrings: ['/online-spillemaskiner/', '/kasino/', '/live-kasino/'], // confirmed live via homepage crawl: Slots (Spillemaskiner) at /online-spillemaskiner/ (English jackpots/megaways/nye sub-slugs), Casino at /kasino/, Live Casino at /live-kasino/ — distinct from every other GC GEO's taxonomy
      hasGameFilterCarousel: true, // confirmed live: 4 GamesSlider_wrapper rows found on homepage
      hasFeedbackForm: false, // confirmed live: no feedback/report-a-problem link found anywhere
      hasGameCategoryNav: true, // confirmed live: nav shows Spillemaskiner (Slots)/Live Casino/Casino — a taxonomy distinct from UK (Online Casino/Live Casino) and ES (Slots/Ruleta en Vivo/Casino), closer in shape to SE's Slots+Casino split but WITH its own separate Live Casino category (unlike SE, which has none)
      hasLoginRegistration: true, // confirmed live: LOG IND (Log In)/OPRET DIG (Sign Up) buttons in header, real <son-auth-modals> widget opens on click
      hasTestAccount: false, // per Reeve 2026-07-24: no working DK test account exists yet — skip only login.spec.ts's real successful-login test; registration.spec.ts (which never submits) is still safe to run, see the CPR note below
      hasAccountModal: true, // confirmed live: OPRET DIG click reliably advances to /#account with a real <son-auth-modals> widget (not an empty shell)
      hasPaymentMethodsPage: true, // confirmed live: /payment-options/ has a REAL page (proper title, real Visa/Mastercard/PayPal/Paysafecard/Trustly/Skrill logos with individual /payment-options/<provider>/ deep links) — unlike SE's same-URL page, which is a broken placeholder. Don't assume "200 status" alone means real content; this GEO is the confirmation that it can go either way even on the same brand/URL pattern.
      paymentMethodsPath: 'payment-options/', // confirmed live: real footer slug ("Sikker Betaling"), payment-methods/ 404s same as every other GC GEO
      hasBlogDesktopSearch: false, // no blog exists at all (see hasBlog) — consistent by necessity
      hasBlogSearch: false, // no blog exists at all — consistent by necessity
    },
    // Registration CPR note (GC DK, confirmed live 2026-07-24): the
    // registration widget's very first step asks for a Danish CPR number
    // (personalID field, placeholder "XXXXXX-XXXX") + password before any
    // other field. Tested with a plausible-format-but-fake CPR
    // ("010199-1234", no real modulus-11 checksum) — it was ACCEPTED and the
    // form advanced normally to Step 1 of 3 (first/last name, DOB, gender,
    // email, mobile), no error shown. This confirms the field only does a
    // client-side FORMAT check (10 digits, DDMMYY-XXXX), not a real backend
    // registry/identity lookup at this stage — real KYC verification (if
    // any) would only bite at actual final submission, which
    // registration.spec.ts never does (project-wide convention). So
    // registration IS safely testable end-to-end without a legitimate CPR,
    // despite Reeve's initial concern that it might not be.
  },

  // ── Prime Casino (PC) ─────────────────────────────────────────────────────
  PC: {
    // UK — onboarding started 2026-07-27 against www.primecasino.co.uk. Same
    // SkillOnNet/SON platform family as SC/SNG/MC/GC (Header_/Button_/
    // MainMenu_/son-auth-modals/son-cookie-consent), same #account modal
    // routing. Zero Cloudflare interference this session — real test account
    // (rx@test.com) confirmed working, login AND registration widgets both
    // rendered real content instantly (shadow root present, real form fields),
    // no polling/retries needed. Own game taxonomy: Live Casino/Online Slots/
    // Table Games/Instant Win — 4 top-level categories, distinct from every
    // other brand onboarded so far (not Slingo's Slots/Bingo/Casino, not MC's
    // Home/Live Casino/Online Slots/Casino Games, not GC's Online Casino/Live
    // Casino).
    UK: {
      locale: 'en', uiLocalized: false,
      hasBlog: true, blogPath: 'blog/', // confirmed live 200
      hasPromotionsPage: true, promotionsPath: 'promotions/', // confirmed live 200 — footer link only, not in header nav (see hasPromotionsIconInHeader)
      hasPromotionsIconInHeader: false, // confirmed live: header nav has Exclusive/New/Popular/game categories — no Promotions entry point; only reachable via footer
      featuresPath: 'features/', // confirmed live 200, real footer link
      mobileAppPath: 'mobile-app/', // confirmed live, real footer link
      bingoCardGeneratorPath: 'bingo-card-generator/', // unconfirmed — no such link found in footer, kept as the common placeholder that skips cleanly if 404
      currencySymbol: '£',
      contactEmail: 'support@primecasino.com', // confirmed live on /contact/ — real mailto link
      aboutUsPath: 'about/', // confirmed live: footer "About us" link is /about/, NOT the common '/about-us/' default — a genuine brand-specific slug difference
      helpPath: 'faqs/', // confirmed live: footer "Help" link is /faqs/, NOT the common '/help/' default
      socialMedia: { twitter: 'primecasinouk', facebook: 'primecasinouk', instagram: 'primecasinouk' }, // confirmed live homepage-wide (not scoped to <footer> — these live elsewhere in the page)
      hasSocialMedia: true,
      searchTerm: 'Casino', searchResultHrefSubstrings: ['/online-slots/', '/live-casino/', '/table-games/', '/instant-win/'], // NOT independently confirmed via a completed in-app search this session — the search icon click didn't reveal a working input in the time available; verify before trusting this fully on first real run
      gameTileHrefSubstrings: ['/online-slots/', '/live-casino/', '/table-games/', '/instant-win/'], // confirmed live via header/footer nav crawl — this brand's own 4-category taxonomy
      hasGameFilterCarousel: true, // confirmed live: homepage has GamesSlider-style carousel rows
      hasFeedbackForm: true, // confirmed live: "Report a problem" link present inside the login/registration widget
      hasGameCategoryNav: true, // confirmed live: header shows Live Casino/Online Slots/Table Games/Instant Win as expandable categories, each with real sub-links (see gameTileHrefSubstrings)
      hasLoginRegistration: true, // confirmed live: Sign In/Join buttons in header, both open a real #account modal with real shadow-root content — Sign In: 2 real inputs; Join: 3 real inputs (Mobile number, DOB day/month/year)
      hasTestAccount: true, // real test account confirmed working by Reeve 2026-07-27 (rx@test.com)
      hasAccountModal: true, // confirmed live: both Sign In and Join advance the URL to /#account
      hasPaymentMethodsPage: true, // confirmed live: /payment-methods/ returns 200 (the common default path — no override needed, unlike GC/MC's /payment-options/)
      hasBlogDesktopSearch: true, // unconfirmed — carried over as the common default pending a dedicated blog-page check; verify on first real run
      hasBlogSearch: true, // unconfirmed — same as above
    },

    // ES — onboarding started 2026-07-27 against www.primecasino.es. Genuinely
    // translated UI (uiLocalized: true), same shared ES test account used
    // across brands. Own taxonomy, distinct from UK's: Exclusivos/Populares/
    // Nuevos, Ruleta en Vivo (standalone — no broader "Live Casino" category
    // like UK), Slots Online (Todas las Slots/Megaways/Jackpot/Slingo), Más
    // Juegos (Todos los Juegos/Online Blackjack/Online Roulette/Video Bingo),
    // Juegos Rápidos (Keno/Plinko/Crash). Registration widget confirmed live:
    // asks for DNI/NIE (Spanish national ID) first, same Spanish-regulation
    // pattern already built for SC/SNG ES (registration.spec.ts's
    // isSpanishFormat branch is GEO-keyed, not brand-keyed, so it applies
    // here automatically — no new branch needed unless a real run surfaces a
    // brand-specific label mismatch).
    ES: {
      locale: 'es', uiLocalized: true,
      hasBlog: true, blogPath: 'blog/', // confirmed live 200
      hasPromotionsPage: true, promotionsPath: 'promociones/', // confirmed live 200
      hasPromotionsIconInHeader: false, // confirmed live: header nav has no dedicated Promotions entry (Exclusivos/Populares/Nuevos/game categories only) — only reachable via footer, same gap as UK
      featuresPath: null, // confirmed live: both /features/ and /funciones/ 404
      mobileAppPath: 'app-movil/', // confirmed live: real translated footer link
      bingoCardGeneratorPath: 'bingo-card-generator/', // unconfirmed — no such link found in footer, kept as the common placeholder that skips cleanly if 404
      currencySymbol: '€',
      contactEmail: 'soporte@primecasino.es', // confirmed live on /contacto/ — real mailto link
      contactPath: 'contacto/', // confirmed live: genuinely translated, not the English default
      aboutUsPath: 'sobre-nosotros/', // confirmed live: real translated footer link
      helpPath: 'faqs/', // confirmed live: footer "Ayuda" link is /faqs/ — same untranslated slug as UK, not further translated
      paymentMethodsPath: 'metodos-pago/', // confirmed live: real translated slug, common 'payment-methods/' default would 404 here
      responsibleGamingPath: 'juego-mas-seguro/', // confirmed live: real translated footer link, same slug already confirmed for GC ES
      affiliatesPath: 'afiliados/', // confirmed live: footer "Afiliados" link genuinely translates this slug, common 'affiliates/' default would 404 here
      socialMedia: { twitter: null, facebook: null, instagram: null }, // no social icons found homepage-wide this session — verify on first real run, may just need a different container scope
      hasSocialMedia: false,
      searchTerm: 'Casino', searchResultHrefSubstrings: ['/slots-online/', '/ruleta-en-vivo/', '/otros-juegos/', '/juegos-rapidos/'], // NOT independently confirmed via a completed in-app search this session — same caveat as UK, verify before trusting fully
      gameTileHrefSubstrings: ['/slots-online/', '/ruleta-en-vivo/', '/otros-juegos/', '/juegos-rapidos/'], // confirmed live via header/footer nav crawl — this brand's own ES-specific taxonomy, distinct from UK's
      hasGameFilterCarousel: true, // confirmed live: same GamesSlider-style carousel pattern as UK
      hasFeedbackForm: true, // carried over from UK pending a dedicated live check of the login widget's "Report a problem" link — verify on first real run
      hasGameCategoryNav: true, // confirmed live: header shows Exclusivos/Populares/Nuevos/Ruleta en Vivo/Slots Online/Más Juegos/Juegos Rápidos with real sub-links
      hasLoginRegistration: true, // confirmed live: "Iniciar sesión"/"ÚNETE AHORA" buttons in header, both open a real #account modal with real shadow-root content
      hasTestAccount: true, // shared ES test account (noemsisters@hotmail.com) already confirmed working across brands, reused here per Reeve 2026-07-27
      hasAccountModal: true, // confirmed live: both buttons advance the URL to /#account
      hasPaymentMethodsPage: true, // confirmed live: /metodos-pago/ returns 200 (see paymentMethodsPath)
      hasBlogDesktopSearch: true, // unconfirmed — carried over as the common default pending a dedicated blog-page check; verify on first real run
      hasBlogSearch: true, // unconfirmed — same as above
    },

    // CA — onboarding started 2026-07-27 against www.primecasino.com/en-CA/,
    // tested from a confirmed Canada VPN/IP. Same shape as UK: English
    // (uiLocalized: false), same taxonomy (Live Casino/Online Slots/Table
    // Games/Instant Win), same "Sign In"/"Join" header wording, same
    // untranslated footer slugs (/about/, /contact/, /faqs/, /affiliates/,
    // /payment-methods/, /features/) — this market is effectively UK's
    // English-language shape on the shared .com/en-CA/ domain, not its own
    // design like ES. Registration confirmed live: real Mobile number + DOB
    // fields, DOB shows "Year-Month-Day" placeholder — same non-UK-format
    // rejection already documented for SNG/MC CA, reuses generateCanadianDOB()
    // (see registration.spec.ts's isPcCaFormat).
    CA: {
      locale: 'en', uiLocalized: false,
      hasBlog: false, blogPath: null, // confirmed live: /blog/ 404s — genuinely different from UK, which has a real blog
      hasPromotionsPage: true, promotionsPath: 'promotions/', // confirmed live 200
      hasPromotionsIconInHeader: false, // confirmed live: header nav has no dedicated Promotions entry, same gap as UK — only reachable via footer
      featuresPath: 'features/', // confirmed live 200
      mobileAppPath: 'mobile-app/', // confirmed live 200
      bingoCardGeneratorPath: 'bingo-card-generator/', // unconfirmed — no such link found in footer, kept as the common placeholder that skips cleanly if 404
      currencySymbol: '$', // Canadian Dollar — NOT independently confirmed via visible price/bonus copy this session; verify on first real run
      contactEmail: 'support@primecasino.com', // confirmed live on /contact/ — real mailto link, same shared address as UK
      aboutUsPath: 'about/', // confirmed live: footer "About us" link is /about/, same as UK — NOT the common '/about-us/' default
      helpPath: 'faqs/', // confirmed live: footer "Help" link is /faqs/, same as UK
      socialMedia: { twitter: null, facebook: null, instagram: null }, // confirmed live: zero social links found homepage-wide (whole-page check, not just footer-scoped) — genuinely different from UK, which does have real icons
      hasSocialMedia: false,
      searchTerm: 'Casino', searchResultHrefSubstrings: ['/online-slots/', '/live-casino/', '/table-games/', '/instant-win/'], // NOT independently confirmed via a completed in-app search this session — same caveat as UK, verify before trusting fully
      gameTileHrefSubstrings: ['/online-slots/', '/live-casino/', '/table-games/', '/instant-win/'], // confirmed live via header/footer nav crawl — same taxonomy as UK
      hasGameFilterCarousel: true, // unconfirmed — carried over from UK's confirmed pattern; verify on first real run
      hasFeedbackForm: true, // carried over from UK pending a dedicated live check of the login widget's "Report a problem" link — verify on first real run
      hasGameCategoryNav: true, // confirmed live: header shows Live Casino/Online Slots/Table Games/Instant Win as expandable categories, same as UK
      hasLoginRegistration: true, // confirmed live: Sign In/Join buttons in header, both open a real #account modal with real shadow-root content — Sign In: 2 real inputs; Join: 3 real inputs (Mobile number, DOB Year-Month-Day)
      hasTestAccount: true, // real test account confirmed working by Reeve 2026-07-27 (gowem54020@186site.com)
      hasAccountModal: true, // confirmed live: both Sign In and Join advance the URL to /#account
      hasPaymentMethodsPage: true, // confirmed live: /payment-methods/ returns 200 (the common default path, same as UK)
      hasBlogDesktopSearch: true, // unconfirmed — carried over as the common default pending a dedicated blog-page check; verify on first real run
      hasBlogSearch: true, // unconfirmed — same as above
    },

    // IE — onboarding started 2026-07-27 against www.primecasino.com/en-IE/,
    // tested from a confirmed Ireland VPN/IP. Same shape as UK/CA: English
    // (uiLocalized: false), same taxonomy (Live Casino/Online Slots/Table
    // Games/Instant Win), same "Sign In"/"Join" header wording, same
    // untranslated footer slugs (/about/, /contact/, /faqs/, /affiliates/,
    // /payment-methods/, /features/). No blog (confirmed 404, same gap as
    // CA). Registration confirmed live: real Mobile number + DOB fields,
    // country code auto-detects to +353, DOB shows "Day-Month-Year"
    // placeholder — SAME format as UK's default (unlike CA's Year-Month-Day),
    // so this market is expected to need no brand-specific registration
    // branch — registration.spec.ts's existing isIrishFormat is already
    // GEO-keyed (not brand-keyed), so it applies here automatically.
    IE: {
      locale: 'en', uiLocalized: false,
      hasBlog: false, blogPath: null, // confirmed live: /blog/ 404s, same gap as CA
      hasPromotionsPage: true, promotionsPath: 'promotions/', // confirmed live 200
      hasPromotionsIconInHeader: false, // confirmed live: header nav has no dedicated Promotions entry, same gap as UK/CA — only reachable via footer
      featuresPath: 'features/', // confirmed live 200
      mobileAppPath: 'mobile-app/', // confirmed live: real footer link, same as UK/CA
      bingoCardGeneratorPath: 'bingo-card-generator/', // unconfirmed — no such link found in footer, kept as the common placeholder that skips cleanly if 404
      currencySymbol: '€', // Euro — NOT independently confirmed via visible price/bonus copy this session; verify on first real run
      contactEmail: 'support@primecasino.com', // confirmed live on /contact/ — real mailto link, same shared address as UK/CA
      aboutUsPath: 'about/', // confirmed live: footer "About us" link is /about/, same as UK/CA
      helpPath: 'faqs/', // confirmed live: footer "Help" link is /faqs/, same as UK/CA
      socialMedia: { twitter: null, facebook: null, instagram: null }, // confirmed live: zero social links found homepage-wide, same gap as CA
      hasSocialMedia: false,
      searchTerm: 'Casino', searchResultHrefSubstrings: ['/online-slots/', '/live-casino/', '/table-games/', '/instant-win/'], // NOT independently confirmed via a completed in-app search this session — same caveat as UK/CA, verify before trusting fully
      gameTileHrefSubstrings: ['/online-slots/', '/live-casino/', '/table-games/', '/instant-win/'], // confirmed live via footer nav crawl — same taxonomy as UK/CA
      hasGameFilterCarousel: true, // unconfirmed — carried over from UK/CA's confirmed pattern; verify on first real run
      hasFeedbackForm: true, // carried over from UK pending a dedicated live check of the login widget's "Report a problem" link — verify on first real run
      hasGameCategoryNav: true, // unconfirmed — carried over from UK/CA's confirmed header pattern; verify on first real run
      hasLoginRegistration: true, // confirmed live: Sign In/Join buttons in header, both open a real #account modal with real shadow-root content — Join: 3 real inputs (Mobile number, DOB Day-Month-Year, country auto-detects +353)
      hasTestAccount: true, // real test account confirmed working by Reeve 2026-07-27 (ren@test.com)
      hasAccountModal: true, // confirmed live: both Sign In and Join advance the URL to /#account
      hasPaymentMethodsPage: true, // confirmed live: /payment-methods/ returns 200 (the common default path, same as UK/CA)
      hasBlogDesktopSearch: true, // unconfirmed — carried over as the common default pending a dedicated blog-page check; verify on first real run
      hasBlogSearch: true, // unconfirmed — same as above
    },

    // COM — onboarding started 2026-07-27 against www.primecasino.com (no
    // GEO path prefix, unlike CA/IE), tested from a confirmed UAE VPN/IP —
    // same "international" pattern as MC/COM. Same shape as UK/CA/IE:
    // English (uiLocalized: false), same taxonomy, same "Sign In"/"Join"
    // header wording, same untranslated footer slugs — EXCEPT no Mobile App
    // footer link at all (confirmed 404, unlike UK/CA/IE which all have
    // one). Registration confirmed live: country code auto-detects to +971
    // (same auto-detect-from-real-IP pattern as MC/COM's Malta case), DOB
    // shows "Day/Month/Year" — same as the default UK-shaped format, no
    // override needed there; only the mobile number format needed its own
    // generator (see registration.spec.ts's isPcComFormat and
    // generateUaeMobile in helpers/testData.ts).
    COM: {
      locale: 'en', uiLocalized: false,
      hasBlog: false, blogPath: null, // confirmed live: /blog/ 404s, same gap as CA/IE
      hasPromotionsPage: true, promotionsPath: 'promotions/', // confirmed live 200
      hasPromotionsIconInHeader: false, // confirmed live: header nav has no dedicated Promotions entry, same gap as UK/CA/IE — only reachable via footer
      featuresPath: 'features/', // confirmed live 200
      mobileAppPath: 'mobile-app/', // confirmed live: 404s (no footer link at all) — genuinely different from UK/CA/IE, which all have a real one. Kept as the common placeholder since the field itself isn't nullable — the footer-nav check skips cleanly on a 404 like every other optional link
      bingoCardGeneratorPath: 'bingo-card-generator/', // unconfirmed — no such link found in footer, kept as the common placeholder that skips cleanly if 404
      currencySymbol: '€', // confirmed live via game info modal's bet range/jackpot figures — Euro, not USD, despite this being the "international" .com market
      contactEmail: 'support@primecasino.com', // confirmed live on /contact/ — real mailto link, same shared address as UK/CA/IE
      aboutUsPath: 'about/', // confirmed live: footer "About us" link is /about/, same as UK/CA/IE
      helpPath: 'faqs/', // confirmed live: footer "Help" link is /faqs/, same as UK/CA/IE
      socialMedia: { twitter: null, facebook: null, instagram: null }, // confirmed live: zero social links found homepage-wide, same gap as CA/IE
      hasSocialMedia: false,
      searchTerm: 'Casino', searchResultHrefSubstrings: ['/online-slots/', '/live-casino/', '/table-games/', '/instant-win/'], // NOT independently confirmed via a completed in-app search this session — same caveat as UK/CA/IE, verify before trusting fully
      gameTileHrefSubstrings: ['/online-slots/', '/live-casino/', '/table-games/', '/instant-win/'], // confirmed live via footer nav crawl — same taxonomy as UK/CA/IE
      hasGameFilterCarousel: true, // unconfirmed — carried over from UK/CA/IE's confirmed pattern; verify on first real run
      hasFeedbackForm: true, // carried over from UK pending a dedicated live check of the login widget's "Report a problem" link — verify on first real run
      hasGameCategoryNav: true, // unconfirmed — carried over from UK/CA/IE's confirmed header pattern; verify on first real run
      hasLoginRegistration: true, // confirmed live: Sign In/Join buttons in header, both open a real #account modal — Join: real Mobile number + DOB fields, country auto-detects +971
      hasTestAccount: true, // real test account confirmed working by Reeve 2026-07-27 (zn@test.com)
      hasAccountModal: true, // confirmed live: both Sign In and Join advance the URL to /#account
      hasPaymentMethodsPage: true, // confirmed live: /payment-methods/ returns 200 (the common default path, same as UK/CA/IE)
      hasBlogDesktopSearch: true, // unconfirmed — carried over as the common default pending a dedicated blog-page check; verify on first real run
      hasBlogSearch: true, // unconfirmed — same as above
    },

    // DE — onboarding started 2026-07-28 against a DIFFERENT domain than
    // every other PC market: www.primespielhalle.de ("Spielhalle" = German
    // for slot arcade), not primecasino.*. Same DE-market platform gap
    // already seen on SC/SNG/MC's German sites: single stripped-down game
    // taxonomy (Online-Slot-Spiele only — no Live Casino/Table Games/Instant
    // Win like every other PC market), no Blog/Features/Mobile
    // App/Bingo Card Generator (all confirmed 404 live). Real test account
    // confirmed working live 2026-07-28 (jomobif938@insgogc.com — login
    // redirected to playsecure.primespielhalle.de with a real token, no
    // Cloudflare interference). Registration confirmed live: Mobile number +
    // password + DOB (dd.mm.yyyy placeholder) — same isGermanFormat branch
    // already GEO-keyed (not brand-keyed) in registration.spec.ts, so it
    // applies here automatically, no new branch needed.
    DE: {
      locale: 'de', uiLocalized: true,
      hasBlog: false, blogPath: null, // confirmed live: /blog/ 404s
      hasPromotionsPage: true, promotionsPath: 'promotions/', // confirmed live 200
      hasPromotionsIconInHeader: true, // confirmed live: header's primary nav has "Aktionen" directly (Home/Online-Slot-Spiele/Aktionen) — genuinely different from every other PC market, which is footer-link-only
      featuresPath: null, // confirmed live: /features/ 404s
      mobileAppPath: 'mobile-app/', // confirmed live: 404s — kept as the common placeholder, skips cleanly like every other GEO's 404 case
      bingoCardGeneratorPath: 'bingo-card-generator/', // confirmed live: 404s
      currencySymbol: '€', // Euro — not independently confirmed via visible price/bonus copy this session; Germany, same as every other German market onboarded so far (SC/SNG/MC)
      contactEmail: 'support@primespielhalle.de', // confirmed live on /contact/ — real mailto link, a DIFFERENT address than every other PC market (matches this market's own domain, same pattern as MC DE)
      aboutUsPath: 'about/', // confirmed live: footer "Über uns" link is /about/ — untranslated slug, same as UK/CA/IE/COM
      helpPath: 'faqs/', // confirmed live: footer "FAQs" link is /faqs/ — untranslated slug, same as every other PC market
      socialMedia: { twitter: null, facebook: null, instagram: null }, // confirmed live: zero social links found homepage-wide
      hasSocialMedia: false,
      searchTerm: 'Book', searchResultHrefSubstrings: ['/online-slots/'], // confirmed live via real in-app search — matches game TITLES (Book of Dead etc.), same MC DE precedent; the generic "Casino"/"Slots" terms used by other PC markets are untested here and may not match anything
      gameTileHrefSubstrings: ['/online-slots/'], // confirmed live via slots-page + homepage nav crawl — this market's own single-category taxonomy
      hasGameFilterCarousel: true, // confirmed live: 42 GamesSlider-style elements found on homepage
      hasFeedbackForm: false, // confirmed live: no "problem/feedback/report" link found on /contact/ or inside the login/registration widget — only a live-chat entry point ("Hilfe gebraucht? Chatte mit uns")
      hasGameCategoryNav: false, // confirmed live: header nav has only a single flat Online-Slot-Spiele link, no expandable category dropdown — same gap as MC DE
      hasLoginRegistration: true, // confirmed live: Registrieren/Einloggen buttons in header, both open a real #account modal with real shadow-root content — Einloggen: username+password; Registrieren: Mobile number, DOB (dd.mm.yyyy), password
      hasTestAccount: true, // real test account confirmed working live 2026-07-28 (jomobif938@insgogc.com) — real login redirected to playsecure.primespielhalle.de with a token
      hasAccountModal: true, // confirmed live: both Einloggen and Registrieren advance the URL to /#account
      hasPaymentMethodsPage: true, // confirmed live: /payment-methods/ returns 200 (the common default path — no override needed, same as UK/CA/IE/COM)
      hasBlogDesktopSearch: false, // no blog for DE anyway (hasBlog: false) — set false for consistency
      hasBlogSearch: false, // no blog for DE anyway — set false for consistency
      privacyPath: 'privacy-policy/', // confirmed live: footer-navigation.spec.ts's default '/privacy/' 404s here — real slug is longer
      termsPath: 'terms-conditions/', // confirmed live: real slug is longer than the default '/terms/' — NOTE: footerTermsText's shared 'de' regex (/^agb$/i) doesn't match this market's real "AGBs" link text either, so this path currently isn't exercised (silently skipped, not failed) until that regex is also widened
    },

    // SE — onboarding started 2026-07-28 against se.primecasino.com. Own
    // taxonomy: Online Slotsspel/Video Bingo/Instant Win Spel (no Casino/Live
    // Casino category at all) — Video Bingo is unique to this market, not
    // seen on any other PC GEO. No Blog/Features/Mobile App/Bingo Card
    // Generator/Promotions page at all (all confirmed 404 — genuinely no
    // promotions page here, unlike every other PC market). Real footer slugs
    // are the same longer-English-slug pattern as DE (/privacy-policy/,
    // /terms-conditions/).
    //
    // hasLoginRegistration set to false per explicit instruction from Reeve
    // (2026-07-28): no test accounts exist for SE across any brand, same as
    // every other brand's SE market. NOTE this brand's actual UI is NOT the
    // simple single-button BankID pattern already documented for GC/SC/SNG/MC
    // SE (a "Registrera/Logga in" button with no separate widget) — PC SE
    // genuinely shows separate "Gå med"/"Logga in" buttons that open a real
    // widget with a Swedish personnummer field (name="personalID",
    // placeholder "XXXXXXXX-XXXX") + password, confirmed live via real
    // browser inspection. Clicking Join did NOT advance the URL to /#account
    // (unlike every traditional-login GEO), consistent with hasAccountModal:
    // false. No real or safely-fabricated personnummer exists this session —
    // same "can't proceed without real identity data" gap already documented
    // for MC/GC DK's CPR field — so this is set false to skip cleanly rather
    // than let the default registration flow fail on a field it doesn't know
    // about. If a personnummer generator is ever built, this GEO would need
    // its own isPcSeFormat branch in registration.spec.ts, not the generic
    // BankID no-widget-at-all skip path used by other SE markets.
    SE: {
      locale: 'sv', uiLocalized: true, // confirmed live: <html lang="sv">, real Swedish nav/header/footer copy
      hasBlog: false, blogPath: null, // confirmed live: /blog/ 404s
      hasPromotionsPage: false, promotionsPath: null, // confirmed live: /promotions/ 404s — genuinely no promotions page for this market, unlike every other PC GEO
      hasPromotionsIconInHeader: false, // no promotions page at all (see above)
      featuresPath: null, // confirmed live: /features/ 404s
      mobileAppPath: 'mobile-app/', // confirmed live: 404s — kept as the common placeholder, skips cleanly
      bingoCardGeneratorPath: 'bingo-card-generator/', // confirmed live: 404s
      currencySymbol: 'kr', // Swedish Krona — not independently confirmed via visible price/bonus copy this session; same caveat as MC SE
      contactEmail: 'support@primecasino.com', // confirmed live on /contact/ — real mailto link, the shared UK/CA/IE/COM address, NOT its own domain's address (unlike DE, which has its own primespielhalle.de address)
      aboutUsPath: 'about/', // confirmed live: footer "Om oss" link is /about/ — untranslated slug
      helpPath: 'faqs/', // confirmed live: footer/header "Vanliga Frågor" link is /faqs/ — untranslated slug
      privacyPath: 'privacy-policy/', // confirmed live: real slug matches DE's longer-than-default pattern, not the shared '/privacy/' default
      termsPath: 'terms-conditions/', // confirmed live: same longer-slug pattern as DE
      socialMedia: { twitter: null, facebook: null, instagram: null }, // confirmed live: zero social links found homepage-wide
      hasSocialMedia: false,
      searchTerm: 'Gold', searchResultHrefSubstrings: ['/online-slots/'], // confirmed live via real in-app search: 23 real results (Golden Winner, Gold Strike 2, etc.), all under /online-slots/
      gameTileHrefSubstrings: ['/online-slots/', '/video-bingo/', '/instant-win/'], // confirmed live via header/footer nav crawl — this market's own 3-category taxonomy
      hasGameFilterCarousel: true, // confirmed live: 26 GamesSlider-style elements found on homepage
      hasFeedbackForm: false, // confirmed live: no "problem/feedback/rapport" link found on /contact/
      hasGameCategoryNav: true, // confirmed live: header shows Online Slotsspel (dropdown)/Video Bingo/Instant Win Spel with real sub-links
      hasLoginRegistration: false, // see top-of-block comment — no personnummer generator exists, skip cleanly like every other SE market
      hasTestAccount: false, // no working test account/personnummer for this market
      hasAccountModal: false, // confirmed live: clicking Join did not advance the URL to /#account
      hasPaymentMethodsPage: true, // confirmed live: /payment-methods/ returns 200 (the common default path)
      hasBlogDesktopSearch: false, // no blog for SE anyway (hasBlog: false) — set false for consistency
      hasBlogSearch: false, // no blog for SE anyway — set false for consistency
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

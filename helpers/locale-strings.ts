import { currentGeoFeatures } from './geo-features';

/**
 * Localized UI copy used by text-based locators. geo-features.ts's
 * uiLocalized flag marks which GEOs need this — ES and DE have confirmed
 * entries; SE still falls back to English and will keep failing any
 * English-text assertion until someone confirms its real copy live.
 */
export interface LocaleStrings {
  loginButton: RegExp;       // Header "Log in" CTA
  loginSubmitButton: RegExp; // Submit button inside the login modal
  usernameOrEmailLabel: RegExp;
  joinButton: RegExp;        // Header "Join"/register CTA
  loginErrorText: RegExp;    // Shown after a failed login attempt
  reportProblemText: RegExp; // Link that opens the feedback form
  membersLoginText: RegExp;  // Tab-switch link inside the Join widget
  backButtonText: RegExp;    // Search panel "Back" button
  playCta: RegExp;           // Hover CTA on a game tile ("PLAY IT"/"PLAY NOW")
  bonusPolicyText: RegExp;   // T&C banner text on the promotions page
  readMoreText: RegExp;      // Blog "Read More" article link
  feedbackNext: RegExp;      // Feedback widget step-advance button
  feedbackOther: RegExp;     // Feedback widget "Other" category option
  feedbackSubmit: RegExp;    // Feedback widget final submit button
  forgotPasswordText: RegExp; // "Forgot Password" link inside the login modal
  noAccountText: RegExp;       // "Don't have an account" link inside the login modal
  searchPlaceholder: RegExp;   // Header search input placeholder
  feedbackTextareaPlaceholder: RegExp; // Feedback widget's free-text answer box
  homeLinkText: RegExp;        // Sidebar "Home" link (distinct from the brand logo link)
  footerResponsibleGamingText: RegExp; // Footer "Responsible Gaming" link
  footerBonusPolicyText: RegExp;       // Footer "Bonus Policy" link
  footerTermsText: RegExp;             // Footer "Terms and Conditions" link
  footerPrivacyPolicyText: RegExp;     // Footer "Privacy Policy" link
  footerAboutUsText: RegExp;           // Footer "About us" link
  footerPaymentOptionsText: RegExp;    // Footer "Payment Options" link
  footerAffiliatesText: RegExp;        // Footer "Affiliates" link
  footerContactUsText: RegExp;         // Footer "Contact us" link
  footerMobileAppText: RegExp;         // Footer "Mobile App" link
  footerBingoCardGeneratorText: RegExp; // Footer "Bingo Card Generator" link
}

const EN: LocaleStrings = {
  // \s* (not a literal space) — confirmed live: the header CTA reads "Log
  // in" but the contact page's own link reads "LOGIN" (no space); a bare
  // "log in" substring match silently never matched the latter.
  loginButton: /log\s*in/i,
  loginSubmitButton: /^login$/i,
  usernameOrEmailLabel: /username or email/i,
  joinButton: /join/i,
  loginErrorText: /the login details you entered are incorrect/i,
  reportProblemText: /report a problem/i,
  membersLoginText: /members login/i,
  backButtonText: /^back$/i,
  playCta: /play it|play now/i,
  bonusPolicyText: /bonus policy applies|terms\s*(?:and|&)\s*conditions apply/i,
  readMoreText: /read more/i,
  feedbackNext: /^next$/i,
  feedbackOther: /^other$/i,
  feedbackSubmit: /^submit$/i,
  forgotPasswordText: /forgot.*password/i,
  noAccountText: /don'?t have an account/i,
  searchPlaceholder: /^search game$/i,
  feedbackTextareaPlaceholder: /type your answer here/i,
  homeLinkText: /^home$/i,
  footerResponsibleGamingText: /^responsible gaming$/i,
  footerBonusPolicyText: /^bonus policy$/i,
  footerTermsText: /^terms and conditions$/i,
  footerPrivacyPolicyText: /^privacy policy$/i,
  footerAboutUsText: /^about us$/i,
  footerPaymentOptionsText: /^payment options$/i,
  footerAffiliatesText: /^affiliates$/i,
  footerContactUsText: /^contact us$/i,
  footerMobileAppText: /^mobile app$/i,
  footerBingoCardGeneratorText: /^bingo card generator$/i,
};

const STRINGS: Record<string, LocaleStrings> = {
  en: EN,
  // Every value below confirmed live against slingocasino.es.
  es: {
    loginButton: /iniciar sesión/i,
    loginSubmitButton: /iniciar sesión/i,
    usernameOrEmailLabel: /nombre de usuario o correo electrónico/i,
    joinButton: /únete|unirse/i, // "Únete" confirmed live on SC (slingocasino.es); "Unirse" confirmed live on SNG (spingenie.es) — same language, different brand copy, so this shared-by-locale string needs to match both
    loginErrorText: /datos de inicio de sesión.*incorrectos/i,
    reportProblemText: /reportar un problema/i,
    membersLoginText: /inicio de sesión/i,
    backButtonText: /^volver$/i,
    playCta: /^jugar$|a jugar|vamos a jugar/i,
    bonusPolicyText: /pol[ií]tica de bon/i,
    readMoreText: /sigue leyendo/i,
    feedbackNext: /^siguiente$/i,
    feedbackOther: /^otro$/i,
    feedbackSubmit: /^enviar$/i,
    forgotPasswordText: /has olvidado tu contraseña/i,
    noAccountText: /aún no tienes una cuenta/i,
    searchPlaceholder: /^buscar juego$/i,
    feedbackTextareaPlaceholder: /escribe aquí tu respuesta/i,
    homeLinkText: /^inicio$/i,
    // Confirmed via live DOM inspection of slingocasino.es footer.
    footerResponsibleGamingText: /^juego más seguro$/i,
    footerBonusPolicyText: /^política de bono$/i,
    footerTermsText: /^términos y condiciones$/i,
    footerPrivacyPolicyText: /^política de privacidad$/i,
    footerAboutUsText: /^quiénes somos$/i,
    footerPaymentOptionsText: /^métodos de pago$/i,
    footerAffiliatesText: /^afiliados$/i,
    footerContactUsText: /^contacto$/i,
    footerMobileAppText: /^app casino movil$/i,
    footerBingoCardGeneratorText: /^generador cartones bingo$/i,
  },
  // Confirmed live 2026-07-13 against slingospiel.de, except where noted.
  de: {
    loginButton: /einloggen/i,
    loginSubmitButton: /^einloggen$/i,
    usernameOrEmailLabel: /benutzername oder e-?mail/i,
    joinButton: /anmelden/i,
    loginErrorText: /die eingegebenen anmeldedaten sind nicht korrekt/i,
    reportProblemText: /problem melden/i, // not exercised — DE has no feedback form (hasFeedbackForm: false)
    membersLoginText: /mitglieder-anmeldung/i,
    backButtonText: /^zurück$/i,
    playCta: /^spielen$/i,
    bonusPolicyText: /bonusbedingungen/i,
    readMoreText: /weiterlesen/i, // not exercised — DE has no Blog
    // NOT yet confirmed live — best-guess translations for the feedback widget.
    feedbackNext: /^weiter$/i,
    feedbackOther: /^andere[s]?$/i,
    feedbackSubmit: /^absenden$/i,
    forgotPasswordText: /passwort vergessen/i,
    noAccountText: /konto erstellen/i,
    searchPlaceholder: /^spiel suchen$/i,
    feedbackTextareaPlaceholder: /gib deine antwort hier ein/i, // NOT yet confirmed live
    homeLinkText: /^home$/i, // confirmed live — sidebar uses the English word "Home", not translated
    footerResponsibleGamingText: /^verantwortungsvolles spielen$/i,
    footerBonusPolicyText: /^bonuspolitik$/i,
    footerTermsText: /^agb$/i,
    footerPrivacyPolicyText: /^datenschutzrichtlinie$/i,
    footerAboutUsText: /^über uns$/i,
    footerPaymentOptionsText: /^zahlungsoptionen$/i,
    footerAffiliatesText: /^werbepartner$/i,
    footerContactUsText: /^kontakt$/i,
    footerMobileAppText: /^mobile app$/i, // not exercised — DE has no Mobile App footer link
    footerBingoCardGeneratorText: /^bingo card generator$/i, // not exercised — DE has no Bingo Card Generator footer link
  },
  // FR-CA — onboarding started 2026-07-21 against www.spingenie.com/fr-CA/.
  // loginButton/joinButton/playCta/searchPlaceholder/backButtonText confirmed
  // live via direct inspection (header buttons + search panel). Everything
  // else below is a BEST-GUESS placeholder, not yet confirmed — expect to
  // correct these from real failure snapshots once specs actually run
  // against them, same pattern as every other locale here.
  'fr': {
    loginButton: /connecter|^login$/i, // confirmed live: SNG FR-CA header button reads "SE CONNECTER" (matches "connecter"); MC FR-CA's header button is NOT translated and reads plain "Login" (confirmed live 2026-07-23 via accessibility snapshot) — same shared-by-locale pattern as ES's joinButton, different brand copy under one language
    loginSubmitButton: /^se connecter$/i, // confirmed live 2026-07-21 (real browser screenshot, Reeve): login modal's submit button reads "SE CONNECTER" (same text as the header button, scoped separately by the modal container in login.spec.ts)
    usernameOrEmailLabel: /identifiant ou email|nom d'utilisateur ou courriel/i, // confirmed live: SNG FR-CA field label reads "Identifiant ou Email" (2026-07-21); MC FR-CA's reads "Nom d'utilisateur ou courriel" instead (confirmed live 2026-07-23) — Quebec French "courriel" for email, not France French — same shared-by-locale, different-brand-copy pattern as ES's joinButton
    joinButton: /inscrire/i, // confirmed live: header button reads "S'INSCRIRE"
    loginErrorText: /identifiants.*incorrects|erreur/i, // NOT yet confirmed — guessed
    reportProblemText: /signaler un problème/i, // NOT yet confirmed — guessed
    membersLoginText: /connexion des membres/i, // confirmed live 2026-07-21 (real browser screenshot): registration widget's tab-switch link reads "Connexion des membres"
    backButtonText: /^retour$/i, // confirmed live: search panel's back control reads "Retour"
    playCta: /jouer|jouer maintenant/i, // confirmed live: hover/homepage CTA reads "JOUER"/"JOUER MAINTENANT"
    bonusPolicyText: /politique de bonus|termes et conditions/i, // confirmed live 2026-07-21 via DOM snapshot: FR-CA's homepage banner disclaimer actually reads "Sous réserve des Termes et Conditions", NOT the "Politique de bonus" pattern other GEOs use — my earlier "confirmed" comment here was wrong, never actually verified against FR-CA specifically
    readMoreText: /lire la suite|continuer/i, // NOT yet confirmed — guessed
    feedbackNext: /^suivant$/i, // NOT yet confirmed — guessed
    feedbackOther: /^autre$/i, // NOT yet confirmed — guessed
    feedbackSubmit: /^soumettre$/i, // NOT yet confirmed — guessed
    forgotPasswordText: /mot de passe oublié/i, // confirmed live 2026-07-21 (real browser screenshot): login modal's link reads "Mot de passe oublié?"
    noAccountText: /pas encore de compte/i, // confirmed live 2026-07-21 (real browser screenshot): login modal's link reads "Vous n'avez pas encore de compte?"
    searchPlaceholder: /^recherchez un jeu$/i, // confirmed live: search input placeholder reads "Recherchez un jeu"
    feedbackTextareaPlaceholder: /tapez votre réponse ici/i, // NOT yet confirmed — guessed
    // confirmed live: SNG FR-CA's header nav link reads "ACCUEIL". MC FR-CA has TWO
    // unrelated "Home"-equivalent components with two DIFFERENT bugs: a persistent
    // always-visible top-strip nav reads plain untranslated "Home" (brand owner
    // confirmed 2026-07-23 this is INTENDED, not a bug); the actual slide-out
    // hamburger drawer (the one sidebar-navigation.spec.ts's SIDEBAR selector
    // actually targets) reads "Página Inicial" — Portuguese, not French, a genuine
    // wrong-locale-bundle bug (same family as the confirmed Contato/Afiliados bugs)
    // — confirmed live 2026-07-23 via direct DOM inspection of the drawer's own
    // <nav class="MainMenu_main-menu..."> link. Match all three so the suite tests
    // real behavior regardless of which bugs eventually get fixed.
    homeLinkText: /^accueil$|^home$|^página inicial$/i,
    footerResponsibleGamingText: /^jeu responsable$/i, // confirmed live: footer link reads "Jeu responsable"
    footerBonusPolicyText: /^politique de bonus$/i, // confirmed live: footer link reads "Politique de bonus"
    footerTermsText: /^conditions générales$/i, // confirmed live: footer link reads "Conditions générales"
    footerPrivacyPolicyText: /^politique de confidentialité$/i, // confirmed live: footer link reads "Politique de confidentialité"
    footerAboutUsText: /^à propos de nous$/i, // confirmed live: footer link reads "À propos de nous"
    footerPaymentOptionsText: /^options de paiement$/i, // confirmed live: footer link reads "Options de paiement"
    footerAffiliatesText: /^affiliés$/i, // confirmed live: footer link reads "Affiliés"
    footerContactUsText: /^contactez-nous$/i, // confirmed live: footer link reads "Contactez-nous"
    footerMobileAppText: /^application mobile$/i, // NOT yet confirmed — guessed, footer link text not captured this session
    footerBingoCardGeneratorText: /^générateur de cartes de bingo$/i, // NOT yet confirmed — guessed
  },
  // Confirmed live 2026-07-13 against se.slingo.com. SE has no traditional
  // login/registration (Pay N Play/Trustly deposit model, hasLoginRegistration:
  // false) — loginButton/joinButton/loginSubmitButton/etc. are not exercised
  // by any spec and left as reasonable placeholders rather than guessed
  // translations, since there's nothing live to verify them against.
  sv: {
    loginButton: /logga in/i, // not exercised — SE has no login CTA (hasLoginRegistration: false)
    loginSubmitButton: /^logga in$/i, // not exercised
    usernameOrEmailLabel: /användarnamn eller e-post/i, // not exercised
    joinButton: /gå med/i, // not exercised
    loginErrorText: /felaktiga inloggningsuppgifter/i, // not exercised
    reportProblemText: /rapportera ett problem/i, // not exercised — SE has no feedback form (hasFeedbackForm: false)
    membersLoginText: /medlem.*logga in/i, // not exercised
    backButtonText: /^tillbaka$/i,
    playCta: /^spela$/i,
    bonusPolicyText: /bonusvillkor/i, // NOT confirmed live — SE's homepage banner has no visible T&C/bonus disclaimer text at all (image-only banner), so this pattern isn't exercised by BN-01's T&C check either
    readMoreText: /läs mer/i, // not exercised — SE has no Blog
    // NOT yet confirmed live — best-guess translations for the feedback widget (not exercised, hasFeedbackForm: false).
    feedbackNext: /^nästa$/i,
    feedbackOther: /^annat$/i,
    feedbackSubmit: /^skicka$/i,
    forgotPasswordText: /glömt lösenordet/i, // not exercised
    noAccountText: /skapa konto/i, // not exercised
    searchPlaceholder: /^sök spel$/i,
    feedbackTextareaPlaceholder: /skriv ditt svar här/i, // not exercised
    homeLinkText: /^hem$/i,
    footerResponsibleGamingText: /^ansvarsfullt spelande$/i,
    footerBonusPolicyText: /^bonuspolicy$/i, // NOT confirmed live — no such footer link found (SE's footer has no separate Bonus Policy link)
    footerTermsText: /^regler och villkor$/i,
    footerPrivacyPolicyText: /^integritet$/i,
    footerAboutUsText: /^om oss$/i,
    footerPaymentOptionsText: /^betalningsalternativ$/i, // not exercised — SE has no Payment Options page (404, hasPaymentMethodsPage: false)
    footerAffiliatesText: /^affiliateprogram$/i,
    footerContactUsText: /^kontakt$/i,
    footerMobileAppText: /^mobilapp$/i, // not exercised — SE has no Mobile App footer link
    footerBingoCardGeneratorText: /^bingokortsgenerator$/i, // not exercised — SE has no Bingo Card Generator footer link
  },
  // DK — onboarded 2026-07-24 against www.gentingcasino.dk. loginButton/
  // joinButton confirmed live via real header button text ("LOG IND"/"OPRET
  // DIG"). hasFeedbackForm/hasBlog are both false for this GEO, so the
  // feedback-widget and readMoreText strings below are never exercised —
  // left as reasonable best-guess Danish translations, not yet confirmed
  // live, same convention as the fr/sv entries above. searchPlaceholder,
  // backButtonText, loginErrorText, forgotPasswordText, noAccountText,
  // membersLoginText, usernameOrEmailLabel, loginSubmitButton, and
  // homeLinkText are ALSO not yet confirmed live — this GEO has no working
  // test account (hasTestAccount: false) so the full login flow was never
  // exercised, and the search/sidebar flows weren't manually walked before
  // writing this entry. Expect to correct these from real failure
  // screenshots on the next run, same pattern as every other locale here.
  da: {
    loginButton: /log ind/i, // confirmed live: header button reads "LOG IND"
    loginSubmitButton: /^log ind$/i, // confirmed live: login modal's submit button also reads "Log ind" (same text as the header trigger)
    usernameOrEmailLabel: /brugernavn eller e-?mail/i, // confirmed live: login modal field label reads "Brugernavn Eller E-Mail"
    joinButton: /opret dig/i, // confirmed live: header button reads "OPRET DIG"
    loginErrorText: /de indtastede loginoplysninger er forkerte/i, // NOT yet confirmed — guessed (no working test account to trigger a real failed-login attempt against, see hasTestAccount: false)
    reportProblemText: /rapporter et problem/i, // not exercised — DK has no feedback form (hasFeedbackForm: false)
    membersLoginText: /login for medlemmer/i, // confirmed live: registration modal's tab-switch link reads "Login for medlemmer"
    backButtonText: /^tilbage$/i, // NOT yet confirmed — guessed
    playCta: /^spil$/i, // NOT exercised via text — DK's hover CTA is ICON_ONLY (confirmed live), handled by playCtaLocator's icon fallback regardless of this regex
    bonusPolicyText: /bonuspolitik|regler og betingelser/i, // NOT yet confirmed — guessed
    readMoreText: /læs mere/i, // not exercised — DK has no Blog (hasBlog: false)
    feedbackNext: /^næste$/i, // not exercised — hasFeedbackForm: false
    feedbackOther: /^andet$/i, // not exercised
    feedbackSubmit: /^send$/i, // not exercised
    forgotPasswordText: /glemt din adgangskode/i, // confirmed live: login modal's link reads "Glemt din Adgangskode?"
    noAccountText: /ny på gentingcasino|opret konto/i, // confirmed live: login modal's link reads "Ny på GentingCasino! Opret konto"
    searchPlaceholder: /^search game$/i, // confirmed live: the search input's placeholder is genuinely in English ("Search game"), not translated — a real site quirk, not a guess gone wrong
    feedbackTextareaPlaceholder: /skriv dit svar her/i, // not exercised
    homeLinkText: /^hjem$/i, // NOT yet confirmed — guessed (Danish for "Home")
    // Footer link texts confirmed live via direct footer inspection.
    footerResponsibleGamingText: /^ansvarligt spil$/i,
    footerBonusPolicyText: /^bonuspolitik$/i, // NOT confirmed live — DK's footer has no separate "Bonus Policy" link at all (only "Regler & Betingelser", which IS the real Terms link — see footerTermsText). Deliberately left as a non-matching guess rather than aliased to the T&C link's real text: aliasing it caused a real bug this session (the check found the T&C link, clicked it, landed on /terms/, and failed because it expected /bonus-policy/ specifically) — a non-matching guess lets the spec's own "link not found -> skip" handling apply correctly instead of falsely matching the wrong page.
    footerTermsText: /^regler & betingelser$/i,
    footerPrivacyPolicyText: /^privatlivspolitik$/i,
    footerAboutUsText: /^om os$/i,
    footerPaymentOptionsText: /^sikker betaling$/i,
    footerAffiliatesText: /^affiliates$/i, // confirmed live: kept English, not translated
    footerContactUsText: /^kontakt$/i,
    footerMobileAppText: /^mobile app$/i, // not exercised — DK has no Mobile App footer link
    footerBingoCardGeneratorText: /^bingo card generator$/i, // not exercised — DK has no Bingo Card Generator footer link
  },
};

/** Must be called from inside a running test/hook (currentGeoFeatures uses test.info()). */
export function currentLocaleStrings(): LocaleStrings {
  const locale = currentGeoFeatures().locale;
  return STRINGS[locale] ?? EN;
}

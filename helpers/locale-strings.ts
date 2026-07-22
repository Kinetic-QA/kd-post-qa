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
    loginButton: /connecter/i, // confirmed live: header button reads "SE CONNECTER"
    loginSubmitButton: /^se connecter$/i, // confirmed live 2026-07-21 (real browser screenshot, Reeve): login modal's submit button reads "SE CONNECTER" (same text as the header button, scoped separately by the modal container in login.spec.ts)
    usernameOrEmailLabel: /identifiant ou email/i, // confirmed live 2026-07-21 (real browser screenshot): field label reads "Identifiant ou Email"
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
    homeLinkText: /^accueil$/i, // confirmed live: header nav link reads "ACCUEIL"
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
};

/** Must be called from inside a running test/hook (currentGeoFeatures uses test.info()). */
export function currentLocaleStrings(): LocaleStrings {
  const locale = currentGeoFeatures().locale;
  return STRINGS[locale] ?? EN;
}

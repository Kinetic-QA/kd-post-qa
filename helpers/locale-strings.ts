import { currentGeoFeatures } from './geo-features';

/**
 * Localized UI copy used by text-based locators. geo-features.ts's
 * uiLocalized flag marks which GEOs need this — currently only ES has a
 * fully confirmed entry; DE/SE still fall back to English and will keep
 * failing any English-text assertion until someone confirms their real
 * copy live.
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
}

const EN: LocaleStrings = {
  loginButton: /log in/i,
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
};

const STRINGS: Record<string, LocaleStrings> = {
  en: EN,
  // Every value below confirmed live against slingocasino.es.
  es: {
    loginButton: /iniciar sesión/i,
    loginSubmitButton: /iniciar sesión/i,
    usernameOrEmailLabel: /nombre de usuario o correo electrónico/i,
    joinButton: /únete/i,
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
  },
};

/** Must be called from inside a running test/hook (currentGeoFeatures uses test.info()). */
export function currentLocaleStrings(): LocaleStrings {
  const locale = currentGeoFeatures().locale;
  return STRINGS[locale] ?? EN;
}

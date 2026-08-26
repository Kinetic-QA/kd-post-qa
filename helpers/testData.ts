/**
 * testData.ts — Registration flow test data generator
 *
 * Generates randomised but valid data for each registration test run:
 *   - UK mobile number  (10 digits, +44 prefix already on form)
 *   - Date of birth     (DD/MM/YYYY, always 18+)
 *   - First / last name (picked from curated lists)
 *   - Email             (unique per run via timestamp)
 *   - UK address        (hardcoded list of 5 valid UK addresses)
 *   - Username          (Test_ + first initial + timestamp)
 *   - Password          (fixed default: 5Tandard@1)
 */

import { readDetectedGeo } from './ip-detect';

// ── Types ────────────────────────────────────────────────────────────────────

export interface UKAddress {
  houseNumber: string;
  street: string;
  postcode: string;
  city: string;
  country: string;
  state?: string;   // Canadian/AB-only: "Pick your state" province dropdown (e.g. "Alberta")
}

export interface RegistrationData {
  mobile: string;       // 10 digits starting with 7 (form already shows +44)
  dob: string;          // DD/MM/YYYY
  firstName: string;
  lastName: string;
  gender: 'Male' | 'Female';
  email: string;
  address: UKAddress;
  username: string;     // Test_<FirstInitial><timestamp>
  password: string;     // Always 5Tandard@1
}

export interface EsRegistrationData {
  nie: string;           // Format-valid synthetic NIE (see generateNie)
  firstName: string;
  lastName: string;
  dob: string;            // DD-MM-YYYY (placeholder shows "Día-Mes-Año")
  gender: 'Masculino' | 'Femenino' | 'Otro';
  email: string;
  mobile: string;         // 9 digits starting 6/7 (form already shows +34 prefix)
  username: string;
  password: string;      // Always 5Tandard@1 (min 10 chars required by the form)
}


// ── Source pools ─────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'James', 'Oliver', 'Harry', 'George', 'Noah',
  'Emma',  'Olivia', 'Amelia', 'Isla',  'Sophie',
];

const LAST_NAMES = [
  'Smith', 'Jones', 'Williams', 'Taylor', 'Brown',
  'Davies', 'Evans', 'Wilson',  'Thomas', 'Roberts',
];

const ES_FIRST_NAMES = [
  'Alejandro', 'Javier', 'Manuel', 'Pablo', 'Daniel',
  'Lucía', 'Marta', 'Sara', 'Elena', 'Carmen',
];

const ES_LAST_NAMES = [
  'García', 'Martínez', 'López', 'Sánchez', 'González',
  'Pérez', 'Fernández', 'Ruiz', 'Díaz', 'Moreno',
];

/**
 * Hardcoded valid UK addresses (Option A — agreed in planning session).
 * All postcodes follow the correct UK postcode format.
 */
const UK_ADDRESSES: UKAddress[] = [
  {
    houseNumber: '15',
    street:      'Wellington Street',
    postcode:    'LS1 1BA',
    city:        'Leeds',
    country:     'UNITED KINGDOM',
  },
  {
    houseNumber: '42',
    street:      'Victoria Road',
    postcode:    'M14 5RG',
    city:        'Manchester',
    country:     'UNITED KINGDOM',
  },
  {
    houseNumber: '8',
    street:      'Castle Street',
    postcode:    'B1 1BB',
    city:        'Birmingham',
    country:     'UNITED KINGDOM',
  },
  {
    houseNumber: '27',
    street:      'Princess Street',
    postcode:    'EH1 1QS',
    city:        'Edinburgh',
    country:     'UNITED KINGDOM',
  },
  {
    houseNumber: '3',
    street:      'Park Lane',
    postcode:    'BS1 5TN',
    city:        'Bristol',
    country:     'UNITED KINGDOM',
  },
];

/**
 * IMPORTANT — these are Ontario addresses, not Alberta ones, despite this
 * being the SNG AB (Alberta) brand's test data. Confirmed live 2026-07-17:
 * selecting Canada as the mobile country code switches the address step to
 * Canadian fields, including a "Pick your state" province dropdown that
 * defaults to Ontario. Selecting "Alberta" there triggers a hard validation
 * error: "Please note that SpinGenie.CA accepts only players who are
 * residents of Ontario. If you are not a resident of Ontario, you cannot
 * register on SpinGenie.CA site." This is a REAL platform/business-rule
 * finding, not a test bug — the entire QA site is built and branded for
 * Alberta (Alberta iGaming Corporation branding, "Alberta Online Casino"
 * copy throughout), but the actual registration backend right now only
 * accepts Ontario residents. Very likely because Alberta's backend/
 * licensing isn't activated yet in this pre-live environment while Ontario
 * is SNG's existing live Canadian market sharing the same infrastructure —
 * flag to the team; don't just quietly keep working around it if this is
 * still true once Alberta actually goes live. Left the province dropdown at
 * its Ontario default (see fillStep2AB/fillMobileStep3AddressAB — `state`
 * intentionally omitted below) and used real Ontario postal codes so the
 * flow can still reach a submittable end state.
 */
const AB_ADDRESSES: UKAddress[] = [
  {
    houseNumber: '210',
    street:      'Queen Street West',
    postcode:    'M5V 3L9',
    city:        'Toronto',
    country:     'CANADA',
  },
  {
    houseNumber: '101',
    street:      'Bank Street',
    postcode:    'K1P 5N4',
    city:        'Ottawa',
    country:     'CANADA',
  },
  {
    houseNumber: '44',
    street:      'King Street West',
    postcode:    'L8P 1A2',
    city:        'Hamilton',
    country:     'CANADA',
  },
];

/**
 * SNG ON's real registration address step (confirmed live 2026-07-21) has
 * the same house-number-bearing shape as AB_ADDRESSES above — unsurprising
 * in hindsight, since AB's pre-live QA environment was already confirmed to
 * silently route through Ontario's real backend. Reuses the exact same
 * fixture data as AB rather than duplicating it; see fillStep2AB/
 * fillMobileStep3AddressAB in registration.spec.ts for the fill logic.
 */
export function generateOntarioAddress(): UKAddress {
  return randomFrom(AB_ADDRESSES);
}

/**
 * CA (live market) addresses — confirmed live 2026-07-20: unlike AB, CA's
 * address step has NO house-number field at all (address/zipCode/city plus
 * separate country + state/province selects). Country already defaults
 * correctly to Canada. State/province ALSO already defaults correctly — to
 * whichever real province the tester's actual IP resolves to (confirmed:
 * Alberta when connected from Calgary, Quebec when connected from
 * Montreal) — and, critically, the form REJECTS a submission where the
 * selected province doesn't match that real IP-derived one (confirmed live:
 * forcing "Ontario" while genuinely connected from Calgary silently failed
 * to advance past the address step; leaving the default untouched from
 * Montreal advanced immediately). Unlike AB (whose backend genuinely
 * restricts registration to Ontario regardless of real IP — a confirmed
 * separate quirk of that pre-live environment), CA's `state` must NEVER be
 * force-selected — `.state` is deliberately left unset here so
 * fillStep2CA/fillMobileStep3AddressCA's `if (addr.state)` guard skips
 * selection entirely and leaves the real, correct auto-detected value in
 * place. City/postal code text do NOT need to geographically match the
 * real province (confirmed: Ontario city/postal text + real Quebec IP +
 * untouched Quebec state selection advanced fine) — only the state SELECT
 * element itself matters.
 */
const CA_ADDRESSES: UKAddress[] = [
  { houseNumber: '', street: 'Queen Street West', postcode: 'M5V 3L9', city: 'Toronto', country: 'CANADA' },
  { houseNumber: '', street: 'Bank Street',        postcode: 'K1P 5N4', city: 'Ottawa',  country: 'CANADA' },
  { houseNumber: '', street: 'King Street West',   postcode: 'L8P 1A2', city: 'Hamilton', country: 'CANADA' },
];

export function generateCanadianAddress(): UKAddress {
  return randomFrom(CA_ADDRESSES);
}

/**
 * MC FR-CA's registration address field performs REAL geocoding validation.
 * The 2026-07-23 docstring here previously claimed "Bank Street" (Ottawa)
 * "reliably resolves to a single confident match" while "Queen Street West"/
 * "King Street West" are genuinely ambiguous — RE-TESTED LIVE 2026-08-05
 * from a real Canada VPN and that claim no longer holds (or never did):
 * "Bank Street" now fails identically to the other two, AND a completely
 * different, unambiguous, real full address ("150 Elgin Street, Ottawa, ON")
 * fails the exact same way — empty field, red icon, persistent "Adresse
 * invalide", with Postcode/Ville/Country/Province all still auto-filling
 * and validating fine regardless. This rules out "which address text" as
 * the variable entirely — every real address tried fails identically, which
 * points to the autocomplete's backend/API call itself never succeeding for
 * an automated session (see the KNOWN OPEN ISSUE comment on MC/FR-CA's
 * fillComAddress call in registration.spec.ts), not an address-content
 * problem. Kept as "Bank Street" (a real, valid address) rather than
 * switched to something fake, since a real address is still the correct
 * thing to submit even though none of them currently get past this step.
 */
export function generateMcFrCaAddress(): UKAddress {
  return CA_ADDRESSES[1];
}

/**
 * Hardcoded valid Irish addresses — Eircodes (not UK-style postcodes)
 * confirmed live: IE's address step has no separate house-number field
 * (unlike UK's), so houseNumber here is unused by fillIEAddress but kept
 * for RegistrationData shape compatibility.
 */
const IE_ADDRESSES: UKAddress[] = [
  { houseNumber: '', street: 'Grafton Street', postcode: 'D02 XY45', city: 'Dublin', country: 'IRELAND' },
  { houseNumber: '', street: 'Patrick Street', postcode: 'T12 XY67', city: 'Cork', country: 'IRELAND' },
  { houseNumber: '', street: 'Shop Street', postcode: 'H91 XY89', city: 'Galway', country: 'IRELAND' },
];

// ── Generators ───────────────────────────────────────────────────────────────

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generates a random valid UK mobile number WITHOUT the leading 0.
 * The registration form already displays "+44" as the country code prefix,
 * so we supply the 10-digit national number starting with 7.
 *
 * Valid UK mobile ranges begin with 07[4-9], so after stripping the
 * leading 0 we get 7[4-9]XXXXXXXX (10 digits total).
 */
/**
 * Generates a random valid Spanish mobile number. The form already shows
 * "+34" as the country code prefix, so we supply the 9-digit national
 * number — Spanish mobiles start with 6 or 7.
 */
export function generateSpanishMobile(): string {
  const firstDigit = randomFrom([6, 7]);
  const rest = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('');
  return `${firstDigit}${rest}`;
}

export function generateUKMobile(): string {
  const secondDigit = randomFrom([4, 5, 7, 8, 9]);
  const rest = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('');
  return `7${secondDigit}${rest}`;
}

/**
 * Generates a random valid Irish mobile number WITHOUT the leading 0. The
 * form shows "+353" as the country code prefix, so we supply the 9-digit
 * national number — Irish mobiles are 08X XXX XXXX nationally (start with
 * 8, not UK's 7 — confirmed live, a different format from UK despite the
 * otherwise near-identical registration flow).
 */
export function generateIrishMobile(): string {
  const secondDigit = randomFrom([3, 5, 6, 7, 8, 9]);
  const rest = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10)).join('');
  return `8${secondDigit}${rest}`;
}

/**
 * Generates a random valid South African mobile number WITHOUT the leading
 * 0. ROW's registration form country-code selector auto-detects from the
 * tester's real IP (confirmed live: showed "+27" when tested from a South
 * Africa VPN — same IP-based detection pattern as ES/UK's baseURL), so a
 * UK-format number gets rejected there. South African mobiles are
 * 0XX XXX XXXX nationally (9 digits after the leading 0, starting 6/7/8).
 * NOTE: ROW's country-code field isn't fixed to South Africa — it reflects
 * whichever country the tester's IP resolves to, so this generator is only
 * correct while testing ROW from a South Africa IP/VPN.
 */
export function generateSouthAfricanMobile(): string {
  const firstDigit = randomFrom([6, 7, 8]);
  const rest = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('');
  return `${firstDigit}${rest}`;
}

/**
 * Generates a random valid Maltese mobile number. MC/COM's registration
 * form country-code selector auto-detects from the tester's real IP
 * (confirmed live: showed "MT"/+356 when tested from a Malta VPN — same
 * auto-detect pattern as ROW), so generateUKMobile's 10-digit UK-shaped
 * number gets rejected there (confirmed live: 10 attempts, Continue never
 * advanced). Maltese mobiles are 8 digits total, no leading 0 — confirmed
 * live against the real form that an 8-digit number passes client-side
 * validation regardless of leading digit; real mobile prefixes (77/79/98/99)
 * are used here anyway for realism.
 * NOTE: MC/COM's country-code field isn't fixed to Malta — it reflects
 * whichever country the tester's IP resolves to, so this generator is only
 * correct while testing MC/COM from a Malta IP/VPN.
 */
export function generateMalteseMobile(): string {
  const prefix = randomFrom(['77', '79', '98', '99']);
  const rest = Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join('');
  return `${prefix}${rest}`;
}

/**
 * Generates a random valid UAE mobile number. PC/COM's registration form
 * country-code selector auto-detects from the tester's real IP (confirmed
 * live 2026-07-27: showed "+971" when tested from a UAE VPN — same
 * auto-detect pattern as MC/COM's Malta case), so generateUKMobile's
 * 10-digit UK-shaped number would be the wrong shape entirely. UAE mobiles
 * are 9 digits total starting with 5 (real assigned ranges: 050/052/054/
 * 055/056/058/059) — the form already shows "+971" as the prefix, so we
 * supply just the 9-digit national number.
 * NOTE: PC/COM's country-code field isn't fixed to the UAE — it reflects
 * whichever country the tester's IP resolves to, so this generator is only
 * correct while testing PC/COM from a UAE IP/VPN.
 */
export function generateUaeMobile(): string {
  const secondDigit = randomFrom([0, 2, 4, 5, 6, 8, 9]);
  const rest = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10)).join('');
  return `5${secondDigit}${rest}`;
}

/**
 * Generates a random valid Cyprus mobile number WITHOUT the leading 0.
 * Confirmed live 2026-07-22: testing SNG ROW from a real Cyprus VPN/IP, the
 * country-code dropdown auto-detected to "CY"/"Cyprus (+ 357)" — NOT South
 * Africa, which is what generateSouthAfricanMobile assumed when ROW was
 * first onboarded from a South Africa VPN. Same "verified, never forced"
 * auto-detect behavior documented on generateSouthAfricanMobile — swap to
 * whichever generator matches the real VPN/IP in use, don't assume this one
 * carries forward either. Cyprus mobiles are 8 digits nationally, starting
 * with 9.
 */
export function generateCyprusMobile(): string {
  const rest = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10)).join('');
  return `9${rest}`;
}

/**
 * Maps the real IP country detected once per run by global-setup.ts (see
 * helpers/ip-detect.ts) to the mobile generator whose format that country's
 * auto-detected dropdown actually expects. Add a new entry here — and a new
 * generator above — the first time a session tests one of these markets
 * from a country not yet listed, rather than letting a stale hardcoded
 * default silently produce the wrong shape.
 */
const MOBILE_GENERATOR_BY_COUNTRY_CODE: Record<string, () => string> = {
  ZA: generateSouthAfricanMobile,
  CY: generateCyprusMobile,
  MT: generateMalteseMobile,
  AE: generateUaeMobile,
};

/**
 * Picks the mobile generator matching whatever country this session's real
 * IP/VPN actually detected as (see helpers/ip-detect.ts), instead of a
 * hardcoded guess left over from whichever country a market was last tested
 * from. Falls back to `fallback` — logging a warning so the mismatch is
 * visible in the run's console output rather than silently producing
 * wrong-shaped numbers again — if detection failed or the detected country
 * has no generator mapped yet.
 */
export function getAutoDetectedMobileGenerator(fallback: () => string, fallbackLabel: string): () => string {
  const geo = readDetectedGeo();
  if (!geo?.countryCode) {
    console.warn(`[Mobile format] Real IP country wasn't detected this run — falling back to ${fallbackLabel}. If this market's dropdown auto-detects from IP, check global-setup.ts's pre-flight log for why detection failed.`);
    return fallback;
  }
  const generator = MOBILE_GENERATOR_BY_COUNTRY_CODE[geo.countryCode];
  if (!generator) {
    console.warn(`[Mobile format] Detected real IP country "${geo.countryCode}" has no mobile generator mapped yet — falling back to ${fallbackLabel}. Add "${geo.countryCode}" to MOBILE_GENERATOR_BY_COUNTRY_CODE in helpers/testData.ts.`);
    return fallback;
  }
  console.log(`[Mobile format] Detected real IP country "${geo.countryCode}" — using its matching mobile generator instead of ${fallbackLabel}.`);
  return generator;
}

/**
 * Generates a random valid Alberta (Canada) mobile number in NANP format:
 * a real Alberta area code (403/587/780/825) + 3-digit exchange (can't
 * start 0/1) + 4-digit subscriber number, 10 digits total, no leading 1.
 * Confirmed live on SNG AB: unlike ROW, the form's country-code dropdown
 * does NOT need to be relied on for auto-detection — it defaults to
 * whichever country the tester's real IP/VPN resolves to (Israel, +972,
 * since the IL/CY VPN required to reach this QA site has nothing to do with
 * the actual Canadian market), so registration.spec.ts explicitly selects
 * "Canada" in the dropdown before using this generator (see
 * fillStep0WithRetry's countryCodeLabel param) rather than depending on
 * auto-detect the way ROW's South African generator does.
 */
export function generateCanadianMobile(): string {
  const areaCode = randomFrom(['403', '587', '780', '825']);
  const exchange = randomFrom([2, 3, 4, 5, 6, 7, 8, 9]).toString() +
    Array.from({ length: 2 }, () => Math.floor(Math.random() * 10)).join('');
  const subscriber = Array.from({ length: 4 }, () => Math.floor(Math.random() * 10)).join('');
  return `${areaCode}${exchange}${subscriber}`;
}

/**
 * Generates a random date of birth with a HARDCODED 1990-2000 birth-year
 * range (never derived from the current date), joined with the given
 * separator (UK's form wants DD/MM/YYYY, ES's wants DD-MM-YYYY). Confirmed
 * by Reeve 2026-07-29: a currentYear-relative range produced a garbled/
 * out-of-range year live (observed as "2409") that a registration form
 * correctly rejected, masking as a false mobile-number failure across
 * several retries. A fixed, clearly-legal-age range (every market this
 * suite covers sets the age of majority at 21 or below) removes that whole
 * class of date-math edge case for every registration flow, not just one
 * brand/GEO.
 */
export interface DOBParts {
  year: number;
  month: number;
  day: number;
}

/**
 * Generates the raw year/month/day for a random, clearly-legal-age birthdate
 * (HARDCODED 1990-2000 range — see generateDOBWithSeparator's doc comment
 * for why this is fixed rather than current-year-relative). Every DOB
 * generator in this file funnels through this one source of the actual
 * random date, so the "legal age" and "valid days-in-month" logic lives in
 * exactly one place instead of being copy-pasted per separator/field-order
 * variant.
 */
export function generateDOBParts(): DOBParts {
  const year  = 1990 + Math.floor(Math.random() * 11); // 1990-2000 inclusive
  const month = 1 + Math.floor(Math.random() * 12);
  const maxDay = new Date(year, month, 0).getDate();
  const day   = 1 + Math.floor(Math.random() * maxDay);
  return { year, month, day };
}

function generateDOBWithSeparator(separator: string): string {
  const { year, month, day } = generateDOBParts();
  return [
    String(day).padStart(2, '0'),
    String(month).padStart(2, '0'),
    String(year),
  ].join(separator);
}

/**
 * Builds a DOB string matching whatever a real DOB field's placeholder
 * actually says, instead of guessing a fixed format per brand/GEO/detected-
 * VPN-country the way generateCanadianDOB()/generateFrCaDOB() below do.
 *
 * Those hardcoded per-brand generators have proven repeatedly stale: SNG
 * CA/ON/FR-CA alone went through THREE separate "confirmed live" format
 * claims across 2026-07-20, 2026-08-24, and 2026-08-25 as the live field
 * kept turning out to want something else than last assumed (or genuinely
 * changed shape between sessions) — the same failure class as the
 * mobile-country-code dropdown defaulting to the tester's real VPN country
 * (see fillStep0WithRetry's countryCodeLabel handling), just for dates
 * instead of phone numbers. Reading the field's own placeholder and
 * matching it is the same "trust the live DOM, not a fixed assumption"
 * fix applied there — it self-adapts to DD/MM/YYYY, YYYY.MM.DD,
 * JJ/MM/AAAA, Année-Mois-Jour, or any other order/separator without
 * needing a new per-brand branch every time a field turns out different.
 *
 * Falls back to the historical default (DD/MM/YYYY) when the placeholder is
 * missing or doesn't clearly name at least a day/month/year token, so a
 * brand with no recognizable placeholder text keeps behaving exactly as
 * before rather than silently producing an unpredictable order.
 */
export function formatDOBForPlaceholder(placeholder: string | null | undefined, parts: DOBParts): string {
  const fallback = () => [
    String(parts.day).padStart(2, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.year),
  ].join('/');

  if (!placeholder) return fallback();

  const lower = placeholder.toLowerCase();
  const separatorMatch = lower.match(/[^a-z0-9]/);
  const separator = separatorMatch ? separatorMatch[0] : '/';

  // Token lists cover both letter-repeated masks (yyyy/mm/dd, jj/mm/aaaa)
  // AND spelled-out English/French words — several brands' real DOB fields
  // (e.g. MC/PC/LP's CA markets) use a literal "Year-Month-Day" placeholder,
  // not a repeated-letter mask, so 'yyyy' alone would never match those.
  const yearIdx = Math.min(
    ...['yyyy', 'aaaa', 'année', 'annee', 'year'].map(t => { const i = lower.indexOf(t); return i === -1 ? Infinity : i; }),
  );
  const monthIdx = Math.min(
    ...['mm', 'mois', 'month'].map(t => { const i = lower.indexOf(t); return i === -1 ? Infinity : i; }),
  );
  const dayIdx = Math.min(
    ...['dd', 'jj', 'jour', 'day'].map(t => { const i = lower.indexOf(t); return i === -1 ? Infinity : i; }),
  );

  const found = [yearIdx, monthIdx, dayIdx].filter(i => i !== Infinity);
  if (found.length < 3) return fallback();

  const value: Record<'year' | 'month' | 'day', string> = {
    year: String(parts.year),
    month: String(parts.month).padStart(2, '0'),
    day: String(parts.day).padStart(2, '0'),
  };
  const order = (['year', 'month', 'day'] as const)
    .map(token => ({ token, idx: token === 'year' ? yearIdx : token === 'month' ? monthIdx : dayIdx }))
    .sort((a, b) => a.idx - b.idx)
    .map(({ token }) => token);

  return order.map(token => value[token]).join(separator);
}

function generateDOB(): string {
  return generateDOBWithSeparator('/');
}

/**
 * Generates a synthetic but FORMAT-VALID Spanish NIE (foreigner ID number)
 * using the real public checksum algorithm — X/Y/Z prefix maps to 0/1/2,
 * the resulting 8-digit number mod 23 indexes this 23-letter control-letter
 * table. Sequential digits (a fresh timestamp-derived number each call) keep
 * it effectively unique per run without needing a lookup table of real IDs.
 * This is not a real person's document — QA use only.
 */
export function generateNie(): string {
  const table = 'TRWAGMYFPDXBNJZSQVHLCKE';
  const prefixLetter = randomFrom(['X', 'Y', 'Z']);
  const prefixDigit = { X: 0, Y: 1, Z: 2 }[prefixLetter];
  // Last 7 digits of the current timestamp, kept unique enough per run.
  const digits = String(Date.now()).slice(-7);
  const full = parseInt(`${prefixDigit}${digits}`, 10);
  const control = table[full % 23];
  return `${prefixLetter}${digits}${control}`;
}

/**
 * Generates registration data for ES's DNI/NIE-based flow — see
 * tests/p1/registration.spec.ts for why this is a differently-shaped
 * 3-step flow from UK's (DNI/NIE identity step instead of mobile/DOB, named
 * "Paso X de 3" steps), even though it still ends up asking for broadly the
 * same personal/contact/account fields overall.
 */
export function generateEsRegistrationData(): EsRegistrationData {
  const timestamp = Date.now();
  const firstName = randomFrom(ES_FIRST_NAMES);
  // ES_FIRST_NAMES includes accented names (e.g. "Lucía") — a real name field
  // accepts these fine, but I36 ES's email validation rejects a non-ASCII
  // local part outright ("Comprueba que has introducido una dirección de
  // correo electrónico válida", confirmed live 2026-08-05 on "test_lucía_...").
  // Strip diacritics for the email only; the name fields keep the real accent.
  const emailSafeFirstName = firstName.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return {
    nie: generateNie(),
    firstName,
    lastName: randomFrom(ES_LAST_NAMES),
    dob: generateDOBWithSeparator('-'),
    gender: randomFrom(['Masculino', 'Femenino', 'Otro'] as const),
    email: `test_${emailSafeFirstName.toLowerCase()}_${timestamp}@mailinator.com`,
    mobile: generateSpanishMobile(),
    username: `TestES_${timestamp}`,
    password: '5Tandard@1',
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generates a full set of registration data for one test run.
 * Call this once at the start of the test and reuse the object throughout
 * all steps so the data stays consistent (e.g. username uses the same firstName).
 */
export function generateRegistrationData(): RegistrationData {
  const firstName = randomFrom(FIRST_NAMES);
  const lastName  = randomFrom(LAST_NAMES);
  const timestamp = Date.now();

  return {
    mobile:    generateUKMobile(),
    dob:       generateDOB(),
    firstName,
    lastName,
    gender:    randomFrom(['Male', 'Female'] as const),
    email:     `test_${firstName.toLowerCase()}_${timestamp}@mailinator.com`,
    address:   randomFrom(UK_ADDRESSES),
    username:  `Test_${firstName[0]}${timestamp}`,
    password:  '5Tandard@1',
  };
}

/**
 * Generates registration data for SNG AB (Alberta) — reuses UK's names/
 * gender/DOB pools (same English-language flow) but with a Canadian mobile
 * number and a real Alberta address (Province + valid postal code), per
 * registration.spec.ts's isAlbertaFormat branch.
 */
export function generateAbRegistrationData(): RegistrationData {
  const firstName = randomFrom(FIRST_NAMES);
  const lastName  = randomFrom(LAST_NAMES);
  const timestamp = Date.now();

  return {
    mobile:    generateCanadianMobile(),
    dob:       generateDOB(),
    firstName,
    lastName,
    gender:    randomFrom(['Male', 'Female'] as const),
    email:     `test_${firstName.toLowerCase()}_${timestamp}@mailinator.com`,
    address:   randomFrom(AB_ADDRESSES),
    username:  `Test_${firstName[0]}${timestamp}`,
    password:  '5Tandard@1',
  };
}

/**
 * Generates registration data for IE — reuses UK's names/gender/DOB pools
 * (same English-language flow, confirmed live near-identical to UK's) but
 * with an Irish mobile number and address, per registration.spec.ts's
 * isIrishFormat branch.
 */
export function generateIERegistrationData(): RegistrationData {
  const firstName = randomFrom(FIRST_NAMES);
  const lastName  = randomFrom(LAST_NAMES);
  const timestamp = Date.now();

  return {
    mobile:    generateIrishMobile(),
    dob:       generateDOB(),
    firstName,
    lastName,
    gender:    randomFrom(['Male', 'Female'] as const),
    email:     `test_${firstName.toLowerCase()}_${timestamp}@mailinator.com`,
    address:   randomFrom(IE_ADDRESSES),
    username:  `TestIE_${firstName[0]}${timestamp}`,
    password:  '5Tandard@1',
  };
}

/**
 * Generates registration data for ROW — reuses UK's names/gender/DOB/address
 * pools (registration.spec.ts's ROW branch currently assumes the same form
 * shape as UK's, unconfirmed beyond the mobile-number step). ROW's
 * country-code selector reflects the tester's real IP rather than a fixed
 * country, so the mobile format has to match whatever's actually detected
 * this session — pass the SAME generator used by fillStep0WithRetry's retry
 * loop (via getAutoDetectedMobileGenerator), don't hardcode one here. A
 * mismatch between this initial value and the retry loop's own generator
 * previously caused a flaky ROW run (2026-08-11/12): the first attempt used
 * a South-Africa-shaped number while every retry generated a Cyprus-shaped
 * one, since only one of the two spots had been updated after ROW was last
 * re-tested from Cyprus.
 */
export function generateROWRegistrationData(mobileGenerator: () => string = generateSouthAfricanMobile): RegistrationData {
  const firstName = randomFrom(FIRST_NAMES);
  const lastName  = randomFrom(LAST_NAMES);
  const timestamp = Date.now();

  return {
    mobile:    mobileGenerator(),
    dob:       generateDOB(),
    firstName,
    lastName,
    gender:    randomFrom(['Male', 'Female'] as const),
    email:     `test_${firstName.toLowerCase()}_${timestamp}@mailinator.com`,
    address:   randomFrom(UK_ADDRESSES),
    username:  `TestROW_${firstName[0]}${timestamp}`,
    password:  '5Tandard@1',
  };
}


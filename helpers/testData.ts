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

// ── Types ────────────────────────────────────────────────────────────────────

export interface UKAddress {
  houseNumber: string;
  street: string;
  postcode: string;
  city: string;
  country: string;
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

/**
 * DE (Slingo, slingospiel.de) has a genuinely different registration shape
 * from UK/IE/ROW — confirmed live 2026-07-13 (cross-checked against
 * RevWright Claude.ai's independent walkthrough): extra KYC fields required
 * by German gambling regulation (place of birth, nationality, state/Bundesland,
 * a dependent city dropdown), and a house-number field IS present (unlike
 * IE/ROW, which omit it).
 */
export interface DeRegistrationData {
  mobile: string;        // national number, no leading 0 (form defaults country code to +49)
  dob: string;            // DD.MM.YYYY (placeholder confirmed live: "dd.mm.yyyy")
  firstName: string;
  lastName: string;
  birthPlace: string;     // "Geburtsort" — required, no equivalent in UK's flow
  gender: 'Männlich' | 'Weiblich';
  email: string;
  zipCode: string;
  buildingName: string;   // "Hausnr." — DE has this, unlike IE/ROW
  street: string;
  state: string;          // "Bundesland" <select> option label
  city: string;           // "Stadt" <select> — cascades from state, must be set after
  username: string;
  password: string;       // DE's live rule checklist confirmed 2026-07-13: special
                           // char must be one of "!?$" specifically — the suite's
                           // usual 5Tandard@1 (with "@") would FAIL this GEO's rule.
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

const DE_FIRST_NAMES = [
  'Lukas', 'Maximilian', 'Jonas', 'Felix', 'Paul',
  'Emilia', 'Mia', 'Hannah', 'Lea', 'Anna',
];

const DE_LAST_NAMES = [
  'Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber',
  'Meyer', 'Wagner', 'Becker', 'Hoffmann', 'Schulz',
];

/**
 * Berlin is both the state (Bundesland) and its own city — confirmed live
 * the city <select> cascades from state and only lists valid cities for
 * whatever state is chosen, so using Berlin for both sidesteps needing a
 * full city-per-state lookup table for a single test address.
 */
const DE_ADDRESSES: { zipCode: string; buildingName: string; street: string; state: string; city: string }[] = [
  { zipCode: '10115', buildingName: '12', street: 'Musterstraße', state: 'Berlin', city: 'Berlin' },
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
 * Generates a random valid German mobile number WITHOUT the leading 0. The
 * form defaults its country-code selector to "+49" (confirmed live), so we
 * supply the national number — German mobiles start 15/16/17 nationally.
 */
export function generateGermanMobile(): string {
  const prefix = randomFrom(['15', '16', '17']);
  const rest = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('');
  return `${prefix}${rest}`;
}

/**
 * Generates a random date of birth for a person aged 25–50, joined with the
 * given separator (UK's form wants DD/MM/YYYY, ES's wants DD-MM-YYYY).
 */
function generateDOBWithSeparator(separator: string): string {
  const currentYear = new Date().getFullYear();
  const year  = currentYear - 25 - Math.floor(Math.random() * 26); // 25–50 years old
  const month = 1 + Math.floor(Math.random() * 12);
  const maxDay = new Date(year, month, 0).getDate();
  const day   = 1 + Math.floor(Math.random() * maxDay);
  return [
    String(day).padStart(2, '0'),
    String(month).padStart(2, '0'),
    String(year),
  ].join(separator);
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
  return {
    nie: generateNie(),
    firstName,
    lastName: randomFrom(ES_LAST_NAMES),
    dob: generateDOBWithSeparator('-'),
    gender: randomFrom(['Masculino', 'Femenino', 'Otro'] as const),
    email: `test_${firstName.toLowerCase()}_${timestamp}@mailinator.com`,
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
 * shape as UK's, unconfirmed beyond the mobile-number step) with a South
 * African mobile number, since ROW's country-code selector reflects the
 * tester's real IP rather than a fixed country (see generateSouthAfricanMobile).
 */
export function generateROWRegistrationData(): RegistrationData {
  const firstName = randomFrom(FIRST_NAMES);
  const lastName  = randomFrom(LAST_NAMES);
  const timestamp = Date.now();

  return {
    mobile:    generateSouthAfricanMobile(),
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

/**
 * Generates registration data for DE — confirmed live 2026-07-13. Uses
 * German name pools, a dot-separated DOB (form placeholder: "dd.mm.yyyy"),
 * and a password with "!" as its special character since DE's live password
 * rule checklist only accepts "!?$" (the rest of the suite's "@" would fail
 * DE's rule specifically).
 */
export function generateDERegistrationData(): DeRegistrationData {
  const firstName = randomFrom(DE_FIRST_NAMES);
  const lastName  = randomFrom(DE_LAST_NAMES);
  const timestamp = Date.now();
  const addr = randomFrom(DE_ADDRESSES);

  return {
    mobile:       generateGermanMobile(),
    dob:          generateDOBWithSeparator('.'),
    firstName,
    lastName,
    birthPlace:   'Berlin',
    gender:       randomFrom(['Männlich', 'Weiblich'] as const),
    email:        `test_${firstName.toLowerCase()}_${timestamp}@mailinator.com`,
    zipCode:      addr.zipCode,
    buildingName: addr.buildingName,
    street:       addr.street,
    state:        addr.state,
    city:         addr.city,
    username:     `TestDE_${firstName[0]}${timestamp}`,
    password:     '5Tandard!1',
  };
}

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

// ── Source pools ─────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'James', 'Oliver', 'Harry', 'George', 'Noah',
  'Emma',  'Olivia', 'Amelia', 'Isla',  'Sophie',
];

const LAST_NAMES = [
  'Smith', 'Jones', 'Williams', 'Taylor', 'Brown',
  'Davies', 'Evans', 'Wilson',  'Thomas', 'Roberts',
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
export function generateUKMobile(): string {
  const secondDigit = randomFrom([4, 5, 7, 8, 9]);
  const rest = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('');
  return `7${secondDigit}${rest}`;
}

/**
 * Generates a random date of birth for a person aged 25–50.
 * Always returns DD/MM/YYYY format as expected by the Slingo form.
 */
function generateDOB(): string {
  const currentYear = new Date().getFullYear();
  const year  = currentYear - 25 - Math.floor(Math.random() * 26); // 25–50 years old
  const month = 1 + Math.floor(Math.random() * 12);
  const maxDay = new Date(year, month, 0).getDate();
  const day   = 1 + Math.floor(Math.random() * maxDay);
  return [
    String(day).padStart(2, '0'),
    String(month).padStart(2, '0'),
    String(year),
  ].join('/');
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

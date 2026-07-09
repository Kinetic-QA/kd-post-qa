import { test, expect, Page, FrameLocator, Locator } from '@playwright/test';
import { waitForPageReady, dismissCampaignPopup, dismissCookieConsent, setupCampaignPopupWatcher } from '../../helpers/common';
import { generateRegistrationData, generateUKMobile, generateEsRegistrationData, generateIERegistrationData, generateIrishMobile, RegistrationData, EsRegistrationData } from '../../helpers/testData';
import { currentLocaleStrings } from '../../helpers/locale-strings';

/**
 * REG-01: Registration
 * Scope: Full new-player registration journey, ending on an enabled final
 * submit button that is deliberately never clicked (so no real account gets
 * created) — same intent as UK's "GO PLAY" check, just under whatever name
 * that button has locally.
 *
 * UK: Join → mobile/DOB → personal details → address →
 * username/password/consents → "GO PLAY".
 *
 * ES: Join → DNI/NIE + password → Paso 1/3 (nationality/name/DOB/gender) →
 * Paso 2/3 (verification method/username/password/consents) → Paso 3/3 (if
 * any) → "Continuar". Confirmed live this is a genuinely different shape
 * from UK's, not just translated copy — no mobile/address step, but 3 named
 * steps instead of UK's 4 unnamed ones. See fillEs* helpers below.
 *
 * Secondary widget controls (Close, Members Login handoff, Report a
 * Problem) are covered in p2/registration-widget.spec.ts (UK-only so far).
 */

type Scope = Page | FrameLocator;
const MAX_MOBILE_RETRIES = 10;

test.describe('Registration Flow', () => {

  test.beforeEach(async ({ page }) => {
    await setupCampaignPopupWatcher(page);
    await page.goto('');
    await page.waitForLoadState('domcontentloaded'); // fast load — cookie consent doesn't need networkidle
    await page.waitForTimeout(3_000);
    await dismissCookieConsent(page);
    await dismissCampaignPopup(page);
    await page.waitForTimeout(500);
  });

  test('REG-01: Complete new player registration flow', async ({ page }) => {
    test.setTimeout(180_000);

    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(40));
      console.log('  REG-01 REGISTRATION - RESULTS');
      console.log('═'.repeat(40));
      for (const r of results) {
        console.log(`  ${r.status === 'Pass' ? '✅' : '❌'}  ${r.label.padEnd(30)} ${r.status}`);
      }
      const passed = results.filter(r => r.status === 'Pass').length;
      const failed = results.filter(r => r.status === 'Fail').length;
      console.log('─'.repeat(40));
      console.log(`  Total: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}`);
      console.log('═'.repeat(40) + '\n');
    }

    // Auto-records pass/fail — failed steps appear in summary as ❌
    async function runStep(label: string, fn: () => Promise<void>) {
      await test.step(label, async () => {
        try {
          await fn();
          record(label, true);
        } catch (e) {
          record(label, false);
          throw e;
        }
      });
    }

    // TODO: extend once other GEOs' registration formats are confirmed live —
    // ES is known to use the DNI/NIE-based flow; IE is near-identical to UK
    // (same mobile/DOB → name/email/gender → address → credentials shape)
    // but with an Irish mobile format, no house-number field on the address
    // step, and only 3 consent checkboxes instead of UK's 4 — see fillIE*
    // helpers below. DE/SE not yet confirmed at all.
    const isSpanishFormat = test.info().project.name.replace(/-mobile$/, '') === 'ES';
    const isIrishFormat = test.info().project.name.replace(/-mobile$/, '') === 'IE';
    const isMobile = test.info().project.name.endsWith('-mobile');
    const strings = currentLocaleStrings();

    // ── Step 1: Click Join ───────────────────────────────────────────────
    await runStep('Join button → registration widget opens', async () => {
      // Mobile has no "Join" button inside a banner landmark — the
      // equivalent entry point is the "PLAY" button in the sticky bottom
      // nav (confirmed live). It shares its "play" class with every game
      // tile's individual play button, so scope to the mobile footer
      // container rather than matching on class/text alone.
      const joinBtn = isMobile
        ? page.locator('[class*="MobileFooter"] button.play, [class*="MobileMenu_play-but"] button').first()
        : page.getByRole('banner').getByRole('button', { name: strings.joinButton }).first();
      await expect(joinBtn).toBeVisible({ timeout: 10_000 });
      await dismissCampaignPopup(page);
      await joinBtn.scrollIntoViewIfNeeded();
      await joinBtn.click();
      await expect(page).toHaveURL(/#account/, { timeout: 15_000 });
      await waitForPageReady(page);
      await page.waitForTimeout(2_000);
      await dismissCampaignPopup(page);
    });

    const scope = await detectWidgetScope(page);

    if (isSpanishFormat && isMobile) {
      // ES mobile is a THIRD distinct shape — confirmed live: 6 named steps
      // ("PASO X DE 6"), not desktop ES's 3 ("Paso X de 3") nor UK mobile's
      // 5. Desktop ES combines nationality+name+DOB+gender into one step;
      // mobile splits name into its own step, then nationality+DOB+gender
      // into the next. The DNI/NIE pre-step is identical to desktop ES, so
      // fillEsIdStep is reused unchanged.
      const esData = generateEsRegistrationData();

      await runStep('DNI/NIE + password → Continuar', async () => {
        await fillEsIdStep(page, scope, esData, scope.locator('#firstName').first());
      });

      await runStep('Paso 1 de 6: Name → Continuar', async () => {
        await fillEsMobileStep1Name(page, scope, esData);
      });

      await runStep('Paso 2 de 6: Nationality + DOB + Gender → Continuar', async () => {
        await fillEsMobileStep2NationalityDobGender(page, scope, esData);
      });

      await runStep('Paso 3 de 6: Email + Mobile → Continuar', async () => {
        await fillEsMobileStep3EmailMobile(page, scope, esData);
      });

      await runStep('Paso 4 de 6: Address → Continuar', async () => {
        await fillEsMobileStep4Address(page, scope);
      });

      await runStep('Paso 5 de 6: Username + Password → Continuar', async () => {
        await fillEsMobileStep5Credentials(page, scope, esData);
      });

      await runStep('Paso 6 de 6: Consents', async () => {
        await fillEsMobileStep6Consents(page, scope);
      });

      await runStep('JUGAR button visible and enabled', async () => {
        // Scoped to the modal — same per-game-tile "Jugar" ambiguity as
        // fillEsMobileStep5Credentials above.
        const modal = page.locator('[class*="AccountPopup_account"], [class*="Popup_popup"]').filter({ visible: true }).first();
        const jugarBtn = modal.getByRole('button', { name: /^jugar$/i }).first();
        await expect(jugarBtn).toBeVisible({ timeout: 15_000 });
        await expect(jugarBtn).toBeEnabled({ timeout: 5_000 });
      });
    } else if (isSpanishFormat) {
      const esData = generateEsRegistrationData();

      // ── Pre-step: DNI/NIE + password → Continuar ────────────────────────
      await runStep('DNI/NIE + password → Continuar', async () => {
        await fillEsIdStep(page, scope, esData);
      });

      // ── Paso 1 de 3: Nationality + name + DOB + gender ───────────────────
      await runStep('Paso 1/3: Personal details → Continuar', async () => {
        await fillEsPersonalDetails(page, scope, esData);
      });

      // ── Paso 2 de 3: Address ─────────────────────────────────────────────
      await runStep('Paso 2/3: Address → Continuar', async () => {
        await fillEsAddress(page, scope);
      });

      // ── Paso 3 de 3: Email/mobile + username/password + consents ────────
      // Confirmed live: this last named step's submit button is "JUGAR"
      // ("PLAY") — ES's exact equivalent of UK's "GO PLAY" — not another
      // "Continuar". Filled but never clicked, same intent as UK's check.
      await runStep('Paso 3/3: Email/mobile + username + password + consents', async () => {
        await fillEsStep2(page, scope, esData);
      });

      await runStep('JUGAR button visible and enabled', async () => {
        // Scoped to the modal — the page behind it has its own "Jugar" play
        // buttons on every game tile (hidden until hover), and .first() on
        // an unscoped locator grabs one of those instead of the modal's
        // actual submit button (confirmed live).
        const modal = page.locator('[class*="AccountPopup_account"], [class*="Popup_popup"]').filter({ visible: true }).first();
        const jugarBtn = modal.getByRole('button', { name: /^jugar$/i }).first();
        await expect(jugarBtn).toBeVisible({ timeout: 15_000 });
        await expect(jugarBtn).toBeEnabled({ timeout: 5_000 });
      });
    } else if (isIrishFormat && !isMobile) {
      // IE desktop — confirmed live: near-identical shape to UK's (same
      // mobile/DOB → name+email+gender → address → credentials steps,
      // "STEP X OF 3", ending on "Go Play"), reusing fillStep0WithRetry and
      // fillStep1 unchanged. Differs from UK in three confirmed ways: Irish
      // mobile format (handled via mobileGenerator param), no house-number
      // field on the address step (fillIEAddress), and only 3 consent
      // checkboxes instead of UK's 4 (checkboxIds param on fillStep3).
      // TODO: IE mobile not yet explored — falls through to UK's mobile
      // branch below if ever run, which would be wrong (untested).
      const data = generateIERegistrationData();

      await runStep('Step 0: Mobile + Date of Birth → Continue', async () => {
        await fillStep0WithRetry(page, scope, data, generateIrishMobile);
      });

      await runStep('Step 1: Name + Email + Gender → Continue', async () => {
        await fillStep1(page, scope, data, scope.getByPlaceholder('Start typing your address').first());
      });

      await runStep('Step 2: Address → Continue', async () => {
        await fillIEAddress(page, scope, data);
      });

      await runStep('Step 3: Username + Password + Checkboxes', async () => {
        await fillStep3(page, scope, data, ['over_18', 'gdpr', 'terms_accept']);
      });

      await runStep('GO PLAY button visible and enabled', async () => {
        const goPlayBtn = scope.getByRole('button', { name: /go play/i }).first();
        await expect(goPlayBtn).toBeVisible({ timeout: 15_000 });
        await expect(goPlayBtn).toBeEnabled({ timeout: 5_000 });
      });
    } else if (isMobile) {
      // Mobile's flow is a genuinely different shape from desktop's —
      // confirmed live: 5 named steps ("STEP X OF 5") instead of desktop's 4
      // unnamed ones, splitting what desktop combines into one screen (e.g.
      // Name+Email+Gender) across separate steps. Step 0 (mobile/DOB) is
      // identical to desktop and reuses fillStep0WithRetry unchanged.
      const data = generateRegistrationData();

      await runStep('Step 0: Mobile + Date of Birth → Continue', async () => {
        await fillStep0WithRetry(page, scope, data);
      });

      await runStep('Step 1 of 5: First/Last name → Continue', async () => {
        await fillMobileStep1Name(page, scope, data);
      });

      await runStep('Step 2 of 5: Gender + Email → Continue', async () => {
        await fillMobileStep2GenderEmail(page, scope, data);
      });

      await runStep('Step 3 of 5: Address → Continue', async () => {
        await fillMobileStep3Address(page, scope, data);
      });

      await runStep('Step 4 of 5: Username + Password → Continue', async () => {
        await fillMobileStep4Credentials(page, scope, data);
      });

      await runStep('Step 5 of 5: Deposit limit + consents', async () => {
        await fillMobileStep5Final(page, scope);
      });

      await runStep('GO PLAY button visible and enabled', async () => {
        const goPlayBtn = scope.getByRole('button', { name: /go play/i }).first();
        await expect(goPlayBtn).toBeVisible({ timeout: 15_000 });
        await expect(goPlayBtn).toBeEnabled({ timeout: 5_000 });
      });
    } else {
      const data = generateRegistrationData();

      // ── Step 2: Step 0 — Mobile + DOB ─────────────────────────────────
      await runStep('Step 0: Mobile + Date of Birth → Continue', async () => {
        await fillStep0WithRetry(page, scope, data);
      });

      // ── Step 3: Step 1 — Name + Email + Gender ─────────────────────────
      await runStep('Step 1: Name + Email + Gender → Continue', async () => {
        await fillStep1(page, scope, data);
      });

      // ── Step 4: Step 2 — Address ───────────────────────────────────────
      await runStep('Step 2: Address → Continue', async () => {
        await fillStep2(page, scope, data);
      });

      // ── Step 5: Step 3 — Username + Password + Checkboxes ──────────────
      await runStep('Step 3: Username + Password + Checkboxes', async () => {
        await fillStep3(page, scope, data);
      });

      // ── Step 6: GO PLAY button visible ─────────────────────────────────
      await runStep('GO PLAY button visible and enabled', async () => {
        const goPlayBtn = scope.getByRole('button', { name: /go play/i }).first();
        await expect(goPlayBtn).toBeVisible({ timeout: 15_000 });
        await expect(goPlayBtn).toBeEnabled({ timeout: 5_000 });
      });
    }

    printSummary();
  });

});

/** Clicks the visible "Continuar" button and waits for `readyLocator` to confirm the next step rendered. */
async function clickContinuarAndWait(
  page: Page, scope: Scope, readyLocator: Locator, stepLabel: string,
): Promise<void> {
  const continueBtn = scope.locator('button', { hasText: /^Continuar$/ }).filter({ visible: true }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  // force: true — same overlay-interception quirk noted in login.spec.ts.
  await continueBtn.click({ force: true });
  await page.waitForTimeout(1_500);

  const advanced = await readyLocator.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
  if (!advanced) {
    await page.screenshot({ path: `test-results/es-reg-debug-${stepLabel}-${Date.now()}.png` });
    const inlineError = await page.locator('[class*="error" i]').first().textContent({ timeout: 2_000 }).catch(() => null);
    throw new Error(`REG-01 (ES): registration did not advance past "${stepLabel}" (inline error: ${inlineError ?? 'none'}) — see debug screenshot`);
  }
}

async function fillEsIdStep(page: Page, scope: Scope, data: EsRegistrationData, readyLocator?: Locator): Promise<void> {
  console.log('REG-01 (ES) DNI/NIE + password: ' + data.nie);

  const idInput = scope.locator('input[name="personalID"]').first();
  await expect(idInput).toBeVisible({ timeout: 10_000 });
  await idInput.click();
  await idInput.fill(data.nie);
  await page.waitForTimeout(300);

  const passwordInput = scope.locator('input[type="password"]').filter({ visible: true }).first();
  await expect(passwordInput).toBeVisible({ timeout: 5_000 });
  await passwordInput.fill(data.password);
  await page.waitForTimeout(300);

  // Next screen is desktop's "Paso 1 de 3" personal-details form, which has
  // a nationality <select> the ID screen doesn't — a reliable "we've
  // actually advanced" signal, unlike reusing a generic <input> locator that
  // would already match the still-mounted ID field and false-positive
  // instantly. Mobile's next screen (Paso 1 de 6) has no select at all — it's
  // name-only — so callers there must pass their own readyLocator (e.g.
  // #firstName) instead of relying on this default.
  await clickContinuarAndWait(page, scope, readyLocator ?? scope.locator('select').first(), 'id-step');
  console.log('REG-01 (ES) DNI/NIE step complete');
}

async function fillEsPersonalDetails(page: Page, scope: Scope, data: EsRegistrationData): Promise<void> {
  console.log('REG-01 (ES) Paso 1/3 personal details');

  // Nationality — a <select>; leave the default if the form already has one
  // selected, otherwise pick the first real option (index 1, skipping any
  // blank placeholder at index 0).
  const nationalitySelect = scope.locator('select').first();
  if (await nationalitySelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
    const current = await nationalitySelect.inputValue().catch(() => '');
    if (!current) {
      await nationalitySelect.selectOption({ index: 1 }).catch(() => {});
    }
    await page.waitForTimeout(200);
  }

  const inputs = scope.locator('input:not([type="radio"]):not([type="checkbox"])').filter({ visible: true });
  // Order confirmed live: first name, last name, second last name (optional), DOB.
  await inputs.nth(0).fill(data.firstName);
  await page.waitForTimeout(150);
  await inputs.nth(1).fill(data.lastName);
  await page.waitForTimeout(150);
  // Second surname (index 2) is explicitly optional per the form's own
  // helper text — leave it blank.
  const dobInput = inputs.nth(3);
  await dobInput.click();
  await dobInput.fill(data.dob);
  await page.waitForTimeout(200);

  const genderBtn = scope.getByText(data.gender, { exact: true }).first();
  if (await genderBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await genderBtn.click({ force: true });
    await page.waitForTimeout(200);
  }

  // Next screen is the "Paso 2 de 3" address form, identified by its
  // address-search input (placeholder confirmed live: "Comienza a escribir
  // tu dirección").
  await clickContinuarAndWait(page, scope, scope.locator('input[placeholder*="dirección" i]').first(), 'personal-details');
  console.log('REG-01 (ES) Paso 1/3 complete');
}

async function fillEsAddress(page: Page, scope: Scope): Promise<void> {
  console.log('REG-01 (ES) Paso 2/3 address');

  // The address field is autocomplete-first with a manual-entry fallback
  // link ("Introducir dirección") — confirmed live. Autocomplete suggestions
  // depend on a real address existing, which synthetic test data can't
  // guarantee, so always use the manual path instead.
  const manualLink = scope.getByText(/introducir dirección/i).first();
  await expect(manualLink).toBeVisible({ timeout: 10_000 });
  await manualLink.click({ force: true });
  await page.waitForTimeout(1_000);

  // Manual mode confirmed live: Dirección (street), Código postal, Ciudad,
  // and a Provincia <select> — each needs a real value in its own field,
  // not a shared placeholder string (a generic "fill every empty input"
  // pass put "Calle Test 1" into the postcode/city fields too and both
  // rejected it as invalid format).
  const addressInput = scope.locator('input[placeholder*="dirección" i]').first();
  if (await addressInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    const current = await addressInput.inputValue().catch(() => '');
    if (!current) await addressInput.fill('Calle Test 1');
    await page.waitForTimeout(200);
  }

  const postcodeInput = scope.getByLabel(/código postal/i).first();
  await expect(postcodeInput).toBeVisible({ timeout: 5_000 });
  await postcodeInput.fill('28001'); // valid real Madrid postal code format
  await page.waitForTimeout(200);

  const cityInput = scope.getByLabel(/^ciudad$/i).first();
  await expect(cityInput).toBeVisible({ timeout: 5_000 });
  await cityInput.fill('Madrid');
  await page.waitForTimeout(200);

  const provinceSelect = scope.locator('select').first();
  if (await provinceSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
    const current = await provinceSelect.inputValue().catch(() => '');
    if (!current) {
      const optionTexts = await provinceSelect.locator('option').allTextContents().catch(() => []);
      const madridIndex = optionTexts.findIndex(t => /madrid/i.test(t));
      await provinceSelect.selectOption({ index: madridIndex > 0 ? madridIndex : 1 }).catch(() => {});
    }
    await page.waitForTimeout(200);
  }

  // Next screen is the verification/username/password step (Paso 3 de 3).
  await clickContinuarAndWait(page, scope, scope.locator('input[name="username"]').first(), 'address');
  console.log('REG-01 (ES) Paso 2/3 complete');
}

async function fillEsStep2(page: Page, scope: Scope, data: EsRegistrationData): Promise<void> {
  console.log('REG-01 (ES) Paso 3/3 email + mobile + username + password + consents');

  const emailInput = scope.getByLabel(/correo electrónico/i).first();
  await expect(emailInput).toBeVisible({ timeout: 10_000 });
  await emailInput.fill(data.email);
  await page.waitForTimeout(200);

  const mobileInput = scope.getByLabel(/número de móvil/i).first();
  await expect(mobileInput).toBeVisible({ timeout: 5_000 });
  await mobileInput.fill(data.mobile);
  await page.waitForTimeout(200);

  // Verification method — only present on some builds/flows; select
  // whichever option the form offers (e.g. SMS) if it's there.
  const verificationRadio = scope.locator('input[name="verificationMethod"]').first();
  if (await verificationRadio.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await verificationRadio.check({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
  }

  const usernameInput = scope.locator('input[name="username"]').first();
  await expect(usernameInput).toBeVisible({ timeout: 10_000 });
  await usernameInput.click();
  await usernameInput.fill(data.username);
  await usernameInput.press('Tab');
  await page.waitForTimeout(300);

  // Two password fields on this step (create + confirm) — fill every
  // visible one with the same value.
  const passwordInputs = scope.locator('input[type="password"]').filter({ visible: true });
  const count = await passwordInputs.count();
  for (let i = 0; i < count; i++) {
    await passwordInputs.nth(i).fill(data.password);
    await page.waitForTimeout(150);
  }

  // Consent checkboxes — confirmed live: over_18, gdpr, terms_accept. Click
  // via their <label for="..."> at a fixed offset (not by matching the
  // label's visible text) — the terms_accept label wraps a "Términos y
  // Condiciones" link, and text-matching that link swallows the click
  // instead of toggling the checkbox.
  const esCheckboxIds = ['over_18', 'gdpr', 'terms_accept'];
  for (const id of esCheckboxIds) {
    const label = scope.locator(`label[for="${id}"]`).first();
    if (await label.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await label.click({ position: { x: 5, y: 10 }, force: true });
    } else {
      await scope.locator(`input[id="${id}"]`).first().check({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(200);
  }

  for (const id of esCheckboxIds) {
    const checked = await scope.locator(`input[id="${id}"]`).first().isChecked().catch(() => false);
    if (!checked) throw new Error(`REG-01 (ES): consent checkbox "${id}" did not get checked`);
  }

  console.log('REG-01 (ES) Paso 3/3 fields filled');
}

/** ES mobile "PASO 1 DE 6": just First/Last/Second-last name (desktop ES combines this with nationality/DOB/gender into one step). */
async function fillEsMobileStep1Name(page: Page, scope: Scope, data: EsRegistrationData): Promise<void> {
  console.log('REG-01 (ES mobile) Paso 1/6 name');

  const firstNameInput = scope.locator('#firstName').first();
  await expect(firstNameInput).toBeVisible({ timeout: 10_000 });
  await firstNameInput.click();
  await firstNameInput.fill(data.firstName);
  await page.waitForTimeout(200);

  const lastNameInput = scope.locator('#lastName').first();
  await expect(lastNameInput).toBeVisible({ timeout: 5_000 });
  await lastNameInput.click();
  await lastNameInput.fill(data.lastName);
  await page.waitForTimeout(200);
  // Second surname is explicitly optional per the form's own helper text
  // (same as desktop ES) — leave it blank.

  await clickContinuarAndWait(page, scope, scope.locator('#nationality').first(), 'mobile-name');
  console.log('REG-01 (ES mobile) Paso 1/6 complete');
}

/** ES mobile "PASO 2 DE 6": Nationality + DOB + Gender. */
async function fillEsMobileStep2NationalityDobGender(page: Page, scope: Scope, data: EsRegistrationData): Promise<void> {
  console.log('REG-01 (ES mobile) Paso 2/6 nationality + DOB + gender');

  const nationalitySelect = scope.locator('#nationality').first();
  if (await nationalitySelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
    const current = await nationalitySelect.inputValue().catch(() => '');
    if (!current) await nationalitySelect.selectOption({ index: 1 }).catch(() => {});
    await page.waitForTimeout(200);
  }

  const dobInput = scope.locator('#dateOfBirth').first();
  await expect(dobInput).toBeVisible({ timeout: 5_000 });
  await dobInput.click();
  await dobInput.fill(data.dob);
  await page.waitForTimeout(200);

  const genderBtn = scope.getByText(data.gender, { exact: true }).first();
  if (await genderBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await genderBtn.click({ force: true });
    await page.waitForTimeout(200);
  }

  await clickContinuarAndWait(page, scope, scope.locator('#email').first(), 'mobile-nationality-dob-gender');
  console.log('REG-01 (ES mobile) Paso 2/6 complete');
}

/** ES mobile "PASO 3 DE 6": Email + Mobile. */
async function fillEsMobileStep3EmailMobile(page: Page, scope: Scope, data: EsRegistrationData): Promise<void> {
  console.log('REG-01 (ES mobile) Paso 3/6 email + mobile');

  const emailInput = scope.locator('#email').first();
  await expect(emailInput).toBeVisible({ timeout: 10_000 });
  await emailInput.click();
  await emailInput.fill(data.email);
  await page.waitForTimeout(200);

  const mobileInput = scope.locator('#mobile').first();
  await expect(mobileInput).toBeVisible({ timeout: 5_000 });
  await mobileInput.click();
  await mobileInput.fill(data.mobile);
  await page.waitForTimeout(300);

  await clickContinuarAndWait(page, scope, scope.locator('#address').first(), 'mobile-email-mobile');
  console.log('REG-01 (ES mobile) Paso 3/6 complete');
}

/** ES mobile "PASO 4 DE 6": Address — direct fields, no autocomplete/manual-entry toggle (unlike desktop ES). */
async function fillEsMobileStep4Address(page: Page, scope: Scope): Promise<void> {
  console.log('REG-01 (ES mobile) Paso 4/6 address');

  const addressInput = scope.locator('#address').first();
  await expect(addressInput).toBeVisible({ timeout: 10_000 });
  await addressInput.click();
  await addressInput.fill('Calle Test 1');
  await page.waitForTimeout(300);

  const postcodeInput = scope.locator('#zipCode').first();
  await expect(postcodeInput).toBeVisible({ timeout: 5_000 });
  await postcodeInput.click();
  await postcodeInput.fill('28001');
  await page.waitForTimeout(200);

  const cityInput = scope.locator('#city').first();
  await expect(cityInput).toBeVisible({ timeout: 5_000 });
  await cityInput.click();
  await cityInput.fill('Madrid');
  await page.waitForTimeout(200);

  const provinceSelect = scope.locator('#state').first();
  if (await provinceSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
    const current = await provinceSelect.inputValue().catch(() => '');
    if (!current) {
      const optionTexts = await provinceSelect.locator('option').allTextContents().catch(() => []);
      const madridIndex = optionTexts.findIndex(t => /madrid/i.test(t));
      await provinceSelect.selectOption({ index: madridIndex > 0 ? madridIndex : 1 }).catch(() => {});
    }
    await page.waitForTimeout(200);
  }

  await clickContinuarAndWait(page, scope, scope.locator('#username').first(), 'mobile-address');
  console.log('REG-01 (ES mobile) Paso 4/6 complete');
}

/** ES mobile "PASO 5 DE 6": Username + Password. */
async function fillEsMobileStep5Credentials(page: Page, scope: Scope, data: EsRegistrationData): Promise<void> {
  console.log('REG-01 (ES mobile) Paso 5/6 credentials');

  const usernameInput = scope.locator('#username').first();
  await expect(usernameInput).toBeVisible({ timeout: 10_000 });
  await usernameInput.click();
  await usernameInput.fill(data.username);
  await page.waitForTimeout(300);

  const passwordInput = scope.locator('#password').first();
  await expect(passwordInput).toBeVisible({ timeout: 5_000 });
  await passwordInput.click();
  await passwordInput.fill(data.password);
  // Dismisses the browser's own autofill/suggestion dropdown, which
  // otherwise sits on top of the Continuar button and swallows the click
  // (same issue confirmed on UK mobile's equivalent step).
  await passwordInput.press('Escape');
  await page.waitForTimeout(300);

  const continueBtn = scope.locator('button', { hasText: /^Continuar$/ }).filter({ visible: true }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click({ force: true });
  // Scoped to the modal — the page behind it has its own "Jugar" play
  // buttons on every game tile (hidden until hover), and an unscoped
  // locator grabs one of those instead of the modal's actual JUGAR button
  // (confirmed live: same ambiguity as the desktop ES functions below).
  const modal = page.locator('[class*="AccountPopup_account"], [class*="Popup_popup"]').filter({ visible: true }).first();
  const jugarBtn = modal.getByRole('button', { name: /^jugar$/i }).first();
  const advanced = await jugarBtn
    .waitFor({ state: 'visible', timeout: 4_000 }).then(() => true).catch(() => false);
  if (!advanced) {
    // Username-availability validation can still be running when the first
    // click lands, silently no-opping it (confirmed pattern on UK mobile) —
    // retry once after a short wait rather than treating one click as reliable.
    await page.waitForTimeout(1_000);
    await continueBtn.click({ force: true });
    await jugarBtn.waitFor({ state: 'visible', timeout: 15_000 });
  }
  console.log('REG-01 (ES mobile) Paso 5/6 complete');
}

/** ES mobile "PASO 6 DE 6": consent checkboxes only — confirmed live, no deposit-limit Yes/No step (unlike UK mobile). */
async function fillEsMobileStep6Consents(page: Page, scope: Scope): Promise<void> {
  console.log('REG-01 (ES mobile) Paso 6/6 consents');

  const esCheckboxIds = ['over_18', 'gdpr', 'terms_accept'];
  for (const id of esCheckboxIds) {
    const checkbox = scope.locator(`input[id="${id}"]`).first();
    const label = scope.locator(`label[for="${id}"]`).first();
    // Confirmed live: right after this step's transition-in, the first
    // checkbox (over_18) can silently no-op a click that lands before it's
    // truly interactive (still visible per bounding box, but not yet wired
    // up) — later checkboxes get more elapsed time and don't show this.
    // Verify-and-retry per checkbox instead of trusting one blind click.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await checkbox.isChecked().catch(() => false)) break;
      if (await label.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await label.click({ position: { x: 5, y: 10 }, force: true });
      } else {
        await checkbox.check({ force: true }).catch(() => {});
      }
      await page.waitForTimeout(300);
    }
  }

  for (const id of esCheckboxIds) {
    const checked = await scope.locator(`input[id="${id}"]`).first().isChecked().catch(() => false);
    if (!checked) throw new Error(`REG-01 (ES mobile): consent checkbox "${id}" did not get checked`);
  }

  console.log('REG-01 (ES mobile) Paso 6/6 complete');
}

async function detectWidgetScope(page: Page): Promise<Scope> {
  const iframeSelectors = [
    'iframe[id*="frmRegister"]',
    'iframe[id*="frmAccount"]',
    'iframe[id*="frm"]',
    'iframe[src*="registration"]',
    'iframe[src*="account"]',
    'iframe[name*="register"]',
    'iframe[name*="account"]',
  ];
  for (const sel of iframeSelectors) {
    try {
      if (await page.locator(sel).first().isVisible({ timeout: 1_500 })) {
        console.log('REG-01 scope: iframe (' + sel + ')');
        return page.frameLocator(sel);
      }
    } catch { /* try next */ }
  }
  console.log('REG-01 scope: main page DOM');
  return page;
}

async function fillStep0WithRetry(
  page: Page, scope: Scope, data: RegistrationData,
  mobileGenerator: () => string = generateUKMobile,
): Promise<void> {
  let mobile = data.mobile;

  for (let attempt = 1; attempt <= MAX_MOBILE_RETRIES; attempt++) {
    console.log('REG-01 Step 0 attempt ' + attempt + ' mobile: ' + mobile);

    const mobileInput = scope.getByRole('textbox', { name: 'Mobile number' }).first();
    await expect(mobileInput).toBeVisible({ timeout: 15_000 });
    await mobileInput.click();
    await mobileInput.fill(mobile);
    await mobileInput.press('Tab');
    await page.waitForTimeout(500);

    const dobInput = scope.getByRole('textbox', { name: "What's your date of birth?" }).first();
    await expect(dobInput).toBeVisible({ timeout: 10_000 });
    await dobInput.click();
    await dobInput.clear();
    await dobInput.pressSequentially(data.dob, { delay: 80 });
    await dobInput.press('Tab');
    await page.waitForTimeout(500);

    const continueBtn = scope.getByRole('button', { name: 'Continue' }).first();
    await expect(continueBtn).toBeVisible({ timeout: 5_000 });

    const isEnabled = await continueBtn.isEnabled({ timeout: 5_000 }).catch(() => false);
    if (!isEnabled) {
      console.log('REG-01 Step 0 attempt ' + attempt + ' Continue disabled, retrying');
      mobile = mobileGenerator();
      data.mobile = mobile;
      continue;
    }

    await expect(continueBtn).toBeEnabled({ timeout: 8_000 });
    await continueBtn.click();
    await page.waitForTimeout(2_500);

    const onStep1 = await scope.getByRole('textbox', { name: /first name/i })
      .first().isVisible({ timeout: 3_000 }).catch(() => false);

    if (onStep1) {
      console.log('REG-01 Step 0 accepted on attempt ' + attempt);
      return;
    }

    console.log('REG-01 Step 0 did not advance, retrying');
    mobile = mobileGenerator();
    data.mobile = mobile;
  }

  throw new Error('REG-01: mobile not accepted after ' + MAX_MOBILE_RETRIES + ' attempts');
}

async function fillStep1(page: Page, scope: Scope, data: RegistrationData, readyLocator?: Locator): Promise<void> {
  console.log('REG-01 Step 1/3 personal details');

  const firstNameInput = scope.getByRole('textbox', { name: /first name/i }).first();
  await expect(firstNameInput).toBeVisible({ timeout: 10_000 });
  await firstNameInput.click();
  await firstNameInput.fill(data.firstName);
  await firstNameInput.press('Tab');
  await page.waitForTimeout(200);

  const lastNameInput = scope.getByRole('textbox', { name: /last name/i }).first();
  await expect(lastNameInput).toBeVisible({ timeout: 5_000 });
  await lastNameInput.click();
  await lastNameInput.fill(data.lastName);
  await lastNameInput.press('Tab');
  await page.waitForTimeout(200);

  const genderBtn = scope.getByText(data.gender, { exact: true }).first();
  await expect(genderBtn).toBeVisible({ timeout: 5_000 });
  await genderBtn.click();
  await page.waitForTimeout(200);

  const emailInput = scope.getByRole('textbox', { name: /email/i }).first();
  await expect(emailInput).toBeVisible({ timeout: 5_000 });
  await emailInput.click();
  await emailInput.fill(data.email);
  await emailInput.press('Tab');
  await page.waitForTimeout(300);

  const continueBtn = scope.getByRole('button', { name: 'Continue' }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click();

  // IE's address step has no house-number field (confirmed live) — callers
  // there must pass their own readyLocator (e.g. the address search input).
  await (readyLocator ?? scope.getByPlaceholder('House No./Name').first())
    .waitFor({ state: 'visible', timeout: 15_000 });

  console.log('REG-01 Step 1/3 complete');
}

async function fillStep2(page: Page, scope: Scope, data: RegistrationData): Promise<void> {
  console.log('REG-01 Step 2/3 address');

  const addr = data.address;

  const houseInput = scope.getByPlaceholder('House No./Name').first();
  await expect(houseInput).toBeVisible({ timeout: 10_000 });
  await houseInput.click();
  await houseInput.fill(addr.houseNumber);
  await houseInput.press('Tab');
  await page.waitForTimeout(300);

  const streetInput = scope.getByPlaceholder('Start typing your address').first();
  await expect(streetInput).toBeVisible({ timeout: 5_000 });
  await streetInput.click();
  await streetInput.fill(addr.street);
  await streetInput.press('Tab');
  await page.waitForTimeout(800);

  const postcodeInput = scope.getByRole('textbox', { name: 'Postcode' }).first();
  await expect(postcodeInput).toBeVisible({ timeout: 5_000 });
  await postcodeInput.click();
  await postcodeInput.fill(addr.postcode);
  await postcodeInput.press('Tab');
  await page.waitForTimeout(300);

  const cityInput = scope.getByRole('textbox', { name: 'City' }).first();
  await expect(cityInput).toBeVisible({ timeout: 5_000 });
  await cityInput.click();
  await cityInput.fill(addr.city);
  await cityInput.press('Tab');
  await page.waitForTimeout(300);

  try {
    const countrySelect = scope.locator('select').filter({ hasText: /kingdom/i }).first();
    if (await countrySelect.isVisible({ timeout: 2_000 })) {
      const val = await countrySelect.inputValue().catch(() => '');
      if (!val.toLowerCase().includes('united')) {
        await countrySelect.selectOption({ label: 'UNITED KINGDOM' });
      }
    }
  } catch { /* already correct */ }

  const continueBtn = scope.getByRole('button', { name: 'Continue' }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click();

  await scope.getByRole('textbox', { name: /username/i })
    .first().waitFor({ state: 'visible', timeout: 15_000 });

  console.log('REG-01 Step 2/3 complete');
}

/** IE's address step — same shape as UK's fillStep2 but with no house-number field, and the
 * country select already defaults to Ireland (confirmed live), so it's only verified, not set. */
async function fillIEAddress(page: Page, scope: Scope, data: RegistrationData): Promise<void> {
  console.log('REG-01 (IE) Step 2/3 address');

  const addr = data.address;

  const streetInput = scope.getByPlaceholder('Start typing your address').first();
  await expect(streetInput).toBeVisible({ timeout: 10_000 });
  await streetInput.click();
  await streetInput.fill(addr.street);
  await streetInput.press('Tab');
  await page.waitForTimeout(800);

  const postcodeInput = scope.getByRole('textbox', { name: 'Postcode' }).first();
  await expect(postcodeInput).toBeVisible({ timeout: 5_000 });
  await postcodeInput.click();
  await postcodeInput.fill(addr.postcode);
  await postcodeInput.press('Tab');
  await page.waitForTimeout(300);

  const cityInput = scope.getByRole('textbox', { name: 'City' }).first();
  await expect(cityInput).toBeVisible({ timeout: 5_000 });
  await cityInput.click();
  await cityInput.fill(addr.city);
  await cityInput.press('Tab');
  await page.waitForTimeout(300);

  try {
    const countrySelect = scope.locator('select').filter({ hasText: /ireland/i }).first();
    if (await countrySelect.isVisible({ timeout: 2_000 })) {
      const val = await countrySelect.inputValue().catch(() => '');
      if (!val.toLowerCase().includes('ireland')) {
        await countrySelect.selectOption({ label: 'IRELAND' }).catch(() => {});
      }
    }
  } catch { /* already correct — confirmed live it defaults to Ireland */ }

  const continueBtn = scope.getByRole('button', { name: 'Continue' }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click();

  await scope.getByRole('textbox', { name: /username/i })
    .first().waitFor({ state: 'visible', timeout: 15_000 });

  console.log('REG-01 (IE) Step 2/3 complete');
}

async function fillStep3(
  page: Page, scope: Scope, data: RegistrationData,
  checkboxIds: string[] = ['over_18', 'gdpr', 'gdprBingo', 'terms_accept'],
): Promise<void> {
  console.log('REG-01 Step 3/3 account credentials');

  // Username
  const usernameInput = scope.getByRole('textbox', { name: /username/i }).first();
  await expect(usernameInput).toBeVisible({ timeout: 10_000 });
  await usernameInput.click();
  await usernameInput.fill(data.username);
  await usernameInput.press('Tab');
  await page.waitForTimeout(300);

  // "Enter password" tab is no longer shown as a separate step on live site —
  // the password field renders directly under "Create a password". Click the
  // tab only if the site reintroduces it.
  const enterPasswordTab = scope.getByText('Enter password', { exact: true }).first();
  if (await enterPasswordTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await enterPasswordTab.click();
    await page.waitForTimeout(300);
  }

  // Password
  const passwordInput = scope.getByPlaceholder('Minimum 10 characters').first();
  await expect(passwordInput).toBeVisible({ timeout: 5_000 });
  await passwordInput.click();
  await passwordInput.fill(data.password);
  await passwordInput.press('Tab');
  await page.waitForTimeout(300);

  // Deposit limit — click "No" if this GEO's build has the step (confirmed
  // live: IE's does not — go straight to consent checkboxes there).
  const noBtn = scope.getByText('No', { exact: true }).first();
  if (await noBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await noBtn.click();
    await page.waitForTimeout(300);
  }

  // Checkboxes — count/ids vary per GEO (all in shadow DOM; Playwright
  // auto-pierces shadow DOM, so page.locator works directly).
  for (const id of checkboxIds) {
    try {
      const label = page.locator(`label[for="${id}"]`).first();
      if (await label.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await label.click({ position: { x: 5, y: 10 } });
        await page.waitForTimeout(500);
        // Handle subscribe popup if it appears after gdpr/gdprBingo
        const continueWithSelection = page.getByText('Continue with my selection', { exact: true }).first();
        if (await continueWithSelection.isVisible({ timeout: 1_500 }).catch(() => false)) {
          const smsOption = page.getByText('SMS', { exact: true }).first();
          if (await smsOption.isVisible({ timeout: 1_000 }).catch(() => false)) {
            await smsOption.click();
            await page.waitForTimeout(300);
          }
          await continueWithSelection.click();
          await page.waitForTimeout(500);
        }
      } else {
        // Fallback: click the checkbox input directly via evaluate
        await page.evaluate((cbId) => {
          function findInShadow(root: ShadowRoot | Document): HTMLElement | null {
            const el = root.querySelector(`#${cbId}`) as HTMLElement;
            if (el) return el;
            for (const node of Array.from(root.querySelectorAll('*'))) {
              if ((node as Element).shadowRoot) {
                const found = findInShadow((node as Element).shadowRoot!);
                if (found) return found;
              }
            }
            return null;
          }
          const cb = findInShadow(document);
          cb?.click();
        }, id);
        await page.waitForTimeout(500);
      }
    } catch { /* try next checkbox */ }
  }

  for (const id of checkboxIds) {
    const checked = await page.evaluate((cbId) => {
      function findInShadow(root: ShadowRoot | Document): HTMLInputElement | null {
        const el = root.querySelector(`#${cbId}`) as HTMLInputElement;
        if (el) return el;
        for (const node of Array.from(root.querySelectorAll('*'))) {
          if ((node as Element).shadowRoot) {
            const found = findInShadow((node as Element).shadowRoot!);
            if (found) return found;
          }
        }
        return null;
      }
      return findInShadow(document)?.checked ?? false;
    }, id);
    if (!checked) throw new Error(`REG-01: consent checkbox "${id}" did not get checked`);
  }

  console.log('REG-01 Step 3/3 complete');
}

/** Mobile "STEP 1 OF 5": just First/Last name (desktop's Step 1 splits Name/Email/Gender across three separate mobile steps). */
async function fillMobileStep1Name(page: Page, scope: Scope, data: RegistrationData): Promise<void> {
  console.log('REG-01 (mobile) Step 1/5 name');

  const firstNameInput = scope.locator('#firstName').first();
  await expect(firstNameInput).toBeVisible({ timeout: 10_000 });
  await firstNameInput.click();
  await firstNameInput.fill(data.firstName);
  await page.waitForTimeout(200);

  const lastNameInput = scope.locator('#lastName').first();
  await expect(lastNameInput).toBeVisible({ timeout: 5_000 });
  await lastNameInput.click();
  await lastNameInput.fill(data.lastName);
  await page.waitForTimeout(200);

  const continueBtn = scope.getByRole('button', { name: 'Continue' }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click();

  await scope.getByText('Choose your gender', { exact: true })
    .first().waitFor({ state: 'visible', timeout: 15_000 });
  console.log('REG-01 (mobile) Step 1/5 complete');
}

/** Mobile "STEP 2 OF 5": Gender + Email (desktop combines these with Name into one step). */
async function fillMobileStep2GenderEmail(page: Page, scope: Scope, data: RegistrationData): Promise<void> {
  console.log('REG-01 (mobile) Step 2/5 gender + email');

  const genderBtn = scope.getByText(data.gender, { exact: true }).first();
  await expect(genderBtn).toBeVisible({ timeout: 10_000 });
  await genderBtn.click();
  await page.waitForTimeout(200);

  const emailInput = scope.locator('#email').first();
  await expect(emailInput).toBeVisible({ timeout: 5_000 });
  await emailInput.click();
  await emailInput.fill(data.email);
  await page.waitForTimeout(300);

  const continueBtn = scope.getByRole('button', { name: 'Continue' }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click();

  await scope.getByPlaceholder('House No./Name')
    .first().waitFor({ state: 'visible', timeout: 15_000 });
  console.log('REG-01 (mobile) Step 2/5 complete');
}

/** Mobile "STEP 3 OF 5": Address — same fields as desktop's Step 2, confirmed live, but located by
 * id rather than accessible name since the postcode/city fields have no native placeholder on mobile. */
async function fillMobileStep3Address(page: Page, scope: Scope, data: RegistrationData): Promise<void> {
  console.log('REG-01 (mobile) Step 3/5 address');

  const addr = data.address;

  const houseInput = scope.getByPlaceholder('House No./Name').first();
  await expect(houseInput).toBeVisible({ timeout: 10_000 });
  await houseInput.click();
  await houseInput.fill(addr.houseNumber);
  await page.waitForTimeout(300);

  const streetInput = scope.getByPlaceholder('Start typing your address').first();
  await expect(streetInput).toBeVisible({ timeout: 5_000 });
  await streetInput.click();
  await streetInput.fill(addr.street);
  await page.waitForTimeout(800);

  const postcodeInput = scope.locator('#zipCode').first();
  await expect(postcodeInput).toBeVisible({ timeout: 5_000 });
  await postcodeInput.click();
  await postcodeInput.fill(addr.postcode);
  await page.waitForTimeout(300);

  const cityInput = scope.locator('#city').first();
  await expect(cityInput).toBeVisible({ timeout: 5_000 });
  await cityInput.click();
  await cityInput.fill(addr.city);
  await page.waitForTimeout(300);

  try {
    const countrySelect = scope.locator('#country').first();
    if (await countrySelect.isVisible({ timeout: 2_000 })) {
      const val = await countrySelect.inputValue().catch(() => '');
      if (!val.toLowerCase().includes('united')) {
        await countrySelect.selectOption({ label: 'UNITED KINGDOM' }).catch(() => {});
      }
    }
  } catch { /* already correct */ }

  const continueBtn = scope.getByRole('button', { name: 'Continue' }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click();

  await scope.locator('#username')
    .first().waitFor({ state: 'visible', timeout: 15_000 });
  console.log('REG-01 (mobile) Step 3/5 complete');
}

/** Mobile "STEP 4 OF 5": Username (pre-filled with a suggestion) + Password. */
async function fillMobileStep4Credentials(page: Page, scope: Scope, data: RegistrationData): Promise<void> {
  console.log('REG-01 (mobile) Step 4/5 credentials');

  const usernameInput = scope.locator('#username').first();
  await expect(usernameInput).toBeVisible({ timeout: 10_000 });
  await usernameInput.click();
  await usernameInput.fill(data.username);
  await page.waitForTimeout(300);

  const passwordInput = scope.locator('#password').first();
  await expect(passwordInput).toBeVisible({ timeout: 5_000 });
  await passwordInput.click();
  await passwordInput.fill(data.password);
  // Dismisses the browser's own autofill/suggestion dropdown, which
  // otherwise sits on top of the Continue button and swallows the click
  // (confirmed live) — see also login-widget.spec.ts's overlay note.
  await passwordInput.press('Escape');
  await page.waitForTimeout(300);

  const continueBtn = scope.getByRole('button', { name: 'Continue' }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  // Confirmed live: username-availability validation can still be running
  // when this first click lands, silently no-opping it — retry once after
  // a short wait rather than treating a single click as reliable here.
  await continueBtn.click({ force: true });
  const advanced = await scope.getByText('Set deposit limits', { exact: true })
    .first().waitFor({ state: 'visible', timeout: 4_000 }).then(() => true).catch(() => false);
  if (!advanced) {
    await page.waitForTimeout(1_000);
    await continueBtn.click({ force: true });
    await scope.getByText('Set deposit limits', { exact: true })
      .first().waitFor({ state: 'visible', timeout: 15_000 });
  }
  console.log('REG-01 (mobile) Step 4/5 complete');
}

/** Mobile "STEP 5 OF 5": Deposit limit (No) + consent checkboxes, ending on "GO PLAY" — same
 * checkbox ids as desktop's Step 3, confirmed live, just under different visible copy. */
async function fillMobileStep5Final(page: Page, scope: Scope): Promise<void> {
  console.log('REG-01 (mobile) Step 5/5 deposit limit + consents');

  const noBtn = scope.getByText('No', { exact: true }).first();
  await expect(noBtn).toBeVisible({ timeout: 5_000 });
  await noBtn.click();
  await page.waitForTimeout(300);

  const checkboxIds = ['over_18', 'gdpr', 'gdprBingo', 'terms_accept'];
  for (const id of checkboxIds) {
    try {
      const label = page.locator(`label[for="${id}"]`).first();
      if (await label.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await label.click({ position: { x: 5, y: 10 } });
        await page.waitForTimeout(500);
      } else {
        await page.evaluate((cbId) => {
          function findInShadow(root: ShadowRoot | Document): HTMLElement | null {
            const el = root.querySelector(`#${cbId}`) as HTMLElement;
            if (el) return el;
            for (const node of Array.from(root.querySelectorAll('*'))) {
              if ((node as Element).shadowRoot) {
                const found = findInShadow((node as Element).shadowRoot!);
                if (found) return found;
              }
            }
            return null;
          }
          const cb = findInShadow(document);
          cb?.click();
        }, id);
        await page.waitForTimeout(500);
      }
    } catch { /* try next checkbox */ }
  }

  for (const id of checkboxIds) {
    const checked = await page.evaluate((cbId) => {
      function findInShadow(root: ShadowRoot | Document): HTMLInputElement | null {
        const el = root.querySelector(`#${cbId}`) as HTMLInputElement;
        if (el) return el;
        for (const node of Array.from(root.querySelectorAll('*'))) {
          if ((node as Element).shadowRoot) {
            const found = findInShadow((node as Element).shadowRoot!);
            if (found) return found;
          }
        }
        return null;
      }
      return findInShadow(document)?.checked ?? false;
    }, id);
    if (!checked) throw new Error(`REG-01 (mobile): consent checkbox "${id}" did not get checked`);
  }

  console.log('REG-01 (mobile) Step 5/5 complete');
}

import { test, expect, Page, FrameLocator, Locator } from '@playwright/test';
import { waitForPageReady, dismissCampaignPopup, dismissCookieConsent, setupCampaignPopupWatcher } from '../../helpers/common';
import { generateRegistrationData, generateUKMobile, generateEsRegistrationData, generateIERegistrationData, generateIrishMobile, generateROWRegistrationData, generateSouthAfricanMobile, generateDERegistrationData, generateGermanMobile, generateCanadianMobile, generateCanadianDOB, generateCanadianAddress, generateAbRegistrationData, RegistrationData, EsRegistrationData, DeRegistrationData } from '../../helpers/testData';
import { currentLocaleStrings } from '../../helpers/locale-strings';
import { currentGeoFeatures } from '../../helpers/geo-features';

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
    // Confirmed live on SNG AB: the default 30s test timeout was hit
    // mid-beforeEach on a slow page load (VPN latency reaching a pre-live
    // QA environment routed through IL/CY), not a real bug — Playwright's
    // retry passed clean immediately after. test.setTimeout() extends the
    // CURRENT test's overall budget even when called from a hook, so bump
    // it here rather than only inside the test body (which doesn't
    // retroactively cover a beforeEach that already ran).
    test.setTimeout(60_000);
    test.skip(!currentGeoFeatures().hasLoginRegistration, `No traditional login/registration for this GEO (${test.info().project.name}) — no test credentials/deposit account exists`);
    await setupCampaignPopupWatcher(page);
    await page.goto('', { waitUntil: 'domcontentloaded' });
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
    // helpers below. DE confirmed live 2026-07-13 (cross-checked against
    // RevWright Claude.ai's independent walkthrough) — genuinely different
    // shape: extra birthPlace/nationality/Bundesland/city fields required by
    // German KYC regulation, house number IS present (unlike IE/ROW), and
    // password rules only accept "!?$" as the special character. DE mobile
    // not yet verified — see the isGermanFormat && isMobile skip below. SE
    // not yet confirmed at all.
    const isSpanishFormat = test.info().project.name.replace(/-mobile$/, '') === 'ES';
    const isIrishFormat = test.info().project.name.replace(/-mobile$/, '') === 'IE';
    const isRowFormat = test.info().project.name.replace(/-mobile$/, '') === 'ROW';
    const isGermanFormat = test.info().project.name.replace(/-mobile$/, '') === 'DE';
    // Brand read directly from process.env.TEST_BRAND, same as
    // helpers/geo-features.ts/test-credentials.ts — safe here because brand
    // (unlike GEO) is fixed for the whole process, not per-project.
    const isAlbertaFormat = (process.env.TEST_BRAND ?? 'SC').toUpperCase() === 'SNG'
      && test.info().project.name.replace(/-mobile$/, '') === 'AB';
    // SNG CA — confirmed live 2026-07-20: shares AB's problem of the mobile
    // country-code dropdown defaulting to the tester's real VPN/IP country
    // (previously spot-checked from a UK IP, where the default happened to
    // already match generateUKMobile's format — masking this until tested
    // from a real Canada IP). Only Step 0's country selection is shared with
    // AB; the rest of CA's flow is the generic/UK shape, not AB's Alberta
    // fields (province/postal code, PEP consent, etc.).
    const isCanadianMobileFormat = (process.env.TEST_BRAND ?? 'SC').toUpperCase() === 'SNG'
      && test.info().project.name.replace(/-mobile$/, '') === 'CA';
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
        // Explicit country selection, not just the mobileGenerator — confirmed
        // live testing SNG IE from a UK IP/VPN: the dropdown defaults to +44
        // (whatever the tester's real IP resolves to), rejecting an Irish
        // number regardless of format. Same root cause/fix as SNG AB's
        // Canada selection — see fillStep0WithRetry's countryCodeLabel param.
        await fillStep0WithRetry(page, scope, data, generateIrishMobile, 'Ireland');
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
    } else if (isIrishFormat && isMobile) {
      // IE mobile — same 5-step shape as UK mobile, with IE's confirmed
      // desktop differences carried over: Irish mobile format
      // (generateIrishMobile), no house-number field on the address step
      // (fillMobileStep2GenderEmailIE / fillMobileStep3AddressIE), and only
      // 3 consent checkboxes instead of UK's 4.
      const data = generateIERegistrationData();

      await runStep('Step 0: Mobile + Date of Birth → Continue', async () => {
        // Explicit country selection, not just the mobileGenerator — confirmed
        // live testing SNG IE from a UK IP/VPN: the dropdown defaults to +44
        // (whatever the tester's real IP resolves to), rejecting an Irish
        // number regardless of format. Same root cause/fix as SNG AB's
        // Canada selection — see fillStep0WithRetry's countryCodeLabel param.
        await fillStep0WithRetry(page, scope, data, generateIrishMobile, 'Ireland');
      });

      await runStep('Step 1 of 5: First/Last name → Continue', async () => {
        await fillMobileStep1Name(page, scope, data);
      });

      await runStep('Step 2 of 5: Gender + Email → Continue', async () => {
        await fillMobileStep2GenderEmailIE(page, scope, data);
      });

      await runStep('Step 3 of 5: Address → Continue', async () => {
        await fillMobileStep3AddressIE(page, scope, data);
      });

      await runStep('Step 4 of 5: Username + Password → Continue', async () => {
        await fillMobileStep4Credentials(page, scope, data);
      });

      await runStep('Step 5 of 5: Deposit limit + consents', async () => {
        await fillMobileStep5Final(page, scope, ['over_18', 'gdpr', 'terms_accept']);
      });

      await runStep('GO PLAY button visible and enabled', async () => {
        const goPlayBtn = scope.getByRole('button', { name: /go play/i }).first();
        await expect(goPlayBtn).toBeVisible({ timeout: 15_000 });
        await expect(goPlayBtn).toBeEnabled({ timeout: 5_000 });
      });
    } else if (isRowFormat && isMobile) {
      // ROW mobile — same 5-step shape as UK mobile, with ROW's confirmed
      // desktop differences carried over: South African mobile format
      // (generateSouthAfricanMobile), no house-number field on the address
      // step (fillMobileStep2GenderEmailROW / fillMobileStep3AddressROW),
      // country select left alone (reflects the tester's real IP rather
      // than a fixed GEO), and only 3 consent checkboxes instead of UK's 4.
      const data = generateROWRegistrationData();

      await runStep('Step 0: Mobile + Date of Birth → Continue', async () => {
        await fillStep0WithRetry(page, scope, data, generateSouthAfricanMobile);
      });

      await runStep('Step 1 of 5: First/Last name → Continue', async () => {
        await fillMobileStep1Name(page, scope, data);
      });

      await runStep('Step 2 of 5: Gender + Email → Continue', async () => {
        await fillMobileStep2GenderEmailROW(page, scope, data);
      });

      await runStep('Step 3 of 5: Address → Continue', async () => {
        await fillMobileStep3AddressROW(page, scope, data);
      });

      await runStep('Step 4 of 5: Username + Password → Continue', async () => {
        await fillMobileStep4Credentials(page, scope, data);
      });

      await runStep('Step 5 of 5: Deposit limit + consents', async () => {
        await fillMobileStep5Final(page, scope, ['over_18', 'gdpr', 'terms_accept']);
      });

      await runStep('GO PLAY button visible and enabled', async () => {
        const goPlayBtn = scope.getByRole('button', { name: /go play/i }).first();
        await expect(goPlayBtn).toBeVisible({ timeout: 15_000 });
        await expect(goPlayBtn).toBeEnabled({ timeout: 5_000 });
      });
    } else if (isRowFormat && !isMobile) {
      // ROW desktop — confirmed live: both the mobile country-code selector
      // and the address step's country select auto-detect from the
      // tester's real IP (showed "+27"/"South Africa" [selected] on this
      // session's South Africa VPN) rather than being fixed, so a
      // UK-format mobile number gets rejected, and — like IE — the address
      // step has no house-number field. Country is only verified, never
      // forced, since "correct" depends on wherever the tester is actually
      // connecting from, not a single fixed GEO.
      const data = generateROWRegistrationData();

      await runStep('Step 0: Mobile + Date of Birth → Continue', async () => {
        await fillStep0WithRetry(page, scope, data, generateSouthAfricanMobile);
      });

      await runStep('Step 1: Name + Email + Gender → Continue', async () => {
        await fillStep1(page, scope, data, scope.getByPlaceholder('Start typing your address').first());
      });

      await runStep('Step 2: Address → Continue', async () => {
        await fillROWAddress(page, scope, data);
      });

      await runStep('Step 3: Username + Password + Checkboxes', async () => {
        // Confirmed live: no gdprBingo checkbox here (same 3-checkbox
        // shape as IE) — Bingo consent presumably doesn't apply outside
        // markets where Slingo offers Bingo directly.
        await fillStep3(page, scope, data, ['over_18', 'gdpr', 'terms_accept']);
      });

      await runStep('GO PLAY button visible and enabled', async () => {
        const goPlayBtn = scope.getByRole('button', { name: /go play/i }).first();
        await expect(goPlayBtn).toBeVisible({ timeout: 15_000 });
        await expect(goPlayBtn).toBeEnabled({ timeout: 5_000 });
      });
    } else if (isGermanFormat && isMobile) {
      // DE mobile registration entry point/shape has not been verified live
      // by either this session or RevWright Claude.ai's independent pass —
      // per the known mobile-nav pattern (login/registration living in the
      // slide-out menu rather than the header), it likely needs its own
      // dedicated inspection before writing real assertions here. Skipping
      // rather than guessing a shape that could silently pass or fail for
      // the wrong reason.
      test.skip(true, 'DE mobile registration flow not yet verified live — needs a dedicated inspection pass');
    } else if (isGermanFormat && !isMobile) {
      // DE desktop — confirmed live 2026-07-13 (cross-checked against
      // RevWright Claude.ai's independent walkthrough of the same flow).
      // Genuinely different shape from UK/IE/ROW: German gambling regulation
      // requires extra KYC fields (place of birth, nationality, state) not
      // present anywhere else in this suite, plus a dependent city dropdown
      // that only populates once a state is chosen. House number IS present
      // (unlike IE/ROW). Ends on "SPIEL LOS!", not "GO PLAY".
      const data = generateDERegistrationData();

      await runStep('Screen 0: Mobile + Date of Birth → Weiter', async () => {
        await fillDEStep0(page, scope, data);
      });

      await runStep('Step 1/3: Personal details → Weiter', async () => {
        await fillDEStep1(page, scope, data);
      });

      await runStep('Step 2/3: Address → Weiter', async () => {
        await fillDEAddress(page, scope, data);
      });

      await runStep('Step 3/3: Username + Password + Checkboxes', async () => {
        await fillDECredentials(page, scope, data);
      });

      await runStep('SPIEL LOS! button visible and enabled', async () => {
        const spielLosBtn = scope.getByRole('button', { name: /spiel los/i }).first();
        await expect(spielLosBtn).toBeVisible({ timeout: 15_000 });
        await expect(spielLosBtn).toBeEnabled({ timeout: 5_000 });
      });
    } else if (isMobile) {
      // Mobile's flow is a genuinely different shape from desktop's —
      // confirmed live: 5 named steps ("STEP X OF 5") instead of desktop's 4
      // unnamed ones, splitting what desktop combines into one screen (e.g.
      // Name+Email+Gender) across separate steps. Step 0 (mobile/DOB) is
      // identical to desktop and reuses fillStep0WithRetry unchanged.
      const data = isAlbertaFormat ? generateAbRegistrationData() : generateRegistrationData();
      // SNG CA (confirmed live 2026-07-20): the DOB field rejects UK's
      // DD/MM/YYYY — its own validation message states the format it wants
      // is dot-separated, year-first (YYYY.MM.DD). AB uses its own DOB
      // shape via generateAbRegistrationData already, so this only applies
      // to CA's otherwise-generic data object. Address is also overridden —
      // CA's real address step has no house-number field (confirmed live,
      // see fillStep2CA) so a UK-shaped address is the wrong fixture here.
      if (isCanadianMobileFormat) {
        data.dob = generateCanadianDOB();
        data.address = generateCanadianAddress();
      }

      await runStep('Step 0: Mobile + Date of Birth → Continue', async () => {
        // SNG AB/CA: country-code dropdown defaults to the tester's real
        // VPN/IP country — see fillStep0WithRetry's countryCodeLabel
        // handling and generateCanadianMobile's docstring.
        await ((isAlbertaFormat || isCanadianMobileFormat)
          ? fillStep0WithRetry(page, scope, data, generateCanadianMobile, 'Canada')
          : fillStep0WithRetry(page, scope, data));
      });

      await runStep('Step 1 of 5: First/Last name → Continue', async () => {
        await fillMobileStep1Name(page, scope, data);
      });

      await runStep('Step 2 of 5: Gender + Email → Continue', async () => {
        await (isCanadianMobileFormat
          ? fillMobileStep2GenderEmailCA(page, scope, data)
          : fillMobileStep2GenderEmail(page, scope, data));
      });

      await runStep('Step 3 of 5: Address → Continue', async () => {
        // SNG AB: selecting Canada as mobile country switches this step to
        // Canadian fields (Province dropdown + postal-code validation) —
        // see fillMobileStep3AddressAB's docstring. SNG CA: no house-number
        // field at all — see fillMobileStep3AddressCA's docstring.
        await (isAlbertaFormat
          ? fillMobileStep3AddressAB(page, scope, data)
          : isCanadianMobileFormat
          ? fillMobileStep3AddressCA(page, scope, data)
          : fillMobileStep3Address(page, scope, data));
      });

      await runStep('Step 4 of 5: Username + Password → Continue', async () => {
        // SNG AB: no separate "Set deposit limits" sub-step — see
        // fillMobileStep4CredentialsAB's docstring.
        await (isAlbertaFormat
          ? fillMobileStep4CredentialsAB(page, scope, data)
          : fillMobileStep4Credentials(page, scope, data));
      });

      await runStep('Step 5 of 5: Deposit limit + consents', async () => {
        // SNG AB: genuinely different consent checkboxes (PEP/HIO + third-party
        // declaration, no over_18/gdprBingo) and no deposit-limit sub-step —
        // see fillMobileStep5FinalAB's docstring.
        // SNG CA: confirmed live 2026-07-20 — no gdprBingo checkbox either,
        // consistent with CA having no Bingo category at all (same as IE/ROW).
        await (isAlbertaFormat
          ? fillMobileStep5FinalAB(page, scope)
          : isCanadianMobileFormat
          ? fillMobileStep5Final(page, scope, ['over_18', 'gdpr', 'terms_accept'])
          : fillMobileStep5Final(page, scope));
      });

      await runStep('GO PLAY button visible and enabled', async () => {
        const goPlayBtn = scope.getByRole('button', { name: /go play/i }).first();
        await expect(goPlayBtn).toBeVisible({ timeout: 15_000 });
        await expect(goPlayBtn).toBeEnabled({ timeout: 5_000 });
      });
    } else {
      const data = isAlbertaFormat ? generateAbRegistrationData() : generateRegistrationData();
      // SNG CA (confirmed live 2026-07-20): the DOB field rejects UK's
      // DD/MM/YYYY — its own validation message states the format it wants
      // is dot-separated, year-first (YYYY.MM.DD). AB uses its own DOB
      // shape via generateAbRegistrationData already, so this only applies
      // to CA's otherwise-generic data object. Address is also overridden —
      // CA's real address step has no house-number field (confirmed live,
      // see fillStep2CA) so a UK-shaped address is the wrong fixture here.
      if (isCanadianMobileFormat) {
        data.dob = generateCanadianDOB();
        data.address = generateCanadianAddress();
      }

      // ── Step 2: Step 0 — Mobile + DOB ─────────────────────────────────
      await runStep('Step 0: Mobile + Date of Birth → Continue', async () => {
        // SNG AB/CA: country-code dropdown defaults to the tester's real
        // VPN/IP country — see fillStep0WithRetry's countryCodeLabel
        // handling and generateCanadianMobile's docstring.
        await ((isAlbertaFormat || isCanadianMobileFormat)
          ? fillStep0WithRetry(page, scope, data, generateCanadianMobile, 'Canada')
          : fillStep0WithRetry(page, scope, data));
      });

      // ── Step 3: Step 1 — Name + Email + Gender ─────────────────────────
      await runStep('Step 1: Name + Email + Gender → Continue', async () => {
        // CA's next step (address) has no house-number field (confirmed
        // live) — the default readyLocator would wait forever for a field
        // that never appears, same class of issue as IE's readyLocator override.
        await fillStep1(page, scope, data, isCanadianMobileFormat
          ? scope.getByPlaceholder('Start typing your address').first()
          : undefined);
      });

      // ── Step 4: Step 2 — Address ───────────────────────────────────────
      await runStep('Step 2: Address → Continue', async () => {
        // SNG AB: selecting Canada as mobile country switches this step to
        // Canadian fields (Province dropdown + postal-code validation) —
        // see fillStep2AB's docstring. SNG CA: a different shape again — no
        // house-number field at all, see fillStep2CA's docstring.
        await (isAlbertaFormat ? fillStep2AB(page, scope, data)
          : isCanadianMobileFormat ? fillStep2CA(page, scope, data)
          : fillStep2(page, scope, data));
      });

      // ── Step 5: Step 3 — Username + Password + Checkboxes ──────────────
      await runStep('Step 3: Username + Password + Checkboxes', async () => {
        // SNG AB: genuinely different consent checkboxes (PEP/HIO + third-party
        // declaration, no over_18/gdprBingo) — see fillMobileStep5FinalAB's
        // docstring for the same set confirmed on mobile.
        // SNG CA: confirmed live 2026-07-20 — no gdprBingo checkbox either,
        // consistent with CA having no Bingo category at all (same as IE/ROW).
        await (isAlbertaFormat
          ? fillStep3(page, scope, data, ['isPepConsent', 'gdpr', 'terms_accept', 'playerDeclaration'])
          : isCanadianMobileFormat
          ? fillStep3(page, scope, data, ['over_18', 'gdpr', 'terms_accept'])
          : fillStep3(page, scope, data));
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

  // Confirmed live 2026-07-16: this step (ES-mobile "mobile-email-mobile")
  // failed once during a full-suite run then passed clean on Playwright's
  // own whole-test retry — a one-off click-swallow under load, same shape
  // as the consent-checkbox and popup-close flakiness already hardened
  // elsewhere in this suite. One retry of the click itself (not just a
  // longer wait) absorbs that instead of failing the whole flow.
  for (let attempt = 0; attempt < 2; attempt++) {
    // force: true — same overlay-interception quirk noted in login.spec.ts.
    await continueBtn.click({ force: true });
    await page.waitForTimeout(1_500);
    const advanced = await readyLocator.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    if (advanced) return;
  }

  await page.screenshot({ path: `test-results/es-reg-debug-${stepLabel}-${Date.now()}.png` });
  const inlineError = await page.locator('[class*="error" i]').first().textContent({ timeout: 2_000 }).catch(() => null);
  throw new Error(`REG-01 (ES): registration did not advance past "${stepLabel}" (inline error: ${inlineError ?? 'none'}) — see debug screenshot`);
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
  countryCodeLabel?: string,
): Promise<void> {
  let mobile = data.mobile;

  // Confirmed live on SNG AB: the mobile country-code dropdown defaults to
  // whatever country the tester's REAL IP/VPN resolves to (Israel, +972,
  // matching the IL/CY VPN required to reach this QA site) — NOT Canada,
  // the actual market being tested. Every retry kept failing "Invalid phone
  // number" regardless of digits typed, because the number was being
  // validated against the wrong country's format. Same root cause already
  // documented for ROW's address-country auto-detect — re-verify with the
  // correct VPN if this ever needs retesting. Select the correct country
  // ONCE before the retry loop, since it doesn't reset between attempts.
  if (countryCodeLabel) {
    const countryDropdown = scope.getByRole('combobox').first();
    const isVisible = await countryDropdown.isVisible({ timeout: 5_000 }).catch(() => false);
    if (isVisible) {
      const current = await countryDropdown.inputValue().catch(() => '');
      if (!current.toLowerCase().includes(countryCodeLabel.toLowerCase())) {
        // selectOption's exact-label match won't work directly — options
        // include the dial code, e.g. "Canada (+ 1)", not just the country
        // name — so find the real option text first, then select by it.
        const options = await countryDropdown.locator('option').allTextContents();
        const match = options.find(o => o.toLowerCase().includes(countryCodeLabel.toLowerCase()));
        if (match) await countryDropdown.selectOption({ label: match }).catch(() => {});
        await page.waitForTimeout(300);
        console.log('REG-01 Step 0 country code set to ' + countryCodeLabel);
      }
    }
  }

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

/**
 * SNG AB desktop address step — same shape/selectors as UK's fillStep2, but
 * confirmed live this page ALSO adds a "Pick your state" province dropdown
 * (defaults to Ontario, must be set to Alberta explicitly) once Canada is
 * selected as the mobile country code, and does NOT try to force the
 * country back to UK — it's already correctly "Canada" from Step 0.
 */
async function fillStep2AB(page: Page, scope: Scope, data: RegistrationData): Promise<void> {
  console.log('REG-01 (AB) Step 2/3 address');

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

  const cityInput = scope.getByRole('textbox', { name: 'City' }).first();
  await expect(cityInput).toBeVisible({ timeout: 5_000 });
  await cityInput.click();
  await cityInput.fill(addr.city);
  await cityInput.press('Tab');
  await page.waitForTimeout(300);

  const stateSelect = scope.getByRole('combobox', { name: 'Pick your state' }).first();
  await expect(stateSelect).toBeVisible({ timeout: 5_000 });
  if (addr.state) {
    await stateSelect.selectOption({ label: addr.state }).catch(() => {});
  }
  await page.waitForTimeout(300);

  const postcodeInput = scope.getByRole('textbox', { name: 'Postcode' }).first();
  await expect(postcodeInput).toBeVisible({ timeout: 5_000 });
  await postcodeInput.click();
  await postcodeInput.fill(addr.postcode);
  await postcodeInput.press('Tab');
  await page.waitForTimeout(300);

  const continueBtn = scope.getByRole('button', { name: 'Continue' }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click();

  await scope.getByRole('textbox', { name: /username/i })
    .first().waitFor({ state: 'visible', timeout: 15_000 });

  console.log('REG-01 (AB) Step 2/3 complete');
}

/** IE's address step — same shape as UK's fillStep2 but with no house-number field. The country
 * select must be forced to Ireland FIRST, not just verified — confirmed live testing from a UK
 * IP/VPN: it defaults to whatever the tester's real IP resolves to (UK), same root cause as the
 * mobile country-code dropdown, and the whole address form renders in THAT country's shape (a
 * UK-style House No./Name field appears, which genuine IE registrations never show) until the
 * correct country is selected. */
async function fillIEAddress(page: Page, scope: Scope, data: RegistrationData): Promise<void> {
  console.log('REG-01 (IE) Step 2/3 address');

  const addr = data.address;

  // Select Ireland FIRST, before filling any field — `.filter({ hasText:
  // /ireland/i })` (the old approach) only matches a <select> whose
  // CURRENTLY DISPLAYED text already says "Ireland", a chicken-and-egg
  // check that silently matches zero elements exactly when the country is
  // wrong and needs changing. Match by real option text instead, same
  // technique as SNG AB's mobile-country and address-province fixes.
  const countrySelect = scope.locator('select').last();
  const countryVisible = await countrySelect.isVisible({ timeout: 3_000 }).catch(() => false);
  if (countryVisible) {
    const val = await countrySelect.inputValue().catch(() => '');
    if (!val.toLowerCase().includes('ireland')) {
      const options = await countrySelect.locator('option').allTextContents();
      const match = options.find(o => o.toLowerCase().includes('ireland'));
      if (match) await countrySelect.selectOption({ label: match }).catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  // Confirmed live: once the country is genuinely Ireland, a UK-style House
  // No./Name field can still be present transiently or not at all depending
  // on how the form re-renders — fill it if present, IE's own address flow
  // simply won't show one so this is a no-op there.
  const houseInput = scope.getByPlaceholder('House No./Name').first();
  if (await houseInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await houseInput.click();
    await houseInput.fill(addr.houseNumber);
    await houseInput.press('Tab');
    await page.waitForTimeout(300);
  }

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

  const continueBtn = scope.getByRole('button', { name: 'Continue' }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click();

  await scope.getByRole('textbox', { name: /username/i })
    .first().waitFor({ state: 'visible', timeout: 15_000 });

  console.log('REG-01 (IE) Step 2/3 complete');
}

/** ROW's address step — same shape as IE's (no house-number field), except the country select
 * defaults to whatever the tester's real IP resolves to (confirmed live: "South Africa" on this
 * session's VPN) rather than a single fixed GEO, so it's left alone entirely rather than
 * verified/forced against a specific expected country. */
async function fillROWAddress(page: Page, scope: Scope, data: RegistrationData): Promise<void> {
  console.log('REG-01 (ROW) Step 2/3 address');

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

  const continueBtn = scope.getByRole('button', { name: 'Continue' }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click();

  await scope.getByRole('textbox', { name: /username/i })
    .first().waitFor({ state: 'visible', timeout: 15_000 });

  console.log('REG-01 (ROW) Step 2/3 complete');
}

/** DE Screen 0 — mobile/DOB/password, before the "SCHRITT X VON 3" counter starts (confirmed
 * live). Country code defaults to "+49" and is left alone. Retries with a fresh mobile number
 * if the form rejects it, same pattern as fillStep0WithRetry but with DE's field names/labels. */
async function fillDEStep0(page: Page, scope: Scope, data: DeRegistrationData): Promise<void> {
  let mobile = data.mobile;

  for (let attempt = 1; attempt <= MAX_MOBILE_RETRIES; attempt++) {
    console.log('REG-01 (DE) Screen 0 attempt ' + attempt + ' mobile: ' + mobile);

    const mobileInput = scope.locator('input[name="mobile"]').first();
    await expect(mobileInput).toBeVisible({ timeout: 15_000 });
    await mobileInput.click();
    await mobileInput.fill(mobile);
    await mobileInput.press('Tab');
    await page.waitForTimeout(500);

    const dobInput = scope.locator('input[name="dateOfBirth"]').first();
    await expect(dobInput).toBeVisible({ timeout: 10_000 });
    await dobInput.click();
    await dobInput.clear();
    await dobInput.pressSequentially(data.dob, { delay: 80 });
    await dobInput.press('Tab');
    await page.waitForTimeout(500);

    const passwordInput = scope.locator('input[name="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5_000 });
    await passwordInput.fill(data.password);
    await page.waitForTimeout(300);

    const continueBtn = scope.getByRole('button', { name: /^weiter$/i }).first();
    await expect(continueBtn).toBeVisible({ timeout: 5_000 });

    const isEnabled = await continueBtn.isEnabled({ timeout: 5_000 }).catch(() => false);
    if (!isEnabled) {
      console.log('REG-01 (DE) Screen 0 attempt ' + attempt + ' Weiter disabled, retrying');
      mobile = generateGermanMobile();
      data.mobile = mobile;
      continue;
    }

    await continueBtn.click({ force: true });
    await page.waitForTimeout(2_000);

    const onStep1 = await scope.locator('input[name="firstName"]').first().isVisible({ timeout: 3_000 }).catch(() => false);
    if (onStep1) {
      console.log('REG-01 (DE) Screen 0 accepted on attempt ' + attempt);
      return;
    }

    console.log('REG-01 (DE) Screen 0 did not advance, retrying');
    mobile = generateGermanMobile();
    data.mobile = mobile;
  }

  throw new Error('REG-01 (DE): mobile not accepted after ' + MAX_MOBILE_RETRIES + ' attempts');
}

/** DE Step 1/3 — personal details. Confirmed live 2026-07-13: name+birthPlace+nationality+gender+
 * email all on one screen, unlike UK's equivalent which has no birthPlace/nationality at all.
 * Nationality defaults to "Deutschland" and is left alone. Gender is a native radio input
 * (id="gender_MALE"/"gender_FEMALE") visually hidden via CSS — must click its <label>, not the
 * input itself, which isn't clickable/visible. */
async function fillDEStep1(page: Page, scope: Scope, data: DeRegistrationData): Promise<void> {
  console.log('REG-01 (DE) Step 1/3 personal details');

  const firstNameInput = scope.locator('input[name="firstName"]').first();
  await expect(firstNameInput).toBeVisible({ timeout: 10_000 });
  await firstNameInput.click();
  await firstNameInput.fill(data.firstName);
  await page.waitForTimeout(200);

  const lastNameInput = scope.locator('input[name="lastName"]').first();
  await expect(lastNameInput).toBeVisible({ timeout: 5_000 });
  await lastNameInput.click();
  await lastNameInput.fill(data.lastName);
  await page.waitForTimeout(200);
  // "Birth name differs from last name" checkbox is optional — leave unchecked.

  const birthPlaceInput = scope.locator('input[name="birthPlace"]').first();
  await expect(birthPlaceInput).toBeVisible({ timeout: 5_000 });
  await birthPlaceInput.click();
  await birthPlaceInput.fill(data.birthPlace);
  await page.waitForTimeout(200);

  const genderId = data.gender === 'Männlich' ? 'gender_MALE' : 'gender_FEMALE';
  await page.evaluate((id) => {
    function findInShadow(root: ShadowRoot | Document): HTMLElement | null {
      const el = root.querySelector(`label[for="${id}"]`) as HTMLElement;
      if (el) return el;
      for (const node of Array.from(root.querySelectorAll('*'))) {
        if ((node as Element).shadowRoot) {
          const found = findInShadow((node as Element).shadowRoot!);
          if (found) return found;
        }
      }
      return null;
    }
    findInShadow(document)?.click();
  }, genderId);
  await page.waitForTimeout(300);

  const emailInput = scope.locator('input[name="email"]').filter({ visible: true }).first();
  await expect(emailInput).toBeVisible({ timeout: 5_000 });
  await emailInput.click();
  await emailInput.fill(data.email);
  await page.waitForTimeout(300);

  const continueBtn = scope.getByRole('button', { name: /^weiter$/i }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click();

  await scope.locator('input[name="zipCode"]').first().waitFor({ state: 'visible', timeout: 15_000 });
  console.log('REG-01 (DE) Step 1/3 complete');
}

/** DE Step 2/3 — address. Confirmed live 2026-07-13: has a house-number field (unlike IE/ROW),
 * plus a state (Bundesland) select and a city select that only populates with valid options
 * once a state is chosen — must select state first, wait, then select city. Country defaults
 * to "Deutschland" and is left alone. */
async function fillDEAddress(page: Page, scope: Scope, data: DeRegistrationData): Promise<void> {
  console.log('REG-01 (DE) Step 2/3 address');

  const zipInput = scope.locator('input[name="zipCode"]').first();
  await expect(zipInput).toBeVisible({ timeout: 10_000 });
  await zipInput.click();
  await zipInput.fill(data.zipCode);
  await page.waitForTimeout(300);

  const buildingInput = scope.locator('input[name="buildingName"]').first();
  await expect(buildingInput).toBeVisible({ timeout: 5_000 });
  await buildingInput.click();
  await buildingInput.fill(data.buildingName);
  await page.waitForTimeout(200);

  const streetInput = scope.locator('input[name="address"]').first();
  await expect(streetInput).toBeVisible({ timeout: 5_000 });
  await streetInput.click();
  await streetInput.fill(data.street);
  await page.waitForTimeout(200);

  const stateSelect = scope.locator('select[name="state"]').first();
  await expect(stateSelect).toBeVisible({ timeout: 5_000 });
  await stateSelect.selectOption({ label: data.state });
  // City <select> is dependent on state — its option list repopulates
  // asynchronously after state changes (confirmed live), so wait before
  // trying to select a city or the old (empty) option list is still active.
  await page.waitForTimeout(1_000);

  const citySelect = scope.locator('select[name="city"]').first();
  await expect(citySelect).toBeVisible({ timeout: 5_000 });
  await citySelect.selectOption({ label: data.city });
  await page.waitForTimeout(300);

  const continueBtn = scope.getByRole('button', { name: /^weiter$/i }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click();

  await scope.locator('input[name="username"]').first().waitFor({ state: 'visible', timeout: 15_000 });
  console.log('REG-01 (DE) Step 2/3 complete');
}

/** DE Step 3/3 — username/password/consents. Confirmed live 2026-07-13: same 3 checkboxes as
 * IE/ROW (over_18, gdpr, terms_accept — no gdprBingo). Password rule checklist only accepts
 * "!?$" as a special character (generateDERegistrationData already accounts for this). Ends on
 * "SPIEL LOS!", asserted by the caller — deliberately never clicked. */
async function fillDECredentials(page: Page, scope: Scope, data: DeRegistrationData): Promise<void> {
  console.log('REG-01 (DE) Step 3/3 account credentials');

  const usernameInput = scope.locator('input[name="username"]').first();
  await expect(usernameInput).toBeVisible({ timeout: 10_000 });
  await usernameInput.click();
  await usernameInput.fill(data.username);
  await page.waitForTimeout(300);

  const passwordInput = scope.locator('input[name="password"]').filter({ visible: true }).first();
  await expect(passwordInput).toBeVisible({ timeout: 5_000 });
  await passwordInput.click();
  await passwordInput.fill(data.password);
  await page.waitForTimeout(300);

  // Real Playwright clicks on the <label> (not a raw JS .click() via
  // page.evaluate) — a scripted DOM click on the label doesn't reliably
  // forward to/toggle the associated native checkbox here, and even when it
  // does, the framework's controlled-checkbox re-render can silently revert
  // it right after (confirmed live: an evaluate-based click reported
  // "checked: true" a moment later, but the checkbox visibly stayed
  // unchecked in a headed run). Verify-and-retry per checkbox, same pattern
  // fillEsMobileStep6Consents uses for the same class of timing quirk.
  const checkboxIds = ['over_18', 'gdpr', 'terms_accept'];
  for (const id of checkboxIds) {
    const checkbox = scope.locator(`#${id}`).first();
    const label = scope.locator(`label[for="${id}"]`).first();
    for (let attempt = 0; attempt < 4; attempt++) {
      if (await checkbox.isChecked().catch(() => false)) break;
      if (await label.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await label.click({ position: { x: 5, y: 10 }, force: true });
      } else {
        await checkbox.check({ force: true }).catch(() => {});
      }
      await page.waitForTimeout(500);
    }
  }

  for (const id of checkboxIds) {
    const checked = await scope.locator(`#${id}`).first().isChecked().catch(() => false);
    if (!checked) throw new Error(`REG-01 (DE): consent checkbox "${id}" did not get checked`);
  }

  console.log('REG-01 (DE) Step 3/3 complete');
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

/** IE mobile "STEP 2 OF 5": same as UK mobile's Gender + Email step, but the next screen has
 * no house-number field (same IE difference confirmed on desktop's fillIEAddress) — wait on
 * the street address input instead of the "House No./Name" placeholder. */
async function fillMobileStep2GenderEmailIE(page: Page, scope: Scope, data: RegistrationData): Promise<void> {
  console.log('REG-01 (IE mobile) Step 2/5 gender + email');

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

  await scope.getByPlaceholder('Start typing your address')
    .first().waitFor({ state: 'visible', timeout: 15_000 });
  console.log('REG-01 (IE mobile) Step 2/5 complete');
}

/** IE mobile "STEP 3 OF 5": same fields as UK mobile's address step, but no house-number field
 * and the country select already defaults to Ireland (same differences confirmed on desktop's
 * fillIEAddress). */
async function fillMobileStep3AddressIE(page: Page, scope: Scope, data: RegistrationData): Promise<void> {
  console.log('REG-01 (IE mobile) Step 3/5 address');

  const addr = data.address;

  const streetInput = scope.getByPlaceholder('Start typing your address').first();
  await expect(streetInput).toBeVisible({ timeout: 10_000 });
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
      if (!val.toLowerCase().includes('ireland')) {
        await countrySelect.selectOption({ label: 'IRELAND' }).catch(() => {});
      }
    }
  } catch { /* already correct — confirmed live on desktop it defaults to Ireland */ }

  const continueBtn = scope.getByRole('button', { name: 'Continue' }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click();

  await scope.locator('#username')
    .first().waitFor({ state: 'visible', timeout: 15_000 });
  console.log('REG-01 (IE mobile) Step 3/5 complete');
}

/** ROW mobile "STEP 2 OF 5": same as UK mobile's Gender + Email step, but the next screen has
 * no house-number field (same ROW difference confirmed on desktop's fillROWAddress) — wait on
 * the street address input instead of the "House No./Name" placeholder. */
async function fillMobileStep2GenderEmailROW(page: Page, scope: Scope, data: RegistrationData): Promise<void> {
  console.log('REG-01 (ROW mobile) Step 2/5 gender + email');

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

  await scope.getByPlaceholder('Start typing your address')
    .first().waitFor({ state: 'visible', timeout: 15_000 });
  console.log('REG-01 (ROW mobile) Step 2/5 complete');
}

/** ROW mobile "STEP 3 OF 5": same fields as UK mobile's address step, but no house-number field
 * and the country select is left alone entirely (same differences confirmed on desktop's
 * fillROWAddress — "correct" depends on the tester's real IP, not a fixed GEO). */
async function fillMobileStep3AddressROW(page: Page, scope: Scope, data: RegistrationData): Promise<void> {
  console.log('REG-01 (ROW mobile) Step 3/5 address');

  const addr = data.address;

  const streetInput = scope.getByPlaceholder('Start typing your address').first();
  await expect(streetInput).toBeVisible({ timeout: 10_000 });
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

  const continueBtn = scope.getByRole('button', { name: 'Continue' }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click();

  await scope.locator('#username')
    .first().waitFor({ state: 'visible', timeout: 15_000 });
  console.log('REG-01 (ROW mobile) Step 3/5 complete');
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

/**
 * SNG AB mobile "STEP 3 OF 6" address — same fields/layout as UK mobile's
 * fillMobileStep3Address, but confirmed live this page ALSO adds a "Pick
 * your state" province dropdown (defaults to Ontario, must be set to
 * Alberta explicitly) once Canada is selected as the mobile country code,
 * and does NOT try to force the country back to UK — the country here is
 * already correctly "Canada" from Step 0, forcing UK would break it.
 */
async function fillMobileStep3AddressAB(page: Page, scope: Scope, data: RegistrationData): Promise<void> {
  console.log('REG-01 (AB mobile) Step 3/6 address');

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

  const cityInput = scope.getByRole('textbox', { name: 'City' }).first();
  await expect(cityInput).toBeVisible({ timeout: 5_000 });
  await cityInput.click();
  await cityInput.fill(addr.city);
  await page.waitForTimeout(300);

  // Confirmed live: defaults to Ontario regardless of the selected country —
  // must be set explicitly, same reasoning as the mobile country-code
  // dropdown in fillStep0WithRetry.
  const stateSelect = scope.getByRole('combobox', { name: 'Pick your state' }).first();
  await expect(stateSelect).toBeVisible({ timeout: 5_000 });
  if (addr.state) {
    await stateSelect.selectOption({ label: addr.state }).catch(() => {});
  }
  await page.waitForTimeout(300);

  const postcodeInput = scope.getByRole('textbox', { name: 'Postcode' }).first();
  await expect(postcodeInput).toBeVisible({ timeout: 5_000 });
  await postcodeInput.click();
  await postcodeInput.fill(addr.postcode);
  await page.waitForTimeout(300);

  const continueBtn = scope.getByRole('button', { name: 'Continue' }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click();

  await scope.locator('#username')
    .first().waitFor({ state: 'visible', timeout: 15_000 });
  console.log('REG-01 (AB mobile) Step 3/6 complete');
}

/** CA (live market) mobile "STEP 2 OF 5": same as UK mobile's Gender + Email step, but the next
 * screen has no house-number field (confirmed live 2026-07-20) — wait on the street address input
 * instead of the "House No./Name" placeholder, same fix pattern as IE's mobile equivalent. */
async function fillMobileStep2GenderEmailCA(page: Page, scope: Scope, data: RegistrationData): Promise<void> {
  console.log('REG-01 (CA mobile) Step 2/5 gender + email');

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

  await scope.getByPlaceholder('Start typing your address')
    .first().waitFor({ state: 'visible', timeout: 15_000 });
  console.log('REG-01 (CA mobile) Step 2/5 complete');
}

/** CA (live market) desktop Step 2 — confirmed live 2026-07-20: NO house-number field at all
 * (unlike AB's fillStep2AB) — address/zipCode/city plus separate country + state selects. Country
 * AND state both already default correctly (state to whichever real province the tester's actual
 * IP resolves to) — do NOT force-select state here the way AB does; the form rejects a submission
 * where the selected province doesn't match the real IP-derived one (confirmed live: forcing
 * "Ontario" while connected from Calgary/Alberta silently failed to advance; leaving the untouched
 * default advanced immediately from a real Montreal/Quebec connection). See CA_ADDRESSES's
 * docstring in helpers/testData.ts for the full investigation. */
async function fillStep2CA(page: Page, scope: Scope, data: RegistrationData): Promise<void> {
  console.log('REG-01 (CA) Step 2/3 address');

  const addr = data.address;

  const streetInput = scope.getByPlaceholder('Start typing your address').first();
  await expect(streetInput).toBeVisible({ timeout: 10_000 });
  await streetInput.click();
  await streetInput.fill(addr.street);
  await streetInput.press('Tab');
  await page.waitForTimeout(800);

  const postcodeInput = scope.locator('#zipCode').first();
  await expect(postcodeInput).toBeVisible({ timeout: 5_000 });
  await postcodeInput.click();
  await postcodeInput.fill(addr.postcode);
  await postcodeInput.press('Tab');
  await page.waitForTimeout(300);

  const cityInput = scope.locator('#city').first();
  await expect(cityInput).toBeVisible({ timeout: 5_000 });
  await cityInput.click();
  await cityInput.fill(addr.city);
  await cityInput.press('Tab');
  await page.waitForTimeout(300);

  const stateSelect = scope.locator('select#state').first();
  await expect(stateSelect).toBeVisible({ timeout: 5_000 });
  if (addr.state) {
    await stateSelect.selectOption({ label: addr.state }).catch(() => {});
  }
  await page.waitForTimeout(300);

  const continueBtn = scope.getByRole('button', { name: 'Continue' }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click();

  await scope.getByRole('textbox', { name: /username/i })
    .first().waitFor({ state: 'visible', timeout: 15_000 });
  console.log('REG-01 (CA) Step 2/3 complete');
}

/** CA (live market) mobile "STEP 3 OF 5": same shape as desktop's Step 2 (see fillStep2CA) —
 * no house-number field, address/zipCode/city by id plus a state/province select. */
async function fillMobileStep3AddressCA(page: Page, scope: Scope, data: RegistrationData): Promise<void> {
  console.log('REG-01 (CA mobile) Step 3/5 address');

  const addr = data.address;

  const streetInput = scope.getByPlaceholder('Start typing your address').first();
  await expect(streetInput).toBeVisible({ timeout: 10_000 });
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

  const stateSelect = scope.locator('select#state').first();
  await expect(stateSelect).toBeVisible({ timeout: 5_000 });
  if (addr.state) {
    await stateSelect.selectOption({ label: addr.state }).catch(() => {});
  }
  await page.waitForTimeout(300);

  const continueBtn = scope.getByRole('button', { name: 'Continue' }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click();

  await scope.locator('#username')
    .first().waitFor({ state: 'visible', timeout: 15_000 });
  console.log('REG-01 (CA mobile) Step 3/5 complete');
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

/**
 * SNG AB mobile "STEP 4 OF 6" credentials — same username/password fields
 * as UK mobile's fillMobileStep4Credentials, but confirmed live AB has NO
 * separate "Set deposit limits" sub-step at all — Continue here goes
 * straight to the consents screen (PEP/HIO + T&Cs + third-party
 * declaration), so this waits for that screen instead.
 */
async function fillMobileStep4CredentialsAB(page: Page, scope: Scope, data: RegistrationData): Promise<void> {
  console.log('REG-01 (AB mobile) Step 4/6 credentials');

  const usernameInput = scope.locator('#username').first();
  await expect(usernameInput).toBeVisible({ timeout: 10_000 });
  await usernameInput.click();
  await usernameInput.fill(data.username);
  await page.waitForTimeout(300);

  const passwordInput = scope.locator('#password').first();
  await expect(passwordInput).toBeVisible({ timeout: 5_000 });
  await passwordInput.click();
  await passwordInput.fill(data.password);
  await passwordInput.press('Escape');
  await page.waitForTimeout(300);

  const continueBtn = scope.getByRole('button', { name: 'Continue' }).first();
  await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  await continueBtn.click({ force: true });
  // Wait for the PEP declaration TEXT, not the #isPepConsent checkbox itself
  // — confirmed live: that checkbox is deliberately hidden via a "hidden"
  // CSS class (its visible representation is this text label a user
  // actually clicks, same shadow-DOM/hidden-checkbox pattern
  // fillMobileStep5Final already handles for UK's checkboxes), and it's
  // already attached to the DOM even before Continue is clicked, so
  // checking mere attachment wouldn't reliably confirm we've advanced.
  const pepText = scope.getByText(/Politically Exposed Person/i).first();
  const advanced = await pepText.waitFor({ state: 'visible', timeout: 4_000 }).then(() => true).catch(() => false);
  if (!advanced) {
    await page.waitForTimeout(1_000);
    await continueBtn.click({ force: true });
    await pepText.waitFor({ state: 'visible', timeout: 15_000 });
  }
  console.log('REG-01 (AB mobile) Step 4/6 complete');
}

/**
 * SNG AB mobile "STEP 5 OF 6" consents — confirmed live this is a genuinely
 * different consent set from UK's (no over_18/gdprBingo here; instead a
 * PEP/HIO declaration and a "not acting on behalf of a third party"
 * declaration, matching Canadian gambling/AML-compliance requirements), and
 * has no separate deposit-limit Yes/No sub-step at all — reuses the same
 * shadow-DOM-aware checkbox-clicking loop as fillMobileStep5Final via its
 * checkboxIds param instead of duplicating that logic.
 */
async function fillMobileStep5FinalAB(page: Page, scope: Scope): Promise<void> {
  console.log('REG-01 (AB mobile) Step 5/6 consents');
  await fillMobileStep5Final(page, scope, ['isPepConsent', 'gdpr', 'terms_accept', 'playerDeclaration'], true);
  console.log('REG-01 (AB mobile) Step 5/6 complete');
}

/** Mobile "STEP 5 OF 5": Deposit limit (No) + consent checkboxes, ending on "GO PLAY" — same
 * checkbox ids as desktop's Step 3, confirmed live, just under different visible copy.
 * checkboxIds defaults to UK's 4; IE mobile passes its own 3 (no gdprBingo), same as IE
 * desktop's fillStep3 call. skipDepositLimit — SNG AB has no deposit-limit Yes/No sub-step
 * at all, confirmed live; the consents checkboxes are the entire screen there. */
async function fillMobileStep5Final(
  page: Page, scope: Scope,
  checkboxIds: string[] = ['over_18', 'gdpr', 'gdprBingo', 'terms_accept'],
  skipDepositLimit = false,
): Promise<void> {
  console.log('REG-01 (mobile) Step 5/5 deposit limit + consents');

  if (!skipDepositLimit) {
    const noBtn = scope.getByText('No', { exact: true }).first();
    await expect(noBtn).toBeVisible({ timeout: 5_000 });
    await noBtn.click();
    await page.waitForTimeout(300);
  }

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

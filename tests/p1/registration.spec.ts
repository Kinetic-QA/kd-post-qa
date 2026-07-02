import { test, expect, Page, FrameLocator } from '@playwright/test';
import { waitForPageReady, dismissCampaignPopup, dismissCookieConsent, setupCampaignPopupWatcher } from '../../helpers/common';
import { generateRegistrationData, generateUKMobile, RegistrationData } from '../../helpers/testData';

/**
 * REG-01: Registration
 * Scope: Full new-player registration journey — Join → mobile/DOB →
 * personal details → address → username/password/consent checkboxes,
 * ending on an enabled "GO PLAY" button. Secondary widget controls (Close,
 * Members Login handoff, Report a Problem) are covered in
 * p2/registration-widget.spec.ts.
 */

type Scope = Page | FrameLocator;
const MAX_MOBILE_RETRIES = 10;

test.describe('Registration Flow', () => {

  test.beforeEach(async ({ page }) => {
    await setupCampaignPopupWatcher(page);
    await page.goto('/');
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

    const data = generateRegistrationData();

    // ── Step 1: Click Join ───────────────────────────────────────────────
    await runStep('Join button → registration widget opens', async () => {
      const joinBtn = page.locator(
        'a:has-text("Join"), button:has-text("Join"), a:has-text("JOIN"), button:has-text("JOIN")'
      ).first();
      await expect(joinBtn).toBeVisible({ timeout: 10_000 });
      await dismissCampaignPopup(page);
      await joinBtn.click();
      await expect(page).toHaveURL(/#account/, { timeout: 15_000 });
      await waitForPageReady(page);
      await page.waitForTimeout(2_000);
      await dismissCampaignPopup(page);
    });

    const scope = await detectWidgetScope(page);

    // ── Step 2: Step 0 — Mobile + DOB ───────────────────────────────────
    await runStep('Step 0: Mobile + Date of Birth → Continue', async () => {
      await fillStep0WithRetry(page, scope, data);
    });

    // ── Step 3: Step 1 — Name + Email + Gender ───────────────────────────
    await runStep('Step 1: Name + Email + Gender → Continue', async () => {
      await fillStep1(page, scope, data);
    });

    // ── Step 4: Step 2 — Address ─────────────────────────────────────────
    await runStep('Step 2: Address → Continue', async () => {
      await fillStep2(page, scope, data);
    });

    // ── Step 5: Step 3 — Username + Password + Checkboxes ────────────────
    await runStep('Step 3: Username + Password + Checkboxes', async () => {
      await fillStep3(page, scope, data);
    });

    // ── Step 6: GO PLAY button visible ───────────────────────────────────
    await runStep('GO PLAY button visible and enabled', async () => {
      const goPlayBtn = scope.getByRole('button', { name: /go play/i }).first();
      await expect(goPlayBtn).toBeVisible({ timeout: 15_000 });
      await expect(goPlayBtn).toBeEnabled({ timeout: 5_000 });
    });

    printSummary();
  });

});

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
      mobile = generateUKMobile();
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
    mobile = generateUKMobile();
    data.mobile = mobile;
  }

  throw new Error('REG-01: mobile not accepted after ' + MAX_MOBILE_RETRIES + ' attempts');
}

async function fillStep1(page: Page, scope: Scope, data: RegistrationData): Promise<void> {
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

  await scope.getByPlaceholder('House No./Name')
    .first().waitFor({ state: 'visible', timeout: 15_000 });

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

async function fillStep3(page: Page, scope: Scope, data: RegistrationData): Promise<void> {
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

  // Deposit limit — click "No"
  const noBtn = scope.getByText('No', { exact: true }).first();
  await expect(noBtn).toBeVisible({ timeout: 5_000 });
  await noBtn.click();
  await page.waitForTimeout(300);

  // Checkboxes — 4 required: over_18, gdpr, gdprBingo, terms_accept (all in shadow DOM)
  // Playwright auto-pierces shadow DOM, so page.locator works directly
  const checkboxIds = ['over_18', 'gdpr', 'gdprBingo', 'terms_accept'];
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

  console.log('REG-01 Step 3/3 complete');
}

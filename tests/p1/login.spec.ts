import { test, expect } from '@playwright/test';
import { dismissPopups, dismissCampaignPopup, setupCampaignPopupWatcher, expectedPlaysecureUrlPattern } from '../../helpers/common';
import { currentTestCredentials } from '../../helpers/test-credentials';
import { currentLocaleStrings } from '../../helpers/locale-strings';
import { currentGeoFeatures } from '../../helpers/geo-features';

/**
 * LW-01: Login
 * Scope: Happy-path login only — opens the header login widget, submits
 * valid credentials, and confirms redirect to an authenticated session
 * (playsecure.<brand-domain>, derived per-GEO — see expectedPlaysecureUrlPattern).
 * Negative/validation paths and secondary controls (Forgot Password, Show
 * Password, Close) are covered in p2/login-widget.spec.ts (English-only —
 * not yet GEO-aware).
 */

test.describe('P1 - Login', () => {

  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    test.skip(!currentGeoFeatures().hasLoginRegistration, `No traditional login/registration for this GEO (${test.info().project.name}) — no test credentials exist`);
    await setupCampaignPopupWatcher(page);
    await page.goto('');
    await page.waitForLoadState('domcontentloaded'); // faster than networkidle for initial load
    await page.waitForTimeout(3_000);
    await dismissPopups(page);
    await page.waitForTimeout(500);
  });

  test('LW-01: Login flow - successful login', async ({ page }) => {
    test.setTimeout(90_000);

    const results: { label: string; status: string }[] = [];

    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }

    function printSummary() {
      console.log('\n' + '═'.repeat(40));
      console.log('  LW-01 LOGIN - RESULTS');
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

    const { username, password } = currentTestCredentials();
    const strings = currentLocaleStrings();
    const isMobile = test.info().project.name.endsWith('-mobile');

    // Mobile has no standalone Login button in the header — it lives inside
    // the hamburger sidebar (confirmed live, same as website-header.spec.ts).
    // The sidebar has a real nonzero bounding box even while closed (just
    // translated off-screen), so Playwright's isVisible() alone can't tell
    // open from closed — check the actual on-screen position instead.
    async function isMobileMenuOnScreen(): Promise<boolean> {
      return await page.evaluate(() => {
        const el = document.querySelector('[class*="MainMenu_main-menu"]');
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.x > -10 && rect.x < window.innerWidth;
      });
    }

    try {

    // ── Step 1: Click Log In ─────────────────────────────────────────────
    await runStep('Log In button clicked → widget opens', async () => {
      await dismissCampaignPopup(page);
      if (isMobile && !(await isMobileMenuOnScreen())) {
        await page.evaluate(() => {
          (document.querySelector('[class*="hamburger" i]') as HTMLElement | null)?.click();
        });
        await page.waitForTimeout(800);
      }
      const loginBtn = isMobile
        ? page.locator('[class*="MainMenu_main-menu"]').getByRole('button', { name: strings.loginButton }).first()
        : page.getByRole('banner').getByRole('button', { name: strings.loginButton }).first();
      await expect(loginBtn).toBeVisible({ timeout: 10_000 });
      await loginBtn.click();
      await expect(page).toHaveURL(/#account/, { timeout: 10_000 });
      await page.waitForTimeout(1_500);
    });

    // ── Step 2: Login modal visible ──────────────────────────────────────
    await runStep('Login modal is visible', async () => {
      const usernameInput = page.getByLabel(strings.usernameOrEmailLabel).first();
      await expect(usernameInput).toBeVisible({ timeout: 10_000 });
    });

    // ── Step 3: Enter credentials ────────────────────────────────────────
    await runStep('Enter username and password', async () => {
      const usernameInput = page.getByLabel(strings.usernameOrEmailLabel).first();
      await usernameInput.click();
      await usernameInput.fill(username);
      await usernameInput.press('Tab');
      const passwordInput = page.locator('input[type="password"]').first();
      await expect(passwordInput).toBeVisible({ timeout: 5_000 });
      await passwordInput.fill(password);
      await page.waitForTimeout(300);
    });

    // ── Step 4: Submit login ─────────────────────────────────────────────
    await runStep('Click LOGIN button', async () => {
      // Scoped to the modal, not just page-wide by text — the header's own
      // "Log in"/"Iniciar sesión" button shares the exact same accessible
      // name, and .first() would otherwise grab that instead of the modal's
      // submit button (confirmed live on ES: silently clicked the header
      // button again, which no-ops, so the test never actually logs in).
      const modal = page.locator('[class*="AccountPopup_account"], [class*="Popup_popup"]').filter({ visible: true }).first();
      const loginSubmitBtn = modal.getByRole('button', { name: strings.loginSubmitButton }).first();
      await expect(loginSubmitBtn).toBeVisible({ timeout: 8_000 });
      // force: true — some markets render an overlay (e.g. son-auth-modals)
      // above the modal that fails Playwright's normal actionability check
      // even though the button is genuinely visible and clickable to a user.
      await loginSubmitBtn.click({ force: true });
      await page.waitForTimeout(4_000);
    });

    // ── Step 5: Verify successful login ─────────────────────────────────
    await runStep('Redirected to authenticated session', async () => {
      await expect(page).toHaveURL(expectedPlaysecureUrlPattern(), { timeout: 15_000 });
    });

    } finally {
      printSummary();
    }
  });

});

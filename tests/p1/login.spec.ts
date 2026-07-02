import { test, expect } from '@playwright/test';
import { dismissPopups, dismissCampaignPopup, setupCampaignPopupWatcher } from '../../helpers/common';

/**
 * LW-01: Login
 * Scope: Happy-path login only — opens the header login widget, submits
 * valid credentials, and confirms redirect to an authenticated session with
 * a visible Logout button. Negative/validation paths and secondary controls
 * (Forgot Password, Show Password, Close) are covered in
 * p2/login-widget.spec.ts.
 */

const TEST_USERNAME = 'kn@test.com';
const TEST_PASSWORD = '5Tandard1';

test.describe('P1 - Login', () => {

  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await setupCampaignPopupWatcher(page);
    await page.goto('/');
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

    try {

    // ── Step 1: Click Log In ─────────────────────────────────────────────
    await runStep('Log In button clicked → widget opens', async () => {
      await dismissCampaignPopup(page);
      const loginBtn = page.getByRole('banner').getByRole('button', { name: /log in/i }).first();
      await expect(loginBtn).toBeVisible({ timeout: 10_000 });
      await loginBtn.click();
      await expect(page).toHaveURL(/#account/, { timeout: 10_000 });
      await page.waitForTimeout(1_500);
    });

    // ── Step 2: Login modal visible ──────────────────────────────────────
    await runStep('Login modal is visible', async () => {
      const usernameInput = page.getByLabel(/username or email/i).first();
      await expect(usernameInput).toBeVisible({ timeout: 10_000 });
    });

    // ── Step 3: Enter credentials ────────────────────────────────────────
    await runStep('Enter username and password', async () => {
      const usernameInput = page.getByLabel(/username or email/i).first();
      await usernameInput.click();
      await usernameInput.fill(TEST_USERNAME);
      await usernameInput.press('Tab');
      const passwordInput = page.locator('input[type="password"]').first();
      await expect(passwordInput).toBeVisible({ timeout: 5_000 });
      await passwordInput.fill(TEST_PASSWORD);
      await page.waitForTimeout(300);
    });

    // ── Step 4: Submit login ─────────────────────────────────────────────
    await runStep('Click LOGIN button', async () => {
      const loginSubmitBtn = page.getByRole('button', { name: 'LOGIN' }).first();
      await loginSubmitBtn.click();
      await page.waitForTimeout(4_000);
    });

    // ── Step 5: Verify successful login ─────────────────────────────────
    await runStep('Redirected + Logout button visible', async () => {
      await expect(page).toHaveURL(/playsecure\.slingo\.com/, { timeout: 15_000 });
      const logoutBtn = page.getByText('Logout', { exact: true }).first();
      await expect(logoutBtn).toBeVisible({ timeout: 10_000 });
    });

    } finally {
      printSummary();
    }
  });

});

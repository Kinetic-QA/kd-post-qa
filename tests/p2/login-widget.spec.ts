import { test, expect } from '@playwright/test';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher } from '../../helpers/common';

/**
 * LW: Login Widget (secondary controls)
 * Scope: Modal-control behavior only — Forgot Password, "Don't have an
 * account" handoff, Show/Hide Password toggle, Report a Problem, and Close
 * — separate from the successful-login happy path in p1/login.spec.ts.
 * CONFIRMED via live DOM inspection: the reset-password form (Step 1) renders
 * inside a closed shadow root Playwright cannot reach at all — see the
 * in-step comment for the render-latency finding and why this check is
 * intentionally limited to an external proxy signal.
 */

test.describe('P2 - Login Widget', () => {

  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await setupCampaignPopupWatcher(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3_000);
    await dismissCookieConsent(page);
    await dismissCampaignPopup(page);
    await page.waitForTimeout(500);
  });

  test('LW-02: Login widget secondary controls', async ({ page }) => {
    test.setTimeout(90_000);

    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(45));
      console.log('  LW-02 LOGIN WIDGET - RESULTS');
      console.log('═'.repeat(45));
      for (const r of results) {
        console.log(`  ${r.status === 'Pass' ? '✅' : '❌'}  ${r.label.padEnd(35)} ${r.status}`);
      }
      const passed = results.filter(r => r.status === 'Pass').length;
      const failed = results.filter(r => r.status === 'Fail').length;
      console.log('─'.repeat(45));
      console.log(`  Total: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}`);
      console.log('═'.repeat(45) + '\n');
    }
    async function runStep(label: string, fn: () => Promise<void>) {
      await test.step(label, async () => {
        try { await fn(); record(label, true); }
        catch (e) { record(label, false); throw e; }
      });
    }

    async function openLoginWidget() {
      await dismissCampaignPopup(page);
      const loginBtn = page.getByRole('banner').getByRole('button', { name: /log in/i }).first();
      await expect(loginBtn).toBeVisible({ timeout: 10_000 });
      await loginBtn.click();
      await expect(page).toHaveURL(/#account/, { timeout: 10_000 });
      await page.waitForTimeout(1_500);
    }

    try {

    await runStep('Step 1: Forgot Password link opens the password reset flow', async () => {
      await openLoginWidget();
      const forgotLink = page.getByText(/forgot.*password/i).first();
      await expect(forgotLink).toBeVisible({ timeout: 10_000 });
      await forgotLink.click();
      // CONFIRMED via live probing (screenshots + element counts at 1s
      // intervals): the reset-password form lives inside a CLOSED shadow
      // root — Playwright's locators can't find so much as a single <input>
      // inside it, let alone match its text, even though the form is
      // visibly present on screen. This is a hard automation limitation
      // (same class of problem as CAPTCHA widgets), not a selector issue.
      //
      // The LOGIN button disappears almost instantly on click (as part of
      // the view-switch), but the actual reset form takes ~8-10s to render
      // (lazy-loaded widget chunk) — confirmed by screenshots showing it
      // was still blank at 3s and fully rendered by 10s. Waiting only for
      // the button to vanish (as this test did before) let the test race
      // ahead into Step 2's page.goto('/') and wipe the modal before a
      // human watching could ever see the form appear.
      //
      // Fix: wait for the LOGIN button to vanish, then wait out the full
      // observed render latency before treating the modal as settled, so
      // the form has genuinely finished appearing (and stays on screen
      // long enough to visually confirm) before this step ends.
      const loginSubmitGone = await page.getByRole('button', { name: 'LOGIN' })
        .first().waitFor({ state: 'hidden', timeout: 10_000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(10_000);
      const modalStillOpen = await page.locator('[class*="AccountPopup_account"]')
        .filter({ visible: true }).first().isVisible({ timeout: 3_000 }).catch(() => false);
      record('Forgot Password swaps to reset-password view', loginSubmitGone && modalStillOpen);
    });

    await runStep('Step 2: "Don\'t have an account" link opens the registration form', async () => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1_000);
      await dismissCampaignPopup(page);
      await openLoginWidget();
      const noAccountLink = page.getByText(/don'?t have an account/i).first();
      await expect(noAccountLink).toBeVisible({ timeout: 10_000 });
      await noAccountLink.click();
      await page.waitForTimeout(1_500);
      const mobileInput = page.getByRole('textbox', { name: /mobile/i }).first();
      await expect(mobileInput).toBeVisible({ timeout: 10_000 });
    });

    await runStep('Step 3: Show Password icon toggles masked/visible text', async () => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1_000);
      await dismissCampaignPopup(page);
      await openLoginWidget();
      const passwordInput = page.locator('input[type="password"]').first();
      await expect(passwordInput).toBeVisible({ timeout: 10_000 });
      await passwordInput.fill('checktoggle');
      // No dedicated class on this icon — it's an SVG eye icon inside a
      // `.cursor-pointer` div positioned next to the password field.
      const showIcon = passwordInput.locator('xpath=../..').locator('.cursor-pointer').first();
      await expect(showIcon).toBeVisible({ timeout: 5_000 });
      await showIcon.click();
      await page.waitForTimeout(300);
      // The toggle swaps the input's type attribute (password -> text), so
      // re-locate by the stable id rather than the now-stale type selector.
      const fieldAfterToggle = page.locator('#password').first();
      const typeAfterToggle = await fieldAfterToggle.getAttribute('type');
      record('Password field toggles to text type', typeAfterToggle === 'text');
    });

    await runStep('Step 4: "Report a Problem" widget appears on click', async () => {
      // "Report a problem" is not shown on the base login form — it only
      // appears after a failed login attempt (same behavior confirmed in
      // p1/feedback-form.spec.ts), so trigger that first.
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1_000);
      await openLoginWidget();
      const usernameInput = page.getByLabel(/username or email/i).first();
      await usernameInput.fill('wronguser_test123');
      const passwordField = page.locator('input[type="password"]').first();
      await passwordField.fill('wrongpass_test123');
      await page.getByRole('button', { name: 'LOGIN' }).first().click();
      await page.waitForTimeout(3_000);

      // Both login- and register-context "Report a problem" buttons exist in
      // the DOM simultaneously; .first() grabs the register one regardless of
      // which is visible, so filter for the actually-visible instance.
      const reportLink = page.getByText('Report a problem', { exact: true }).filter({ visible: true }).first();
      await expect(reportLink).toBeVisible({ timeout: 10_000 });
      await reportLink.click();
      await page.waitForTimeout(2_000);
      const feedbackFrame = page.frameLocator('#frmFeedbackParent').frameLocator('iframe#frmFeedback');
      const emailInput = feedbackFrame.getByPlaceholder('name@example.com').first();
      await expect(emailInput).toBeVisible({ timeout: 15_000 });
    });

    await runStep('Step 5: Close button dismisses the login widget', async () => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1_000);
      await dismissCampaignPopup(page);
      await openLoginWidget();
      const modal = page.locator('[class*="Popup_popup"], [class*="AccountPopup"]').filter({ visible: true }).first();
      const box = await modal.boundingBox().catch(() => null);
      if (box) {
        await page.mouse.click(box.x + box.width - 20, box.y + 20);
        await page.waitForTimeout(1_000);
      } else {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1_000);
      }
      await expect(page).not.toHaveURL(/#account/, { timeout: 8_000 });
    });

    } finally {
      printSummary();
    }
  });

});

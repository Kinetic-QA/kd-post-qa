import { test, expect } from '@playwright/test';
import { dismissCampaignPopup, dismissCookieConsent, setupCampaignPopupWatcher } from '../../helpers/common';
import { currentLocaleStrings } from '../../helpers/locale-strings';

/**
 * FF-01: Feedback Form - Full Flow
 * Scope: Report a Problem → Feedback Form flow triggered from a failed
 * login attempt, through email entry, category selection, and message
 * text, stopping short of actual submission.
 * Form is inside nested iframes: #frmFeedbackParent > iframe
 * NOTE: SUBMIT is intentionally not clicked to avoid sending real feedback.
 */

test.describe('P1 - Feedback Form', () => {

  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await setupCampaignPopupWatcher(page);
    await page.goto('');
    await page.waitForLoadState('domcontentloaded'); // faster than networkidle for initial load
    await page.waitForTimeout(3_000);
    await dismissCookieConsent(page);
    await dismissCampaignPopup(page);
    await page.waitForTimeout(500);
  });

  test('FF-01: Feedback Form full flow via Report a problem', async ({ page }) => {
    test.setTimeout(120_000);

    const results: { label: string; status: string }[] = [];

    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }

    function printSummary() {
      console.log('\n' + '═'.repeat(40));
      console.log('  FF-01 FEEDBACK FORM - RESULTS');
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

    const strings = currentLocaleStrings();

    try {

    // ── Step 1: Open Login widget ────────────────────────────────────────
    await runStep('Log In button → widget opens', async () => {
      const loginBtn = page.getByRole('banner').getByRole('button', { name: strings.loginButton }).first();
      await expect(loginBtn).toBeVisible({ timeout: 10_000 });
      await loginBtn.click();
      await expect(page).toHaveURL(/#account/, { timeout: 15_000 });
      await page.waitForTimeout(2_000);
    });

    // ── Step 2: Enter wrong credentials → error + Report a problem ───────
    await runStep('Wrong credentials → error + Report a problem appears', async () => {
      const usernameInput = page.getByLabel(strings.usernameOrEmailLabel).first();
      await expect(usernameInput).toBeVisible({ timeout: 10_000 });
      await usernameInput.click();
      await usernameInput.fill('wronguser_test123');
      const passwordInput = page.locator('input[type="password"]').first();
      await expect(passwordInput).toBeVisible({ timeout: 5_000 });
      await passwordInput.fill('wrongpass_test123');
      // Scoped to the modal — the header has its own login button sharing
      // the exact same accessible name (see login.spec.ts for the same fix).
      const modal = page.locator('[class*="AccountPopup_account"], [class*="Popup_popup"]').filter({ visible: true }).first();
      const loginSubmitBtn = modal.getByRole('button', { name: strings.loginSubmitButton }).first();
      await loginSubmitBtn.click({ force: true });
      await page.waitForTimeout(3_000);
      const errorMsg = page.getByText(strings.loginErrorText).first();
      await expect(errorMsg).toBeVisible({ timeout: 10_000 });
      const reportLink = page.getByText(strings.reportProblemText).first();
      await expect(reportLink).toBeVisible({ timeout: 5_000 });
    });

    // ── Step 3: Click Report a problem → feedback form loads ─────────────
    // Keeping waitForPageReady here — iframe needs full load before interaction
    await runStep('Report a problem → feedback form loads', async () => {
      const reportLink = page.getByText(strings.reportProblemText).first();
      await reportLink.click();
      await page.waitForTimeout(3_000);
      const feedbackFrame = page.frameLocator('#frmFeedbackParent').frameLocator('iframe#frmFeedback');
      const emailInput = feedbackFrame.getByPlaceholder('name@example.com').first();
      await expect(emailInput).toBeVisible({ timeout: 15_000 });
    });

    // ── Step 4: Fill email → click NEXT ──────────────────────────────────
    await runStep('Email entered → NEXT proceeds to Step 2', async () => {
      const feedbackFrame = page.frameLocator('#frmFeedbackParent').frameLocator('iframe#frmFeedback');
      const emailInput = feedbackFrame.getByPlaceholder('name@example.com').first();
      await emailInput.fill('test_feedback@mailinator.com');
      const nextBtn = feedbackFrame.getByRole('button', { name: strings.feedbackNext }).first();
      await expect(nextBtn).toBeVisible({ timeout: 5_000 });
      await nextBtn.click();
      await page.waitForTimeout(2_000);
    });

    // ── Step 5: Select "Other" → click NEXT ──────────────────────────────
    await runStep('"Other" selected → NEXT proceeds to Step 3', async () => {
      const feedbackFrame = page.frameLocator('#frmFeedbackParent').frameLocator('iframe#frmFeedback');
      const otherOption = feedbackFrame.getByText(strings.feedbackOther, { exact: true }).first();
      await expect(otherOption).toBeVisible({ timeout: 10_000 });
      await otherOption.click();
      await page.waitForTimeout(500);
      const nextBtn = feedbackFrame.getByRole('button', { name: strings.feedbackNext }).first();
      await expect(nextBtn).toBeVisible({ timeout: 5_000 });
      await nextBtn.click();
      await page.waitForTimeout(2_000);
    });

    // ── Step 6: Fill textarea → SUBMIT visible and enabled ───────────────
    await runStep('Textarea typeable → SUBMIT enabled', async () => {
      const feedbackFrame = page.frameLocator('#frmFeedbackParent').frameLocator('iframe#frmFeedback');
      const textarea = feedbackFrame.getByPlaceholder(strings.feedbackTextareaPlaceholder).first();
      await expect(textarea).toBeVisible({ timeout: 10_000 });
      await textarea.fill('test');
      await expect(textarea).toHaveValue('test');
      const submitBtn = feedbackFrame.getByRole('button', { name: strings.feedbackSubmit }).first();
      await expect(submitBtn).toBeVisible({ timeout: 5_000 });
      await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
    });

    // ── Step 7: Close form ────────────────────────────────────────────────
    await runStep('Form closed cleanly', async () => {
      const closeBtn = page.locator('button[aria-label*="Close" i], [class*="Popup_close"], [class*="close"]').first();
      const closeBtnVisible = await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false);
      if (closeBtnVisible) {
        await closeBtn.click({ force: true });
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(1_000);
    });

    } finally {
      printSummary();
    }
  });

});

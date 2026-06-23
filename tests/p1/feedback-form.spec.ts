import { test, expect } from '@playwright/test';
import { dismissCampaignPopup, dismissCookieConsent, setupCampaignPopupWatcher } from '../../helpers/common';

/**
 * FF-01: Feedback Form - Full Flow
 * Form is inside nested iframes: #frmFeedbackParent > iframe
 * NOTE: SUBMIT is intentionally not clicked to avoid sending real feedback.
 */

test.describe('P1 - Feedback Form', () => {

  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await setupCampaignPopupWatcher(page);
    await page.goto('/');
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

    try {

    // ── Step 1: Open Login widget ────────────────────────────────────────
    await runStep('Log In button → widget opens', async () => {
      const loginBtn = page.locator('button:has-text("Log in"), button:has-text("LOG IN")').first();
      await expect(loginBtn).toBeVisible({ timeout: 10_000 });
      await loginBtn.click();
      await expect(page).toHaveURL(/#account/, { timeout: 15_000 });
      await page.waitForTimeout(2_000);
    });

    // ── Step 2: Enter wrong credentials → error + Report a problem ───────
    await runStep('Wrong credentials → error + Report a problem appears', async () => {
      const usernameInput = page.getByLabel(/username or email/i).first();
      await expect(usernameInput).toBeVisible({ timeout: 10_000 });
      await usernameInput.click();
      await usernameInput.fill('wronguser_test123');
      const passwordInput = page.locator('input[type="password"]').first();
      await expect(passwordInput).toBeVisible({ timeout: 5_000 });
      await passwordInput.fill('wrongpass_test123');
      const loginSubmitBtn = page.getByRole('button', { name: 'LOGIN' }).first();
      await loginSubmitBtn.click();
      await page.waitForTimeout(3_000);
      const errorMsg = page.getByText('The login details you entered are incorrect').first();
      await expect(errorMsg).toBeVisible({ timeout: 10_000 });
      const reportLink = page.getByText('Report a problem', { exact: true }).first();
      await expect(reportLink).toBeVisible({ timeout: 5_000 });
    });

    // ── Step 3: Click Report a problem → feedback form loads ─────────────
    // Keeping waitForPageReady here — iframe needs full load before interaction
    await runStep('Report a problem → feedback form loads', async () => {
      const reportLink = page.getByText('Report a problem', { exact: true }).first();
      await reportLink.click();
      await page.waitForTimeout(3_000);
      const feedbackFrame = page.frameLocator('#frmFeedbackParent').frameLocator('iframe').first();
      const emailInput = feedbackFrame.getByPlaceholder('name@example.com').first();
      await expect(emailInput).toBeVisible({ timeout: 15_000 });
    });

    // ── Step 4: Fill email → click NEXT ──────────────────────────────────
    await runStep('Email entered → NEXT proceeds to Step 2', async () => {
      const feedbackFrame = page.frameLocator('#frmFeedbackParent').frameLocator('iframe').first();
      const emailInput = feedbackFrame.getByPlaceholder('name@example.com').first();
      await emailInput.fill('test_feedback@mailinator.com');
      const nextBtn = feedbackFrame.getByRole('button', { name: 'NEXT' }).first();
      await expect(nextBtn).toBeVisible({ timeout: 5_000 });
      await nextBtn.click();
      await page.waitForTimeout(2_000);
    });

    // ── Step 5: Select "Other" → click NEXT ──────────────────────────────
    await runStep('"Other" selected → NEXT proceeds to Step 3', async () => {
      const feedbackFrame = page.frameLocator('#frmFeedbackParent').frameLocator('iframe').first();
      const otherOption = feedbackFrame.getByText('Other', { exact: true }).first();
      await expect(otherOption).toBeVisible({ timeout: 10_000 });
      await otherOption.click();
      await page.waitForTimeout(500);
      const nextBtn = feedbackFrame.getByRole('button', { name: 'NEXT' }).first();
      await expect(nextBtn).toBeVisible({ timeout: 5_000 });
      await nextBtn.click();
      await page.waitForTimeout(2_000);
    });

    // ── Step 6: Fill textarea → SUBMIT visible and enabled ───────────────
    await runStep('Textarea typeable → SUBMIT enabled', async () => {
      const feedbackFrame = page.frameLocator('#frmFeedbackParent').frameLocator('iframe').first();
      const textarea = feedbackFrame.getByPlaceholder('Type your answer here').first();
      await expect(textarea).toBeVisible({ timeout: 10_000 });
      await textarea.fill('test');
      await expect(textarea).toHaveValue('test');
      const submitBtn = feedbackFrame.getByRole('button', { name: 'SUBMIT' }).first();
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

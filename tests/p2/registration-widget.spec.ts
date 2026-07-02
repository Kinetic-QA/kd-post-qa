import { test, expect } from '@playwright/test';
import { dismissCookieConsent, dismissCampaignPopup, setupCampaignPopupWatcher } from '../../helpers/common';

/**
 * RW: Registration Widget (secondary controls)
 * Scope: Modal-control behavior only — Members Login handoff, Report a
 * Problem link, and Close button — separate from the full registration
 * journey in p1/registration.spec.ts. NOT YET VERIFIED against live DOM.
 */

test.describe('P2 - Registration Widget', () => {

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

  test('RW-01: Registration widget secondary controls', async ({ page }) => {
    test.setTimeout(90_000);

    const results: { label: string; status: string }[] = [];
    function record(label: string, passed: boolean) {
      results.push({ label, status: passed ? 'Pass' : 'Fail' });
    }
    function printSummary() {
      console.log('\n' + '═'.repeat(45));
      console.log('  RW-01 REGISTRATION WIDGET - RESULTS');
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

    async function openRegistrationWidget() {
      await dismissCampaignPopup(page);
      const joinBtn = page.locator(
        'a:has-text("Join"), button:has-text("Join"), a:has-text("JOIN"), button:has-text("JOIN")'
      ).first();
      await expect(joinBtn).toBeVisible({ timeout: 10_000 });
      await joinBtn.click();
      await expect(page).toHaveURL(/#account/, { timeout: 15_000 });
      await page.waitForTimeout(1_500);
    }

    try {

    await runStep('Step 1: "Members Login" link opens the login form', async () => {
      await openRegistrationWidget();
      const membersLoginLink = page.getByText(/members login/i).first();
      await expect(membersLoginLink).toBeVisible({ timeout: 10_000 });
      await membersLoginLink.click();
      await page.waitForTimeout(1_500);
      const usernameInput = page.getByLabel(/username or email/i).first();
      await expect(usernameInput).toBeVisible({ timeout: 10_000 });
    });

    await runStep('Step 2: "Report a Problem" link opens the Feedback Form', async () => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1_000);
      await openRegistrationWidget();
      const reportLink = page.getByText('Report a problem', { exact: true }).first();
      await expect(reportLink).toBeVisible({ timeout: 10_000 });
      await reportLink.click();
      await page.waitForTimeout(2_000);
      const feedbackFrame = page.frameLocator('#frmFeedbackParent').frameLocator('iframe#frmFeedback');
      const emailInput = feedbackFrame.getByPlaceholder('name@example.com').first();
      await expect(emailInput).toBeVisible({ timeout: 15_000 });
    });

    await runStep('Step 3: Close button dismisses the registration window', async () => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1_000);
      await dismissCampaignPopup(page);
      await openRegistrationWidget();
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

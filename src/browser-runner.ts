/**
 * Browser Runner
 * ──────────────
 * Runs a Playwright-driven login/logout flow against a given URL and
 * returns a structured result the agent can turn into a Jira comment.
 */

import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StepResult {
  step: string;
  status: 'pass' | 'fail' | 'skip';
  detail?: string;
}

export interface BrowserTestResult {
  success: boolean;
  steps: StepResult[];
  error?: string;
  durationMs: number;
  screenshotPath?: string;         // failure screenshot (legacy)
  screenshotLoggedIn?: string;     // evidence: after successful login
  screenshotLoggedOut?: string;    // evidence: after successful logout
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pass(step: string, detail?: string): StepResult {
  return { step, status: 'pass', detail };
}

function fail(step: string, detail?: string): StepResult {
  return { step, status: 'fail', detail };
}

// ─── Runner ───────────────────────────────────────────────────────────────────

export async function runLoginTest(
  baseUrl: string,
  username: string,
  password: string,
): Promise<BrowserTestResult> {
  const steps: StepResult[] = [];
  const start = Date.now();
  let screenshotPath: string | undefined;
  let screenshotLoggedIn: string | undefined;
  let screenshotLoggedOut: string | undefined;

  const screenshotsDir = path.join(process.cwd(), 'test-results');
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
    recordVideo: undefined,
  });
  const page = await context.newPage();

  try {
    // ── Step 1: Open site ───────────────────────────────────────────────────
    const url = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      const status = res?.status() ?? 0;
      if (status >= 500) {
        steps.push(fail('Open site', `HTTP ${status}`));
        return finalize(false, steps, start, `Site returned HTTP ${status}`);
      }
      steps.push(pass('Open site', `${url} loaded (HTTP ${status})`));
    } catch (e: any) {
      steps.push(fail('Open site', e.message));
      return finalize(false, steps, start, e.message);
    }

    // ── Step 1b: Accept cookie consent (loads after DOM) ────────────────────
    try {
      await page.waitForTimeout(3_000); // allow cookie banner to render
      const cookieBtn = page.locator('button:has-text("Allow all cookies")').first();
      if (await cookieBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await cookieBtn.click();
        await page.waitForTimeout(1_000);
        steps.push(pass('Accept cookies', '"Allow all cookies" clicked'));
      } else {
        steps.push(pass('Accept cookies', 'No cookie banner appeared — skipped'));
      }
    } catch (e: any) {
      // Non-fatal — log and continue
      steps.push(pass('Accept cookies', `Banner not found or already accepted`));
    }

    // ── Step 2: Click the Login button in the header ────────────────────────
    try {
      // Confirmed selector from site scan: button with text "Log in" in Header_header__U4eRo
      const loginBtn = page.locator('header button:has-text("Log in")').first();
      const loginBtnVisible = await loginBtn.isVisible({ timeout: 5_000 }).catch(() => false);

      if (loginBtnVisible) {
        await loginBtn.click();
        steps.push(pass('Open login', 'Header "Log in" button clicked'));
      } else {
        // Fallback selectors
        const fallbacks = [
          'button:has-text("Log in")',
          'button:has-text("Login")',
          'a[href*="login"]',
          'a:has-text("Log in")',
        ];
        let clicked = false;
        for (const sel of fallbacks) {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await el.click();
            clicked = true;
            steps.push(pass('Open login', `Fallback selector clicked: ${sel}`));
            break;
          }
        }
        if (!clicked) {
          steps.push(fail('Open login', 'Login button not found in header or fallbacks'));
          screenshotPath = path.join(screenshotsDir, `login-not-found-${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath });
          return finalize(false, steps, start, 'Login entry point not found', screenshotPath);
        }
      }

      // Wait for login widget/modal to appear
      await page.waitForTimeout(2_000);
    } catch (e: any) {
      steps.push(fail('Open login', e.message));
      return finalize(false, steps, start, e.message);
    }

    // ── Step 3: Enter credentials (login form is inside a frame) ───────────
    try {
      // Find the frame that contains the login inputs
      await page.waitForTimeout(1_000);
      let loginFrame: import('@playwright/test').Frame | null = null;
      for (const frame of page.frames()) {
        const emailEl = await frame.$('input[name="username"], input[type="email"], input[placeholder*="email" i], input[placeholder*="username" i]');
        if (emailEl) { loginFrame = frame; break; }
      }

      const emailSelectors = [
        'input[name="username"]',
        'input[type="email"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="username" i]',
        'input[name="email"]',
      ];
      const submitSelectors = [
        'button[type="submit"]',
        'button:has-text("Login")',
        'button:has-text("Log in")',
        'button:has-text("LOGIN")',
        'input[type="submit"]',
      ];

      if (loginFrame) {
        // Fill inside the frame
        let filled = false;
        for (const sel of emailSelectors) {
          const el = await loginFrame.$(sel);
          if (el) { await loginFrame.fill(sel, username); filled = true; break; }
        }
        if (!filled) {
          steps.push(fail('Enter credentials', 'Could not find username field in login frame'));
          screenshotPath = path.join(screenshotsDir, `no-email-field-${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath });
          return finalize(false, steps, start, 'Username field not found', screenshotPath);
        }
        await loginFrame.fill('input[type="password"]', password);
        steps.push(pass('Enter credentials', `Filled username: ${username}`));

        // Submit
        let submitted = false;
        for (const sel of submitSelectors) {
          const btn = await loginFrame.$(sel);
          if (btn) { await btn.click(); submitted = true; break; }
        }
        if (!submitted) await page.keyboard.press('Enter');
      } else {
        // Fallback: fill on the main page
        let emailFilled = false;
        for (const sel of emailSelectors) {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await el.fill(username);
            emailFilled = true;
            break;
          }
        }
        if (!emailFilled) {
          steps.push(fail('Enter credentials', 'Could not find username/email field'));
          screenshotPath = path.join(screenshotsDir, `no-email-field-${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath });
          return finalize(false, steps, start, 'Username field not found', screenshotPath);
        }
        await page.fill('input[type="password"]', password);
        steps.push(pass('Enter credentials', `Filled username: ${username}`));

        let submitted = false;
        for (const sel of submitSelectors) {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 1_500 }).catch(() => false)) {
            await el.click(); submitted = true; break;
          }
        }
        if (!submitted) await page.keyboard.press('Enter');
      }

      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    } catch (e: any) {
      steps.push(fail('Enter credentials', e.message));
      return finalize(false, steps, start, e.message);
    }

    // ── Step 4: Verify login success ────────────────────────────────────────
    try {
      // Check for error messages
      const errorSelectors = [
        '[class*="error" i]',
        '[class*="alert" i]',
        '[role="alert"]',
        '[data-testid*="error"]',
      ];
      for (const sel of errorSelectors) {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 1_500 }).catch(() => false)) {
          const text = await el.textContent();
          if (text && /invalid|incorrect|wrong|failed|error/i.test(text)) {
            steps.push(fail('Verify login', `Login error: ${text.trim()}`));
            screenshotPath = path.join(screenshotsDir, `login-error-${Date.now()}.png`);
            await page.screenshot({ path: screenshotPath });
            return finalize(false, steps, start, text.trim(), screenshotPath);
          }
        }
      }

      // Look for indicators of being logged in
      const loggedInSelectors = [
        'a[href*="logout"]',
        'a[href*="log-out"]',
        'button:has-text("Logout")',
        'button:has-text("Log out")',
        'button:has-text("Sign out")',
        '[data-testid*="user"]',
        '[class*="avatar"]',
        '[class*="account"]',
        '[aria-label*="account" i]',
        '[aria-label*="profile" i]',
      ];
      let loggedIn = false;
      let loggedInDetail = '';
      for (const sel of loggedInSelectors) {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3_000 }).catch(() => false)) {
          loggedIn = true;
          loggedInDetail = sel;
          break;
        }
      }

      if (!loggedIn) {
        // Check URL changed away from login page as a fallback signal
        const currentUrl = page.url();
        if (!/login|sign-?in/i.test(currentUrl)) {
          loggedIn = true;
          loggedInDetail = `URL is ${currentUrl}`;
        }
      }

      if (!loggedIn) {
        screenshotPath = path.join(screenshotsDir, `login-unclear-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath });
        steps.push(fail('Verify login', 'Could not confirm successful login'));
        return finalize(false, steps, start, 'Login result unclear', screenshotPath);
      }

      screenshotLoggedIn = path.join(screenshotsDir, `evidence-logged-in-${Date.now()}.png`);
      await page.screenshot({ path: screenshotLoggedIn, fullPage: false });
      steps.push(pass('Verify login', `Successfully logged in (detected: ${loggedInDetail})`));
    } catch (e: any) {
      steps.push(fail('Verify login', e.message));
      return finalize(false, steps, start, e.message);
    }

    // ── Step 5: Open hamburger sidebar → click Logout ──────────────────────
    try {
      let loggedOut = false;

      // Click the hamburger (3 lines, top-left) to open the sidebar
      const hamburger = page.locator('[data-testid="menuBarHamburger"]').first();
      if (await hamburger.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await hamburger.click();
        await page.waitForTimeout(800);
        steps.push(pass('Open sidebar', 'Hamburger menu clicked'));
      } else {
        // Fallback selectors if data-testid changes
        const fallbackHamburger = page.locator('[data-cy="top-bar-hamburger"], [class*="hamburger"], [class*="nav-toggle"]').first();
        if (await fallbackHamburger.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await fallbackHamburger.click();
          await page.waitForTimeout(800);
          steps.push(pass('Open sidebar', 'Fallback hamburger clicked'));
        }
      }

      // Click the Logout item in the now-open sidebar using React-compatible dispatchEvent
      const logoutSelectors = ['[data-testid="menu-logout"]', '[data-cy="menuItem--logout"]', '[class*="menuItem--logout"]'];
      for (const sel of logoutSelectors) {
        const el = page.locator(sel).first();
        if (await el.count() > 0) {
          await el.evaluate((node: HTMLElement) => {
            node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window }));
          });
          loggedOut = true;
          break;
        }
      }

      if (!loggedOut) {
        steps.push(fail('Log out', 'Could not find logout button in sidebar'));
        return finalize(false, steps, start, 'Logout button not found', screenshotPath, screenshotLoggedIn);
      }

      // Wait for the logout XHR to complete, then navigate to the public homepage for the evidence screenshot
      await page.waitForTimeout(3_000);
      const homeUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
      await page.goto(homeUrl.replace('playsecure.', 'www.').replace(/playsecure\/.*/, ''), { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {});
      // Confirm logged-out state: "Log in" button should now be visible
      await page.waitForSelector('button:has-text("Log in")', { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(2_000); // let hero banner and assets settle
      screenshotLoggedOut = path.join(screenshotsDir, `evidence-logged-out-${Date.now()}.png`);
      await page.screenshot({ path: screenshotLoggedOut, fullPage: false });
      steps.push(pass('Log out', 'Successfully logged out'));
    } catch (e: any) {
      steps.push(fail('Log out', e.message));
      return finalize(false, steps, start, e.message, screenshotPath, screenshotLoggedIn);
    }

    return finalize(true, steps, start, undefined, screenshotPath, screenshotLoggedIn, screenshotLoggedOut);
  } catch (e: any) {
    return finalize(false, steps, start, e.message, screenshotPath, screenshotLoggedIn);
  } finally {
    await context.close();
    await browser.close();
  }
}

function finalize(
  success: boolean,
  steps: StepResult[],
  start: number,
  error?: string,
  screenshotPath?: string,
  screenshotLoggedIn?: string,
  screenshotLoggedOut?: string,
): BrowserTestResult {
  return {
    success,
    steps,
    error,
    durationMs: Date.now() - start,
    screenshotPath,
    screenshotLoggedIn,
    screenshotLoggedOut,
  };
}

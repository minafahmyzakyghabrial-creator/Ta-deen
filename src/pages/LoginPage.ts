import { expect, Locator } from '@playwright/test';
import { Credentials, readNumber } from '@config/index';
import { BasePage } from './BasePage';

/**
 * Selectors of a username/password login form.
 * Each portal provides its own map — the portals do NOT share a login mechanism.
 */
export interface LoginSelectors {
  readonly username: string;
  readonly password: string;
  readonly submit: string;
}

export type LoginOutcome =
  | { status: 'success'; landingUrl: string }
  | { status: 'error'; message: string }
  | { status: 'timeout' };

export class LoginFailedError extends Error {
  constructor(portal: string, detail: string) {
    super(`Login to the ${portal} portal failed: ${detail}`);
    this.name = 'LoginFailedError';
  }
}

/**
 * Shared behaviour of form-based login screens (open → fill → submit → detect outcome).
 * Subclasses only declare their selectors (and can override steps if their flow differs,
 * e.g. an extra OTP step).
 */
export abstract class LoginPage extends BasePage {
  protected abstract readonly selectors: LoginSelectors;

  get usernameInput(): Locator {
    return this.page.locator(this.selectors.username);
  }
  get passwordInput(): Locator {
    return this.page.locator(this.selectors.password);
  }
  get submitButton(): Locator {
    return this.page.locator(this.selectors.submit);
  }

  /**
   * Opens the login screen. The form is rendered client-side and can be slow: on TEST (2026-10-30, during a
   * republish) it took ~30 s, and some loads ended on OutSystems' "_error.html" ("No cached manifest found").
   * So the form gets LOGIN_LOAD_TIMEOUT_MS (default 60 s), and a load that shows the error page or no form is
   * reloaded once. A fast load behaves exactly as before.
   */
  async open(): Promise<void> {
    const timeout = readNumber('LOGIN_LOAD_TIMEOUT_MS', 120_000);
    for (let attempt = 1; attempt <= 2; attempt++) {
      await this.page.goto(this.urls.loginUrl);
      const rendered = await this.usernameInput
        .or(this.page.getByRole('button', { name: 'RELOAD' }))
        .first()
        .waitFor({ timeout })
        .then(async () => (await this.usernameInput.count()) > 0, () => false);
      if (rendered || attempt === 2) break;
    }
    await this.expectLoaded();
  }

  /**
   * The login form is rendered (OutSystems renders it client-side after the JS loads).
   * During OutSystems screen transitions the old and new screen briefly coexist, duplicating
   * every element id; waiting for a single match lets the transition finish before strict-mode
   * locators are used.
   */
  async expectLoaded(): Promise<void> {
    // The duplicate can appear AFTER a single match was seen (TEST 2026-11-12: two "#Input_PasswordVal2"), so the
    // whole check is repeated until every field is single and visible at the same time.
    await expect(async () => {
      for (const field of [this.usernameInput, this.passwordInput, this.submitButton]) {
        await expect(field).toHaveCount(1, { timeout: 5_000 });
        await expect(field).toBeVisible({ timeout: 5_000 });
      }
    }).toPass({ timeout: readNumber('LOGIN_LOAD_TIMEOUT_MS', 120_000), intervals: [1_000, 2_000, 5_000] });
  }

  async fillCredentials({ username, password }: Credentials): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
  }

  /**
   * Clicks submit and waits for whichever happens first:
   *   - the app navigates away from the login screen  -> success
   *   - an error feedback message appears             -> error
   * No fixed sleeps: both are event-driven waits bounded by the navigation timeout.
   */
  async submit(timeout = 120_000): Promise<LoginOutcome> {
    await this.submitButton.click();
    const loginPath = this.urls.loginPath.toLowerCase();

    const result = await Promise.race([
      this.page
        .waitForURL((url) => url.pathname.toLowerCase() !== loginPath, { timeout })
        .then(() => ({ status: 'success', landingUrl: this.page.url() }) as const)
        .catch(() => ({ status: 'timeout' }) as const),
      this.feedback
        .of('error')
        .first()
        .waitFor({ state: 'visible', timeout })
        .then(async () => ({ status: 'error', message: await this.feedback.textOf('error') }) as const)
        .catch(() => ({ status: 'timeout' }) as const),
    ]);
    return result;
  }

  /**
   * After a successful login the app calls window.Sentry.setUser. The page first loads only a Sentry stub, then the
   * full bundle several seconds after the form renders (~5 s on TEST, 2026-11-11). A submit before that shows
   * "window.Sentry.setUser is not a function" and stays on the login page. Wait for the bundle, but don't depend on
   * it: without Sentry (another environment, blocked CDN) this just times out and the login goes ahead.
   */
  private async waitForMonitoringScript(timeout = 20_000): Promise<void> {
    await this.page
      .waitForFunction(() => typeof (window as unknown as { Sentry?: { setUser?: unknown } }).Sentry?.setUser === 'function', undefined, { timeout })
      .catch(() => undefined);
  }

  /** Full login; throws a descriptive error if it does not succeed. */
  async login(credentials: Credentials): Promise<string> {
    await this.open();
    await this.waitForMonitoringScript();
    // The screen can re-render meanwhile (old + new copy, duplicate ids — TEST 2026-11-11): wait for one form again.
    await this.expectLoaded();
    await this.fillCredentials(credentials);
    let outcome = await this.submit();
    if (outcome.status === 'error' && /Sentry/i.test(outcome.message)) {
      // Still too early for the monitoring bundle: dismiss the toast, wait for it and submit once more.
      await this.feedback.closeAll();
      await this.waitForMonitoringScript(30_000);
      await this.expectLoaded();
      await this.fillCredentials(credentials);
      outcome = await this.submit();
    }
    if (outcome.status === 'success') return outcome.landingUrl;
    if (outcome.status === 'error') {
      throw new LoginFailedError(this.portal, `the application showed an error: "${outcome.message}"`);
    }
    throw new LoginFailedError(
      this.portal,
      `still on the login page after submitting. Possible causes: wrong credentials with no visible ` +
        `error, a CAPTCHA/OTP step enabled in this environment, or a slow server. Check the trace.`,
    );
  }
}

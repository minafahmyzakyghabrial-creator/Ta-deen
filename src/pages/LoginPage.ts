import { expect, Locator } from '@playwright/test';
import { Credentials } from '@config/index';
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

  async open(): Promise<void> {
    await this.page.goto(this.urls.loginUrl);
    await this.expectLoaded();
  }

  /**
   * The login form is rendered (OutSystems renders it client-side after the JS loads).
   * During OutSystems screen transitions the old and new screen briefly coexist, duplicating
   * every element id; waiting for a single match lets the transition finish before strict-mode
   * locators are used.
   */
  async expectLoaded(): Promise<void> {
    for (const field of [this.usernameInput, this.passwordInput, this.submitButton]) {
      await expect(field).toHaveCount(1);
    }
    await expect(this.usernameInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
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
  async submit(timeout = 45_000): Promise<LoginOutcome> {
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

  /** Full login; throws a descriptive error if it does not succeed. */
  async login(credentials: Credentials): Promise<string> {
    await this.open();
    await this.fillCredentials(credentials);
    const outcome = await this.submit();
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

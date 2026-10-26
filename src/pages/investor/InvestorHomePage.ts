import { expect, Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * Investor landing page after login.
 *
 * TODO(selectors): the post-login screen has not been inspected yet. `expectLoaded()`
 * currently proves "authenticated" generically (left the login screen, login form gone).
 * Once known, add a unique landmark (e.g. page.getByTestId('investor-dashboard')) here —
 * tests do not need to change.
 */
export class InvestorHomePage extends BasePage {
  constructor(page: Page) {
    super(page, 'investor');
  }

  async expectLoaded(): Promise<void> {
    await expect.poll(() => this.isOnLoginPage(), { message: 'Investor should not be on a login page' }).toBe(false);
    await expect(this.page.locator('input[type="password"]')).toHaveCount(0);
  }
}

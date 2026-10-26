import { expect, Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * Employee landing page after LDAP login.
 *
 * TODO(selectors): the post-login screen has not been inspected yet — see InvestorHomePage.
 * Add the employee inbox / request search landmarks here once known.
 */
export class EmployeeHomePage extends BasePage {
  constructor(page: Page) {
    super(page, 'employee');
  }

  async expectLoaded(): Promise<void> {
    await expect.poll(() => this.isOnLoginPage(), { message: 'Employee should not be on a login page' }).toBe(false);
    await expect(this.page.locator('input[type="password"]')).toHaveCount(0);
  }
}

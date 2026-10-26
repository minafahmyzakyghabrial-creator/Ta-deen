import { Page } from '@playwright/test';
import { EmployeeHomePage } from './EmployeeHomePage';
import { EmployeeLoginPage } from './EmployeeLoginPage';

/**
 * Entry point to every Employee page object for ONE user session.
 * Add new employee screens as getters here (e.g. `get requestSearch()`).
 */
export class EmployeePortal {
  constructor(readonly page: Page) {}

  get login() {
    return new EmployeeLoginPage(this.page);
  }
  get home() {
    return new EmployeeHomePage(this.page);
  }
}

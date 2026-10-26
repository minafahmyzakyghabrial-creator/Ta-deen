import { Page } from '@playwright/test';
import { InvestorHomePage } from './InvestorHomePage';
import { InvestorLoginPage } from './InvestorLoginPage';
import { RequestsPage } from './RequestsPage';
import { ExplorationLicensePage } from './exploration-license/ExplorationLicensePage';

/**
 * Entry point to every Investor page object for ONE user session.
 * Tests use `investor.home`, `investor.requests`, ... instead of `new XPage(page)`.
 *
 * Add new investor screens as getters here (e.g. `get newLicenseApplication()`).
 */
export class InvestorPortal {
  constructor(readonly page: Page) {}

  get login() {
    return new InvestorLoginPage(this.page);
  }
  get home() {
    return new InvestorHomePage(this.page);
  }
  get requests() {
    return new RequestsPage(this.page);
  }
  get explorationLicense() {
    return new ExplorationLicensePage(this.page);
  }
}

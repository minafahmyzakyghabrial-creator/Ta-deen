import { Page } from '@playwright/test';
import { AuthStrategyName, Credentials } from '@config/index';
import { LoginPage } from '@pages/LoginPage';
import { LoginStrategy } from './LoginStrategy';

/** Username/password form login, delegating all UI work to the portal's LoginPage object. */
export class FormLoginStrategy implements LoginStrategy {
  constructor(
    readonly name: AuthStrategyName,
    private readonly createLoginPage: (page: Page) => LoginPage,
  ) {}

  login(page: Page, credentials: Credentials): Promise<string> {
    return this.createLoginPage(page).login(credentials);
  }
}

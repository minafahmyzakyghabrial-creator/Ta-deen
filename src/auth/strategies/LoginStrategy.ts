import { Page } from '@playwright/test';
import { AuthStrategyName, Credentials } from '@config/index';

/**
 * How a user authenticates to a portal.
 *
 * Decision: authentication is a pluggable STRATEGY per portal, not a single shared login
 * function. Investor (/Login, email) and Employee (/Login_LDAP, LDAP) already differ, and
 * either could later move to SSO / Nafath / OTP. A new mechanism = a new strategy class,
 * registered in ./index.ts — no test or fixture changes.
 */
export interface LoginStrategy {
  readonly name: AuthStrategyName;
  /** Logs in on the given page. Resolves with the URL the app landed on after login. */
  login(page: Page, credentials: Credentials): Promise<string>;
}

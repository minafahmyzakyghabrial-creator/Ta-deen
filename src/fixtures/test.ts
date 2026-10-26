import { test as base, expect } from '@playwright/test';
import { DEFAULT_USERS, EnvironmentSettings, getEnvironment } from '@config/index';
import { SessionManager } from '@auth/SessionManager';
import { InvestorPortal } from '@pages/investor/InvestorPortal';
import { EmployeePortal } from '@pages/employee/EmployeePortal';

/**
 * Project-wide test fixtures. ALWAYS import `test` / `expect` from here, not from
 * '@playwright/test', so every spec gets the same sessions, portals and config.
 *
 * All fixtures are LAZY: a test only logs in the users it actually asks for, and tests
 * that need no login (e.g. login-page smoke checks) need no credentials at all.
 *
 *   investor   -> default investor (investor1), logged in, own isolated context
 *   employee   -> default employee (employee1), logged in, own isolated context
 *   sessions   -> any other user:  new InvestorPortal((await sessions.as('investor2')).page)
 *   envConfig  -> active environment settings (name, isProduction, timeouts)
 */
type Fixtures = {
  envConfig: EnvironmentSettings;
  sessions: SessionManager;
  investor: InvestorPortal;
  employee: EmployeePortal;
};

export const test = base.extend<Fixtures>({
  envConfig: async ({}, use) => {
    await use(getEnvironment());
  },

  sessions: async ({ browser }, use, testInfo) => {
    const manager = new SessionManager(browser, testInfo);
    await use(manager);
    await manager.dispose();
  },

  investor: async ({ sessions }, use) => {
    const session = await sessions.as(DEFAULT_USERS.investor);
    await use(new InvestorPortal(session.page));
  },

  employee: async ({ sessions }, use) => {
    const session = await sessions.as(DEFAULT_USERS.employee);
    await use(new EmployeePortal(session.page));
  },
});

export { expect };

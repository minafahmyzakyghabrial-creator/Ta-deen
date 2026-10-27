import { test as base, expect } from '@playwright/test';
import { DEFAULT_USERS, EnvironmentSettings, getEnvironment, UserKey } from '@config/index';
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
 *   investor      -> the investor (investorUser), logged in, own isolated context
 *   employee      -> the employee (employeeUser), logged in, own isolated context
 *   investorUser  -> option: which investor `investor` logs in as (default investor1)
 *   employeeUser  -> option: which employee `employee` logs in as (default employee1)
 *                    choose per spec / describe:  test.use({ investorUser: 'investor2' })
 *   sessions      -> any other user:  new InvestorPortal((await sessions.as('investor2')).page)
 *   envConfig     -> active environment settings (name, isProduction, timeouts)
 */
type Options = {
  investorUser: UserKey;
  employeeUser: UserKey;
};

type Fixtures = {
  envConfig: EnvironmentSettings;
  sessions: SessionManager;
  investor: InvestorPortal;
  employee: EmployeePortal;
};

export const test = base.extend<Options & Fixtures>({
  investorUser: [DEFAULT_USERS.investor, { option: true }],
  employeeUser: [DEFAULT_USERS.employee, { option: true }],

  envConfig: async ({}, use) => {
    await use(getEnvironment());
  },

  sessions: async ({ browser }, use, testInfo) => {
    const manager = new SessionManager(browser, testInfo);
    await use(manager);
    await manager.dispose();
  },

  investor: async ({ sessions, investorUser }, use) => {
    const session = await sessions.as(investorUser);
    await use(new InvestorPortal(session.page));
  },

  employee: async ({ sessions, employeeUser }, use) => {
    const session = await sessions.as(employeeUser);
    await use(new EmployeePortal(session.page));
  },
});

export { expect };

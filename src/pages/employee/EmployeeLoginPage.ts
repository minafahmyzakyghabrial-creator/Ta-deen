import { Page } from '@playwright/test';
import { LoginPage, LoginSelectors } from '../LoginPage';

/**
 * Employee (LDAP) login screen — <ENV>_EMPLOYEE_URL (UAT: /MiningPortal/Login_LDAP).
 *
 * Selectors VERIFIED on UAT (2026-10-19):
 *   username  <input id="Input_UsernameVal">   (LDAP username, not email)
 *   password  <input id="Input_PasswordVal" type="password">
 *   submit    the form's single <button type="submit"> ("تسجيل الدخول")
 *
 * Note the IDs differ from the investor screen (…Val vs …Val2) — a concrete reason the
 * framework keeps one login page object / strategy per portal.
 */
export class EmployeeLoginPage extends LoginPage {
  protected readonly selectors: LoginSelectors = {
    username: '#Input_UsernameVal',
    password: '#Input_PasswordVal',
    submit: 'button[type="submit"]',
  };

  constructor(page: Page) {
    super(page, 'employee');
  }
}

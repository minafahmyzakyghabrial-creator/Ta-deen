import { Page } from '@playwright/test';
import { LoginPage, LoginSelectors } from '../LoginPage';

/**
 * Investor login screen — <ENV>_INVESTOR_URL (UAT: /MiningPortal/Login).
 *
 * Selectors VERIFIED on UAT (2026-10-19):
 *   username  <input id="Input_UsernameVal2">  (label "اسم المستخدم", email placeholder)
 *   password  <input id="Input_PasswordVal2" type="password">
 *   submit    the form's single <button type="submit"> ("تسجيل الدخول")
 *
 * These IDs are OutSystems widget names (no block prefix such as "b3-"), so they are
 * stable unless a developer renames the widget. Preferred long-term: data-testid attributes.
 */
export class InvestorLoginPage extends LoginPage {
  protected readonly selectors: LoginSelectors = {
    username: '#Input_UsernameVal2',
    password: '#Input_PasswordVal2',
    submit: 'button[type="submit"]',
  };

  constructor(page: Page) {
    super(page, 'investor');
  }
}

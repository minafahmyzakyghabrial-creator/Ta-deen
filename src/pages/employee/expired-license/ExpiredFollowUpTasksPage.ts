import { expect } from '@playwright/test';
import { TaskManagementPage } from '../TaskManagementPage';
import { ExpiredFollowUpList } from './ExpiredFollowUpList';
import { ExpiredRequestDetailsPage } from './ExpiredRequestDetailsPage';

/**
 * UC-003 — Task Management → tab "متابعة رخص منتهية" (/SharedServices_TaskManagement/TaskManagement).
 *
 * VERIFIED on TEST (2026-11-15):
 *   - the tab is a button next to "جميع الرخص"; a user only sees tasks that are unassigned or assigned to them;
 *   - menu: "إسناد إلى" assigns the task to the CURRENT user immediately (no لي/آخرون dialog), afterwards
 *     "إلغاء الإسناد" / "عرض" / "الرد على الطلب" / "الرد على الطلب (للقراءة فقط)";
 *   - "الرد على الطلب" opens /Licenses_Monitoring_Expired/RequestDetails?…&In_ProcessType=<n> in a new tab.
 */
export class ExpiredFollowUpTasksPage extends ExpiredFollowUpList {
  async open(): Promise<void> {
    await new TaskManagementPage(this.page).open();
    await this.page.locator('[role="tab"], button').filter({ visible: true }).filter({ hasText: /^\s*متابعة رخص منتهية\s*$/ }).first().click();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await expect(this.panel).toBeVisible({ timeout: 150_000 });
    await this.page.waitForTimeout(3_000);
  }

  /**
   * TEST 2026-11-17: "إسناد إلى" now opens a dialog "مسند إلى" with "لي" / "آخرون" + "حفظ" / "إلغاء" (UC-003.1).
   * Picks "لي" and saves; does nothing when the old direct assignment is in place. Returns true when the dialog was shown.
   */
  async confirmAssignToMe(): Promise<boolean> {
    const dialog = this.page.locator('[role="dialog"], .popup-dialog, .osui-popup, [class*="modal"]').filter({ visible: true }).filter({ hasText: 'مسند إلى' }).last();
    if (!(await dialog.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true, () => false))) return false;
    await dialog.locator('label', { hasText: /^\s*لي\s*$/ }).first().click();
    await this.page.waitForTimeout(800);
    await dialog.getByRole('button', { name: 'حفظ', exact: true }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
    return true;
  }

  /** Assigns the task to the logged-in user when it is unassigned. Returns the menu before and after. */
  async assignToMe(requestNumber: string): Promise<{ before: string[]; after: string[] }> {
    const before = await this.menu(requestNumber).actions();
    if (before.includes('إسناد إلى')) {
      await this.menu(requestNumber).click('إسناد إلى');
      await this.confirmAssignToMe();
      await this.page.waitForLoadState('networkidle').catch(() => {});
      await this.page.waitForTimeout(6_000);
      await this.search({ request: requestNumber });
    }
    await this.page.keyboard.press('Escape');
    const after = await this.menu(requestNumber).actions();
    await this.page.keyboard.press('Escape');
    return { before, after };
  }

  async respond(requestNumber: string, task?: string): Promise<ExpiredRequestDetailsPage> {
    const details = await this.openInNewTab(requestNumber, 'الرد على الطلب', task);
    await details.openRespondTab();
    return details;
  }

  /**
   * Makes the task of `requestNumber` (the row whose text contains `task`, when given) respondable by the logged-in
   * user: assigns it when it is unassigned. Returns false when this user can neither respond nor assign.
   */
  async take(requestNumber: string, task?: string): Promise<boolean> {
    await this.search({ request: requestNumber });
    if (!(await this.taskRow(requestNumber, task).count())) return false;
    let actions = await this.menu(requestNumber, task).actions();
    await this.page.keyboard.press('Escape');
    if (actions.includes('الرد على الطلب')) return true;
    if (!actions.includes('إسناد إلى')) return false;
    await this.menu(requestNumber, task).click('إسناد إلى');
    await this.confirmAssignToMe();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.waitForTimeout(6_000);
    await this.search({ request: requestNumber });
    actions = await this.menu(requestNumber, task).actions();
    await this.page.keyboard.press('Escape');
    return actions.includes('الرد على الطلب');
  }

  async view(requestNumber: string): Promise<ExpiredRequestDetailsPage> {
    return this.openInNewTab(requestNumber, 'عرض');
  }
}

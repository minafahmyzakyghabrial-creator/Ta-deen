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

  /** Assigns the task to the logged-in user when it is unassigned. Returns the menu before and after. */
  async assignToMe(requestNumber: string): Promise<{ before: string[]; after: string[] }> {
    const before = await this.menu(requestNumber).actions();
    if (before.includes('إسناد إلى')) {
      await this.menu(requestNumber).click('إسناد إلى');
      await this.page.waitForLoadState('networkidle').catch(() => {});
      await this.page.waitForTimeout(6_000);
      await this.search({ request: requestNumber });
    }
    await this.page.keyboard.press('Escape');
    const after = await this.menu(requestNumber).actions();
    await this.page.keyboard.press('Escape');
    return { before, after };
  }

  async respond(requestNumber: string): Promise<ExpiredRequestDetailsPage> {
    const details = await this.openInNewTab(requestNumber, 'الرد على الطلب');
    await details.openRespondTab();
    return details;
  }

  async view(requestNumber: string): Promise<ExpiredRequestDetailsPage> {
    return this.openInNewTab(requestNumber, 'عرض');
  }
}

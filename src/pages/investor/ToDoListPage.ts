import { expect, Locator, Page } from '@playwright/test';
import { RowActionMenu } from '@components/RowActionMenu';
import { BasePage } from '../BasePage';

export interface InvestorTask {
  readonly requestNumber: string;
  readonly taskType: string;
}

/**
 * Investor "قائمة المهام" (To-Do list) — /MiningPortal/ToDoList.
 *
 * VERIFIED on TEST (2026-10-26, request 76103):
 *   - side-menu entry "قائمة المهام"; search = spinbutton "اكتب رقم الطلب" + button "بحث";
 *   - columns: الرقم التعريفي للطلب · نوع الطلب · نوع المهمة · تاريخ المهمة · … · الاجراء;
 *   - after GIS approval the task is "الدفع" (payment); its row menu has only "تعيين",
 *     which navigates this tab to the payment page (SharedServices_Payments/DoPayment).
 */
export class ToDoListPage extends BasePage {
  constructor(page: Page) {
    super(page, 'investor');
  }

  private get searchInput(): Locator {
    return this.page.getByRole('spinbutton', { name: 'اكتب رقم الطلب' });
  }

  async open(): Promise<void> {
    await this.page.getByRole('link', { name: /قائمة المهام\s*$/ }).first().click();
    await this.page.waitForURL(/\/ToDoList(\?|$)/, { timeout: 60_000 });
    await expect(this.searchInput).toBeVisible({ timeout: 60_000 });
  }

  private rows(requestNumber: string): Locator {
    return this.page
      .locator('table')
      .filter({ visible: true })
      .first()
      .locator('tbody tr')
      .filter({
        has: this.page.locator('td[data-header="الرقم التعريفي للطلب"]', { hasText: new RegExp(`^\\s*${requestNumber}\\s*$`) }),
      });
  }

  async search(requestNumber: string): Promise<InvestorTask[]> {
    await this.searchInput.fill(requestNumber);
    const activity = this.waitForServer();
    await this.page.getByRole('button', { name: 'بحث', exact: true }).click();
    await activity.catch(() => undefined);
    const rows = this.rows(requestNumber);
    const tasks: InvestorTask[] = [];
    for (let i = 0; i < (await rows.count()); i++) {
      const taskType = (await rows.nth(i).locator('td[data-header="نوع المهمة"]').innerText()).trim();
      tasks.push({ requestNumber, taskType });
    }
    return tasks;
  }

  /** Opens a task through its row menu (e.g. "تعيين" for the payment task). */
  /** Opens a task with the first action its menu offers among "تعيين" (VERIFIED for الدفع) and the respond actions. */
  async openTask(task: InvestorTask, actions = ['تعيين', 'الرد على الطلب', 'الرد']): Promise<void> {
    const row = this.rows(task.requestNumber).filter({ has: this.page.locator('td[data-header="نوع المهمة"]', { hasText: task.taskType }) });
    const menu = new RowActionMenu(row.first().locator('td').last());
    const available = await menu.actions();
    const action = actions.find((a) => available.includes(a));
    if (!action) throw new Error(`To-Do task "${task.taskType}" offers no known open action. Available: ${available.join(' | ') || 'none'}.`);
    await menu.click(action);
  }
}

import { expect, Locator, Page } from '@playwright/test';
import { RowActionMenu } from '@components/RowActionMenu';
import { BasePage } from '../BasePage';
import { TaskResponsePage } from './TaskResponsePage';

export interface EmployeeTask {
  readonly requestNumber: string;
  readonly taskType: string;
  readonly status: string;
  readonly assignee: string;
}

/** Task statuses that still need work (VERIFIED on TEST): جديد = new, قيد التنفيذ = in progress. */
export const OPEN_TASK_STATUSES = ['جديد', 'قيد التنفيذ'];

/**
 * Employee "إدارة المهام" (Task Management) — /SharedServices_TaskManagement/TaskManagement.
 *
 * VERIFIED on TEST (2026-10-26, request 76103):
 *   - reached from the side menu entry "إدارة المهام";
 *   - one tab per area (الرخص, المخالفات, …), each with its own table — the Licenses tab's
 *     table is the first one, and all tables are in the DOM at once;
 *   - search: the "البحث(n)" toggle reveals a panel with placeholder "رقم الطلب" + button
 *     "البحث" (server action License_Task_List/DataActionGetData);
 *   - cells carry data-header: رقم الطلب, نوع المهمة (with a trailing space), الحالة, مسند الى, الإجراء;
 *   - row menu: إسناد إلى (assign) → dialog radios "لي" / "آخرون" + "حفظ"
 *     (ActionAssign_Self_On_Click, toast "تم إسناد المهمة بنجاح"); once assigned it offers
 *     إلغاء الإسناد; "الرد على الطلب" (respond) is a link only when assigned and opens a NEW TAB.
 */
export class TaskManagementPage extends BasePage {
  constructor(page: Page) {
    super(page, 'employee');
  }

  private get table(): Locator {
    return this.page.locator('table').first();
  }

  private get searchInput(): Locator {
    return this.page.getByPlaceholder('رقم الطلب', { exact: true }).first();
  }

  async open(): Promise<void> {
    if (!/\/TaskManagement(\?|$)/.test(this.page.url())) {
      await this.page.getByText('إدارة المهام', { exact: true }).first().click();
      await this.page.waitForURL(/\/TaskManagement(\?|$)/, { timeout: 60_000 });
    }
    await expect(this.table).toBeAttached({ timeout: 60_000 });
  }

  rows(requestNumber: string): Locator {
    return this.table.locator('tbody tr').filter({
      has: this.page.locator('td[data-header="رقم الطلب"]', { hasText: new RegExp(`^\\s*${requestNumber}\\s*$`) }),
    });
  }

  /** Searches the Licenses tab by exact request number and returns its tasks. */
  async search(requestNumber: string): Promise<EmployeeTask[]> {
    await this.open();
    if (!(await this.searchInput.isVisible())) await this.page.getByText(/^البحث\(\d+\)/).first().click();
    await this.searchInput.fill(requestNumber);
    await this.clickAndWaitForServer(this.page.getByRole('button', { name: 'البحث', exact: true }).filter({ visible: true }).first(), {
      action: 'License_Task_List/DataActionGetData',
    });
    const rows = this.rows(requestNumber);
    const tasks: EmployeeTask[] = [];
    for (let i = 0; i < (await rows.count()); i++) tasks.push(await this.read(rows.nth(i), requestNumber));
    return tasks;
  }

  private async read(row: Locator, requestNumber: string): Promise<EmployeeTask> {
    const cell = async (header: string) => (await row.locator(`td[data-header^="${header}"]`).first().innerText()).trim();
    return { requestNumber, taskType: await cell('نوع المهمة'), status: await cell('الحالة'), assignee: await cell('مسند الى') };
  }

  private row(task: EmployeeTask): Locator {
    return this.rows(task.requestNumber).filter({
      has: this.page.locator('td[data-header^="نوع المهمة"]', { hasText: task.taskType }),
    });
  }

  private menu(task: EmployeeTask): RowActionMenu {
    return new RowActionMenu(this.row(task).first().locator('td[data-header="الإجراء"]'));
  }

  /** Assigns the task to the logged-in employee unless it is already assigned. Returns the assignee. */
  async assignToSelf(task: EmployeeTask): Promise<'assigned' | 'already assigned'> {
    const menu = this.menu(task);
    if (!(await menu.has('إسناد إلى'))) return 'already assigned';
    await menu.click('إسناد إلى');
    const dialog = this.page.getByRole('dialog').last();
    await expect(dialog).toBeVisible();
    await dialog.locator('label').filter({ hasText: /^\s*لي\s*$/ }).first().click();
    await expect(dialog.getByRole('radio', { name: 'لي' })).toBeChecked();
    await this.clickAndWaitForServer(dialog.getByRole('button', { name: 'حفظ', exact: true }), { action: 'ActionAssign_Self' });
    await expect(this.row(task).first().locator('td[data-header="الحالة"]')).toHaveText(/قيد التنفيذ/);
    return 'assigned';
  }

  /** "الرد على الطلب" — opens the task's response page in a new tab. */
  async openResponse(task: EmployeeTask): Promise<TaskResponsePage> {
    const popup = this.page.context().waitForEvent('page', { timeout: 60_000 });
    await this.menu(task).click('الرد على الطلب');
    const page = await popup;
    const response = new TaskResponsePage(page);
    await response.expectLoaded(task.requestNumber);
    return response;
  }
}

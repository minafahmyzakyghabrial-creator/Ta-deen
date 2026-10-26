import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from '../BasePage';

export class RequestNotFoundError extends Error {
  constructor(requestNumber: string, detail = '') {
    super(`Request "${requestNumber}" was not found in the investor's Requests list.${detail ? ' ' + detail : ''}`);
    this.name = 'RequestNotFoundError';
  }
}

/**
 * Investor "الطلبات" (Requests) list — /MiningPortal/Requests.
 *
 * VERIFIED on TEST (2026-10-26):
 *   - the screen holds TWO tables (requests + export-permit requests, the second in a hidden
 *     tab) and two search boxes, so every locator is restricted to visible elements;
 *   - search = placeholder "اكتب رقم الطلب" + button "بحث" → server action DataActionGetLRData;
 *   - cells carry `data-header="<column title>"` (e.g. "رقم الطلب", "الحالة", "الإجراء");
 *   - row actions sit behind the "⋯" icon (.esnad-dots) in a tooltip balloon whose id is the
 *     icon wrapper's aria-describedby; a Draft offers تعديل (edit) / حذف (delete) / عرض (view).
 */
export class RequestsPage extends BasePage {
  constructor(page: Page) {
    super(page, 'investor');
  }

  get searchInput(): Locator {
    return this.page.getByPlaceholder('اكتب رقم الطلب').filter({ visible: true });
  }

  get searchButton(): Locator {
    return this.page.getByRole('button', { name: 'بحث', exact: true }).filter({ visible: true });
  }

  get table(): Locator {
    return this.page.locator('table').filter({ visible: true }).first();
  }

  row(requestNumber: string): Locator {
    return this.table.locator('tbody tr').filter({
      has: this.page.locator('td[data-header="رقم الطلب"]', { hasText: new RegExp(`^\\s*${requestNumber}\\s*$`) }),
    });
  }

  /** The side-menu entry "الطلبات" (the icon glyph is part of its name, hence the regex). */
  get menuLink(): Locator {
    return this.page.getByRole('link', { name: /الطلبات\s*$/ }).first();
  }

  /**
   * Opens the list through the side menu. Going to /Requests directly is NOT equivalent:
   * on TEST it renders "الطلبات(0)" — the menu adds the required query (?Status_Filter=0).
   */
  async open(): Promise<void> {
    await this.menuLink.click();
    await this.page.waitForURL(/\/Requests(\?|$)/);
    // During a screen transition the old and new screens coexist (two search boxes); wait it out.
    await expect(this.searchInput).toHaveCount(1, { timeout: 30_000 });
    await expect(this.searchInput).toBeVisible();
  }

  /** Searches by the exact request number and returns its row; throws if it is not listed. */
  async find(requestNumber: string): Promise<Locator> {
    await this.searchInput.fill(requestNumber);
    await this.clickAndWaitForServer(this.searchButton, { action: 'DataActionGetLRData' });
    const row = this.row(requestNumber);
    const found = await row
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!found) {
      const shown = await this.table.locator('td[data-header="رقم الطلب"]').allInnerTexts();
      throw new RequestNotFoundError(
        requestNumber,
        shown.length ? `The search returned: ${shown.map((s) => s.trim()).join(', ')}.` : 'The search returned no rows.',
      );
    }
    await expect(row).toHaveCount(1);
    return row;
  }

  async cell(requestNumber: string, header: string): Promise<string> {
    return (await this.row(requestNumber).locator(`td[data-header="${header}"]`).innerText()).trim();
  }

  /** The first row of the unfiltered list — the list is newest-first (VERIFIED on TEST). */
  async latestRequest(): Promise<{ number: string; type: string; status: string }> {
    const row = this.table.locator('tbody tr').first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    const cell = async (header: string) => (await row.locator(`td[data-header="${header}"]`).innerText()).trim();
    return { number: await cell('رقم الطلب'), type: await cell('نوع الطلب'), status: await cell('الحالة') };
  }

  /**
   * "طلب جديد" → dialog "إنشاء طلب جديد" → choose "نوع الخدمة" → "التالي".
   * VERIFIED on TEST: opens /Licenses_Explorations/Exploration_License?IsView=false&LicenseTypeId=2
   * for "إصدار رخصة كشف" (no request number until step 1 is saved).
   */
  async startNewRequest(serviceType: string): Promise<void> {
    await this.page.getByRole('button', { name: /طلب جديد/ }).filter({ visible: true }).first().click();
    const dialog = this.page.getByRole('dialog').last();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('combobox').selectOption({ label: serviceType });
    await dialog.getByRole('button', { name: 'التالي', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });
  }

  /** Opens the row's "⋯" menu and clicks an action (e.g. "تعديل"). */
  async rowAction(requestNumber: string, action: string): Promise<void> {
    const actionsCell = this.row(requestNumber).locator('td[data-header="الإجراء"]');
    const menuId = await actionsCell.locator('[aria-describedby]').first().getAttribute('aria-describedby');
    if (!menuId) throw new Error(`Request ${requestNumber}: the actions menu could not be identified.`);
    const menu = this.page.locator(`[id="${menuId}"]`);
    if (!(await menu.isVisible())) await actionsCell.locator('.esnad-dots').click();
    await expect(menu).toBeVisible();
    const link = menu.getByRole('link', { name: action, exact: true });
    if ((await link.count()) === 0) {
      const available = (await menu.getByRole('link').allInnerTexts()).map((t) => t.trim());
      const status = await this.cell(requestNumber, 'الحالة');
      throw new Error(
        `Request ${requestNumber} (status "${status}") has no "${action}" action. Available: ${available.join(' | ') || 'none'}.`,
      );
    }
    await link.click();
  }

}

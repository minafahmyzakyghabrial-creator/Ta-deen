import { expect, Locator, Page } from '@playwright/test';
import { RowActionMenu } from '@components/RowActionMenu';
import { BasePage } from '../../BasePage';
import { ExpiredRequestDetailsPage } from './ExpiredRequestDetailsPage';

/** One row of a "متابعة رخص منتهية" table, read by column header (cells carry data-header). */
export type FollowUpRow = Record<string, string> & { readonly 'رقم الطلب': string };

/**
 * Shared behaviour of the two "متابعة رخص منتهية" tabs (Request Management and Task Management).
 *
 * VERIFIED on TEST (2026-11-15):
 *   - the tab's panel is the visible tabpanel whose table has the header "المهلة النظامية المتبقية";
 *   - filter toggle "تصفية(n)" (clicking it again CLOSES the panel), inputs id$="Input_RequestNumber" /
 *     id^=…"Input_LicenseNumber", button "البحث", reset "إعادة تهيئة", export "تصدير";
 *   - no-data text "لا توجد نتائج لعرضها";
 *   - row ⋮ = OutSystems tooltip menu (RowActionMenu).
 */
export abstract class ExpiredFollowUpList extends BasePage {
  constructor(page: Page) {
    super(page, 'employee');
  }

  abstract open(): Promise<void>;

  get panel(): Locator {
    return this.page.getByRole('tabpanel').filter({ visible: true })
      .filter({ has: this.page.locator('th', { hasText: 'المهلة النظامية المتبقية' }) }).first();
  }

  get rows(): Locator {
    return this.panel.locator('table tbody tr').filter({ visible: true });
  }

  get filterToggle(): Locator {
    return this.panel.getByText(/تصفية\s*\(\d+\)/).first();
  }

  get requestNumberInput(): Locator {
    return this.page.locator('input[id$="Input_RequestNumber"]').filter({ visible: true }).first();
  }

  get licenceNumberInput(): Locator {
    return this.page.locator('input[id*="Input_LicenseNumber"]').filter({ visible: true }).first();
  }

  get searchButton(): Locator {
    return this.page.getByRole('button', { name: 'البحث', exact: true }).filter({ visible: true }).first();
  }

  get exportButton(): Locator {
    return this.panel.getByRole('button', { name: /تصدير/ }).filter({ visible: true }).first();
  }

  async openFilter(): Promise<void> {
    if (!(await this.requestNumberInput.isVisible().catch(() => false))) await this.filterToggle.click();
    await expect(this.requestNumberInput).toBeVisible();
  }

  /** Filters by request and/or licence number and returns the rows. */
  async search(by: { request?: string; licence?: string }): Promise<FollowUpRow[]> {
    await this.openFilter();
    await this.requestNumberInput.fill(by.request ?? '');
    await this.licenceNumberInput.fill(by.licence ?? '');
    await this.searchButton.click();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.waitForTimeout(6_000);
    return this.readRows();
  }

  async readRows(): Promise<FollowUpRow[]> {
    const out: FollowUpRow[] = [];
    for (const row of await this.rows.all()) {
      const cells = await row.locator('td[data-header]').evaluateAll((tds) =>
        tds.map((td) => [(td.getAttribute('data-header') ?? '').trim(), (td.textContent ?? '').replace(/\s+/g, ' ').trim()]));
      out.push(Object.fromEntries(cells) as FollowUpRow);
    }
    return out;
  }

  row(requestNumber: string): Locator {
    return this.rows.filter({ has: this.page.locator('td[data-header^="رقم الطلب"]', { hasText: new RegExp(`^\\s*${requestNumber}\\s*$`) }) });
  }

  cell(requestNumber: string, header: string): Locator {
    return this.row(requestNumber).first().locator(`td[data-header^="${header}"]`).first();
  }

  menu(requestNumber: string): RowActionMenu {
    return new RowActionMenu(this.row(requestNumber).first().locator('td').last());
  }

  /** Clicks a menu action that opens the details page in a new tab. */
  protected async openInNewTab(requestNumber: string, action: string): Promise<ExpiredRequestDetailsPage> {
    const popup = this.page.context().waitForEvent('page', { timeout: 120_000 });
    await this.menu(requestNumber).click(action);
    const details = new ExpiredRequestDetailsPage(await popup);
    await details.waitLoaded();
    return details;
  }

  /** Values of a virtual-select dropdown of the filter (all options, not only the rendered ones). */
  async dropdownOptions(placeholder: RegExp): Promise<string[]> {
    await this.openFilter();
    const toggle = this.page.locator('.vscomp-toggle-button').filter({ visible: true }).filter({ hasText: placeholder }).first();
    return toggle.evaluate((e) => {
      const host = e.closest('.vscomp-ele') as unknown as { virtualSelect?: { options: { label: string }[] } } | null;
      return (host?.virtualSelect?.options ?? []).map((o) => o.label.trim());
    });
  }

  /** Clicks "تصدير" and returns the suggested file name of the download. */
  async exportFileName(): Promise<string> {
    const download = this.page.waitForEvent('download', { timeout: 120_000 });
    await this.exportButton.click();
    return (await download).suggestedFilename();
  }
}

import { expect, Locator, Page } from '@playwright/test';
import { escapeRegExp } from '@utils/field-helper';
import { trackServerActivity } from '@utils/os-waits';
import { BasePage } from '../BasePage';

export interface LicenseRow {
  readonly number: string;
  readonly type: string;
  readonly status: string;
}

/**
 * Investor "الرخص" (licence list) — /MiningPortal/Licenses, opened from the side menu.
 *
 * VERIFIED on TEST (2026-10-30, investors 2 and 3): search box placeholder "اكتب رقم الرخصة" + button "بحث";
 * columns رقم الرخصة · نوع الرخصة · فئة الرخصة · تاريخ إصدار الرخصة · تاريخ انتهاء الرخصة · حالة الرخصة · إجراءات.
 * After transfer 76352, licence 20260311313 showed "محولة" (transferred) for the transferor and "فعال" (active)
 * for the transferee. Columns are read by their header position, so the lookup does not depend on cell attributes.
 */
export class LicensesPage extends BasePage {
  constructor(page: Page) {
    super(page, 'investor');
  }

  private get searchInput(): Locator {
    return this.page.getByPlaceholder('اكتب رقم الرخصة').filter({ visible: true });
  }

  private get table(): Locator {
    return this.page.locator('table').filter({ visible: true }).first();
  }

  async open(): Promise<void> {
    await this.page.getByRole('link', { name: /الرخص\s*$/ }).first().click();
    await this.page.waitForURL(/\/Licenses(\?|$)/, { timeout: 60_000 });
    await expect(this.searchInput).toBeVisible({ timeout: 60_000 });
  }

  private async column(header: string): Promise<number> {
    const headers = (await this.table.locator('th').allInnerTexts()).map((h) => h.trim());
    const index = headers.indexOf(header);
    if (index < 0) throw new Error(`Licence list has no "${header}" column. Columns: ${headers.join(' | ')}`);
    return index;
  }

  /** Searches the exact licence number; undefined when the company's list does not contain it. */
  async find(licenseNumber: string): Promise<LicenseRow | undefined> {
    return (await this.findAll(licenseNumber))[0];
  }

  /**
   * Every row of the exact licence number. A company that owned the licence before, transferred it away and received
   * it back lists it more than once (one row per ownership).
   */
  async findAll(licenseNumber: string): Promise<LicenseRow[]> {
    await this.searchInput.fill(licenseNumber);
    const activity = trackServerActivity(this.page);
    await this.page.getByRole('button', { name: 'بحث', exact: true }).filter({ visible: true }).first().click();
    await activity.idle();
    const rows = this.table
      .locator('tbody tr')
      .filter({ has: this.page.locator('td', { hasText: new RegExp(`^\\s*${escapeRegExp(licenseNumber)}\\s*$`) }) });
    const found: LicenseRow[] = [];
    for (let i = 0; i < (await rows.count()); i++) {
      const cells = (await rows.nth(i).locator('td').allInnerTexts()).map((c) => c.trim());
      found.push({ number: licenseNumber, type: cells[await this.column('نوع الرخصة')], status: cells[await this.column('حالة الرخصة')] });
    }
    return found;
  }
}

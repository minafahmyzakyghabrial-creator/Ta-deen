import { expect, Locator, Page } from '@playwright/test';
import { trackServerActivity } from '@utils/os-waits';
import { BasePage } from '../../BasePage';

export interface FinancialGuarantee {
  /** Guarantee number typed in "رقم ضمان مالي آخر"; a unique one is generated when omitted. */
  readonly referenceNumber?: string;
  /** Issuing bank, exactly as the drop-down shows it. */
  readonly bank: string;
  readonly attachment: string;
}

/**
 * Investor To-Do task "الضمان المالي" of the public-projects licence
 * (/Licenses_PublicProjects/InvestorResponse?…&In_StepType=180). VERIFIED on TEST (2026-11-08, request 76900):
 *   - "رقم الضمان المالي" (Dropdown1) offers only "رقم ضمان مالي آخر", which reveals the guarantee number
 *     (Input_ReferenceNumber), the issuing bank (Dropdown2) and "استعلام";
 *   - "استعلام" calls the bank API (SendToBawatekAPI_BL) and FAILS on TEST — it is not needed: submit works without it;
 *   - attachment "الضمان المالي" (file input, ActionAddAttachment_V2), declaration Checkbox1;
 *   - "إرسال الرد" → ActionCreateFinancialGuarantee_BL {Is_Success:true} and back to the To-Do list.
 */
export class FinancialGuaranteePage extends BasePage {
  constructor(page: Page) {
    super(page, 'investor');
  }

  private field(id: string): Locator {
    return this.page.locator(`[id$="${id}"]`).filter({ visible: true }).first();
  }

  async expectLoaded(): Promise<void> {
    await this.page.waitForURL(/\/InvestorResponse\?/, { timeout: 120_000 });
    await expect(this.page.getByText('تسجيل بيانات الضمان المالي')).toBeVisible({ timeout: 120_000 });
    await expect(this.field('Dropdown1').locator('option', { hasText: 'رقم ضمان مالي آخر' })).toBeAttached({ timeout: 60_000 });
    await trackServerActivity(this.page).idle();
  }

  /** Fills and submits the guarantee. Returns the guarantee number used. */
  async submit(g: FinancialGuarantee): Promise<string> {
    const reference = g.referenceNumber ?? `GT${Date.now().toString().slice(-8)}`;
    await this.field('Dropdown1').selectOption({ label: 'رقم ضمان مالي آخر' });
    await expect(this.field('Input_ReferenceNumber')).toBeVisible({ timeout: 30_000 });
    await this.field('Input_ReferenceNumber').fill(reference);
    await this.field('Dropdown2').selectOption({ label: g.bank });

    const uploaded = this.page.waitForResponse((r) => r.url().includes('/ActionAddAttachment_V2'), { timeout: 120_000 });
    await this.page.locator('input[type=file]').first().setInputFiles(g.attachment);
    const { data } = await (await uploaded).json();
    if (!data?.Is_Success) throw new Error(`Financial guarantee attachment was not accepted: ${JSON.stringify(data)}`);

    const declaration = this.field('Checkbox1');
    if (!(await declaration.isChecked())) await declaration.check();

    const created = this.page.waitForResponse((r) => r.url().includes('/ActionCreateFinancialGuarantee_BL'), { timeout: 180_000 });
    const baseline = await this.feedback.count();
    await this.page.getByRole('button', { name: 'إرسال الرد', exact: true }).click();
    const result = await created.then((r) => r.json()).catch(async () => undefined);
    const response = result?.data?.Out_Response;
    if (!response?.Is_Success) {
      const shown = await this.feedback.textsSince(baseline);
      throw new Error(`Financial guarantee was not created: ${response?.Error_Message || shown.join(' | ') || 'no response'}`);
    }
    await this.page.waitForURL(/\/ToDoList(\?|$)/, { timeout: 120_000 });
    return reference;
  }
}

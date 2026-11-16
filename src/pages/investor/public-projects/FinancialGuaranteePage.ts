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
    await this.page.waitForURL(/\/InvestorResponse\?|\/InvestorReviewTaskDetails\?/, { timeout: 120_000 });
    await expect(this.page.getByText('تسجيل بيانات الضمان المالي')).toBeVisible({ timeout: 120_000 });
    await expect(this.field('Dropdown1').locator('option', { hasText: /رقم ضمان مالي آخر|أخرى/ }).first()).toBeAttached({ timeout: 60_000 });
    await trackServerActivity(this.page).idle();
  }

  /** Small mine licence variant (/Licenses_MSM/InvestorReviewTaskDetails?…&In_StepType=68, TEST 77270). */
  private get isSmallMine(): boolean {
    return /\/InvestorReviewTaskDetails\?/.test(this.page.url());
  }

  /** Fills and submits the guarantee. Returns the guarantee number used. */
  async submit(g: FinancialGuarantee): Promise<string> {
    if (this.isSmallMine) return this.submitSmallMine(g);
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

  /**
   * Small mine licence "الضمان المالي" (TEST 2026-11-15, request 77270): radios "ضمان بنكي كلي" / "ضمان بنكي جزئي"
   * (the amount Input_FGAmount is calculated and locked), "رقم الضمان المالي" (Dropdown1: an existing guarantee such as
   * "515" or "أخرى"); "أخرى" reveals "رقم ضمان مالي آخر" (Input_Other_Reference_Number) and the issuing bank (Dropdown2,
   * labels "RJHISARI - مصرف الراجحي"); then the "الضمان المالي" attachment and "إرسال الرد". "استعلام" is not used.
   */
  private async submitSmallMine(g: FinancialGuarantee): Promise<string> {
    const reference = g.referenceNumber ?? `GT${Date.now().toString().slice(-8)}`;
    const full = this.page.locator('input[id$="FullBankGuarantee-input"]');
    if (!(await full.isChecked())) {
      await this.page.locator('label[for$="FullBankGuarantee-input"]').click();
      await expect(full).toBeChecked();
    }
    let activity = trackServerActivity(this.page);
    await this.field('Dropdown1').selectOption({ label: 'أخرى' });
    await activity.idle();
    await expect(this.field('Input_Other_Reference_Number')).toBeVisible({ timeout: 30_000 });
    await this.field('Input_Other_Reference_Number').fill(reference);
    const bank = this.field('Dropdown2');
    const label = (await bank.locator('option').allInnerTexts()).map((t) => t.trim()).find((t) => t.includes(g.bank));
    if (!label) throw new Error(`Bank "${g.bank}" is not offered in "البنك المُصدر".`);
    await bank.selectOption({ label });

    const uploaded = this.page.waitForResponse((r) => r.url().includes('/ActionAddAttachment_V2'), { timeout: 120_000 });
    await this.page.locator('input[type=file]').first().setInputFiles(g.attachment);
    const { data } = await (await uploaded).json();
    if (!data?.Is_Success) throw new Error(`Financial guarantee attachment was not accepted: ${JSON.stringify(data)}`);
    for (const box of await this.page.getByRole('checkbox').filter({ visible: true }).all()) if (!(await box.isChecked())) await box.check();

    const baseline = await this.feedback.count();
    activity = trackServerActivity(this.page);
    await this.page.getByRole('button', { name: 'إرسال الرد', exact: true }).click();
    let errors: string[] = [];
    await expect
      .poll(async () => /\/ToDoList(\?|$)/.test(this.page.url()) || (errors = await this.feedback.textsSince(baseline)).some((t) => !/نجاح|بنجاح/.test(t)), {
        timeout: 180_000,
        intervals: [1_000],
        message: '"إرسال الرد" on the financial guarantee neither returned to the To-Do list nor showed an error',
      })
      .toBe(true);
    if (!/\/ToDoList(\?|$)/.test(this.page.url())) throw new Error(`Financial guarantee was not accepted: ${errors.join(' | ')}`);
    await activity.idle().catch(() => undefined);
    return reference;
  }
}

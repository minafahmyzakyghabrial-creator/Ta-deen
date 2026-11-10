import { expect, Locator, Page } from '@playwright/test';
import { pickDate } from '@utils/field-helper';
import { trackServerActivity } from '@utils/os-waits';
import { BasePage } from '../../BasePage';

/**
 * Investor To-Do task "التصريح البيئي" of the public-projects licence
 * (/Licenses_PublicProjects/InvestorResponse?…&In_StepType=157), opened after "مهمة المراجعة العامة".
 * VERIFIED on TEST (2026-11-08, request 76900):
 *   - "رقم التصريح البيئي" (first Input_TextVar) + "استعلام"; "إرسال" stays DISABLED until the inquiry ran;
 *   - the inquiry (Inquire_Environmental_Permit_BL) fails on TEST — toast "حدث خطأ فني أثناء الوصول إلى المركز الوطني
 *     للامتثال البيئي، يرجى ملء البيانات أدناه للمتابعة" — and reveals "بيانات التصريح البيئي" to fill by hand:
 *     رقم التصريح البيئي (Input_Permit_Request_Number), حالة التصريح البيئي (second Input_TextVar),
 *     تاريخ اصدار التصريح / تاريخ انتهاء التصريح (flatpickr); "إرسال" is then enabled;
 *   - attachment "التصريح البيئي" (file input, required).
 */
export class EnvironmentalPermitPage extends BasePage {
  constructor(page: Page) {
    super(page, 'investor');
  }

  private get textFields(): Locator {
    return this.page.locator('input[id$="Input_TextVar"]').filter({ visible: true });
  }

  async expectLoaded(): Promise<void> {
    await this.page.waitForURL(/\/InvestorResponse\?/, { timeout: 120_000 });
    await expect(this.page.getByText('رقم التصريح البيئي').first()).toBeVisible({ timeout: 120_000 });
    await trackServerActivity(this.page).idle();
  }

  /** Date pickers of the permit details, in page order (their hidden original inputs). */
  private async datePickers(): Promise<Locator[]> {
    const ids = await this.page
      .locator('input')
      .evaluateAll((els) => els.filter((e) => (e as HTMLInputElement & { _flatpickr?: unknown })._flatpickr && e.id).map((e) => e.id));
    return ids.map((id) => this.page.locator(`[id="${id}"]`));
  }

  /** Fills and submits the permit. Returns the permit number used. */
  async submit(attachment: string, permitNumber = `EP${Date.now().toString().slice(-8)}`): Promise<string> {
    const submit = this.page.getByRole('button', { name: 'إرسال', exact: true });
    await this.textFields.first().fill(permitNumber);
    const inquired = this.page.waitForResponse((r) => r.url().includes('/ActionInquire_Environmental_Permit_BL'), { timeout: 120_000 });
    await this.page.getByRole('button', { name: 'استعلام', exact: true }).click();
    const found = (await (await inquired).json())?.data?.Out_Result?.Is_Success === true;
    await trackServerActivity(this.page).idle();

    if (!found) {
      // The national environmental centre is unreachable on TEST — the details are typed in instead.
      await expect(this.page.getByText('بيانات التصريح البيئي')).toBeVisible({ timeout: 30_000 });
      const number = this.page.locator('input[id$="Input_Permit_Request_Number"]').filter({ visible: true }).first();
      if (await number.isVisible()) await number.fill(permitNumber);
      if ((await this.textFields.count()) > 1) await this.textFields.nth(1).fill('ساري');
      const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const now = new Date();
      const [issued, expires] = await this.datePickers();
      if (issued) await pickDate(issued, iso(new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 7))));
      if (expires) await pickDate(expires, iso(new Date(now.getFullYear() + 1, now.getMonth(), Math.min(now.getDate(), 28))));
    }

    const uploaded = this.page.waitForResponse((r) => /\/ActionAddAttachment/.test(r.url()), { timeout: 120_000 });
    await this.page.locator('input[type=file]').first().setInputFiles(attachment);
    const { data } = await (await uploaded).json();
    if (data && data.Is_Success === false) throw new Error(`Environmental permit attachment was not accepted: ${JSON.stringify(data)}`);
    await trackServerActivity(this.page).idle();

    await expect(submit, '"إرسال" of التصريح البيئي').toBeEnabled({ timeout: 30_000 });
    const baseline = await this.feedback.count();
    await submit.click();
    const left = await this.page.waitForURL(/\/ToDoList(\?|$)/, { timeout: 120_000 }).then(() => true, () => false);
    if (!left) {
      const shown = await this.feedback.textsSince(baseline);
      throw new Error(`Environmental permit was not submitted: ${shown.join(' | ') || 'the page stayed open with no message'}`);
    }
    return permitNumber;
  }
}

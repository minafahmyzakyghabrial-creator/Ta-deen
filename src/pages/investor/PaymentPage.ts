import { expect, Page } from '@playwright/test';
import { readNumber } from '@config/index';
import { trackServerActivity } from '@utils/os-waits';
import { BasePage } from '../BasePage';

export interface Bill {
  /** SADAD reference ("الرقم المرجعي لنظام سداد") — the bill account used by the payment notification. */
  readonly billId: string;
  readonly amount: number;
  readonly description: string;
}

/**
 * Investor payment page — /SharedServices_Payments/DoPayment?LicenseRequestPaymentsId=<n>.
 *
 * VERIFIED on TEST (2026-10-26, request 76103):
 *   "الرقم المرجعي لنظام سداد 202610265047" · "رسوم تقديم الرخصة 5000" ·
 *   checkbox "أقر بمعرفتي أن رسوم تقديم الطلب غير مستردة…" which reveals button "تأكيد".
 *   ⚠ The page states 7 days to pay, but TEST cancelled the request ~20 min after the payment
 *   task appeared ("لم يتم سداد رسوم تقديم الطلب") — run the payment straight away.
 */
export class PaymentPage extends BasePage {
  constructor(page: Page) {
    super(page, 'investor');
  }

  /**
   * The payment module can answer with OutSystems' error page ("_error.html" — "There was an error processing your
   * request", button "RELOAD"), seen on TEST on 2026-10-31 (request 76367). The page is then reloaded (up to twice)
   * by going back to the payment URL; a third failure is reported as it is. Each attempt waits
   * PAYMENT_PAGE_TIMEOUT_MS (default 2 minutes) — TEST was slow to render the page.
   */
  async expectLoaded(): Promise<void> {
    const timeout = readNumber('PAYMENT_PAGE_TIMEOUT_MS', 120_000);
    // The payment URL is reached first; the error page replaces it afterwards (VERIFIED on 76367).
    await this.page.waitForURL(/DoPayment\?|\/InvestorResponse\?/, { timeout });
    if (this.isInvestorResponse) return this.issueReference(timeout);
    const paymentUrl = this.page.url();
    const reference = this.page.getByText(/الرقم المرجعي لنظام سداد/).first();
    for (let attempt = 1; attempt <= 3; attempt++) {
      const shown = await reference
        .or(this.page.getByRole('button', { name: 'RELOAD' }))
        .first()
        .waitFor({ timeout })
        .then(async () => reference.isVisible(), () => false);
      if (shown) return;
      if (attempt === 3) break;
      console.warn(`[Payment] Payment page did not load (${this.page.url()}) — reloading, attempt ${attempt + 1}/3`);
      await this.page.goto(paymentUrl);
    }
    await expect(reference, `Payment page (${paymentUrl})`).toBeVisible({ timeout: 5_000 });
  }

  /** Public-projects fee task ("رسوم الطلب" → /Licenses_PublicProjects/InvestorResponse). */
  private get isInvestorResponse(): boolean {
    return /\/InvestorResponse\?/.test(this.page.url());
  }

  /**
   * Public-projects fee page (VERIFIED on TEST 2026-11-08, request 76900): it shows "رمز السداد للمدفوعات الحكومية #n" and
   * the fee, but the SADAD reference only after the acknowledgement is ticked and "إرسال الرد" pressed. The button
   * then spins for a long time, so the page is reopened until the reference shows. The task stays in the To-Do list
   * until the payment notification arrives; on a reopened task the reference is already there and nothing is resent.
   * Later payments ("دفع المقابل المالي" 300000, "دفع الايجار السطحي") have no "رمز السداد" line and a button named
   * "إرسال" — the page counts as loaded once its acknowledgement ("أقر بمعرفتي …") or the reference shows.
   */
  private async issueReference(timeout: number): Promise<void> {
    const url = this.page.url();
    const reference = this.page.getByText(/الرقم المرجعي لنظام سداد\s*\d/).first();
    const loaded = this.page.getByText(/أقر بمعرفتي/).or(reference).first();
    await expect(loaded).toBeVisible({ timeout });
    await trackServerActivity(this.page).idle();
    if (await reference.isVisible()) return;
    const submit = this.page.getByRole('button', { name: /^\s*إرسال( الرد)?\s*$/ }).filter({ visible: true }).first();
    for (const box of await this.page.getByRole('checkbox').filter({ visible: true }).all()) {
      if (!(await box.isChecked())) await box.check();
    }
    const applyAll = this.page.getByRole('button', { name: 'تطبيق على الكل', exact: true });
    if (await applyAll.isVisible()) await applyAll.click();
    await expect(submit).toBeEnabled({ timeout: 30_000 });
    await submit.click();
    for (let attempt = 1; attempt <= 6; attempt++) {
      if (await reference.waitFor({ timeout: 30_000 }).then(() => true, () => false)) return;
      await this.page.goto(url);
      await expect(loaded).toBeVisible({ timeout });
    }
    await expect(reference, `SADAD reference after "إرسال" (${url})`).toBeVisible({ timeout: 5_000 });
  }

  private parse(text: string): Bill | undefined {
    const id = text.match(/الرقم المرجعي لنظام سداد\s*(\d{6,})/)?.[1];
    const fee = text.match(/(رسوم[^\d]{0,60}?)\s*([\d,]+(?:\.\d+)?)/);
    const amount = fee ? Number(fee[2].replace(/,/g, '')) : 0;
    return id && amount > 0 ? { billId: id, amount, description: fee![1].trim() } : undefined;
  }

  /**
   * The labels render before the data: on TEST the page first shows an empty reference and
   * "رسوم تقديم الرخصة 0". Waits (bounded) until a real reference and a non-zero fee are shown.
   */
  async bill(timeout = 60_000): Promise<Bill> {
    const read = async () => (await this.page.locator('body').innerText()).replace(/\s+/g, ' ');
    let bill: Bill | undefined;
    await expect
      .poll(async () => (bill = this.parse(await read())) !== undefined, { timeout, intervals: [500, 1_000] })
      .toBe(true)
      .catch(() => undefined);
    if (!bill) throw new Error(`No SADAD bill reference with a fee appeared within ${timeout / 1000}s. Page text: "${(await read()).slice(0, 300)}"`);
    return bill;
  }

  /** Ticks the non-refundable-fee acknowledgement and presses "تأكيد". Returns new toasts. */
  /** Returns undefined when the page has no acknowledgement (possible on later payments). */
  async acknowledge(): Promise<string[] | undefined> {
    // Public projects: acknowledged together with "إرسال الرد" while the reference was issued.
    if (this.isInvestorResponse) return undefined;
    const box = this.page.getByRole('checkbox').filter({ visible: true }).first();
    if ((await box.count()) === 0) return undefined;
    if (!(await box.isChecked())) await box.check();
    const confirm = this.page.getByRole('button', { name: 'تأكيد', exact: true });
    await expect(confirm).toBeVisible();
    const baseline = await this.feedback.count();
    const activity = trackServerActivity(this.page);
    await confirm.click();
    await activity.idle();
    return this.feedback.textsSince(baseline);
  }
}

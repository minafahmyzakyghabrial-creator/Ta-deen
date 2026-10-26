import { expect, Page } from '@playwright/test';
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

  async expectLoaded(): Promise<void> {
    await this.page.waitForURL(/DoPayment\?/, { timeout: 60_000 });
    await expect(this.page.getByText(/الرقم المرجعي لنظام سداد/).first()).toBeVisible({ timeout: 60_000 });
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

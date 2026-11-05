import { expect, Page } from '@playwright/test';
import { trackServerActivity } from '@utils/os-waits';
import { BasePage } from '../../BasePage';
import { Bill } from '../PaymentPage';

export interface TransferBill extends Bill {
  /** "رمز السداد للمدفوعات الحكومية" (SADAD biller code). */
  readonly billerCode: string;
  /** True when this call issued the bill; false when the page already had one (resumed run). */
  readonly issuedNow: boolean;
}

/**
 * Transfer payment To-Do ("الدفع") — /Licenses_Exploration_Transfer/InvestorToDo?In_Request_Id=<n>&In_StepType=349.
 * Unlike the shared DoPayment page, the SADAD bill does not exist until the investor confirms.
 *
 * VERIFIED on TEST (2026-10-30, request 76352, transferor application fee):
 *   "رمز السداد للمدفوعات الحكومية #116" · "رسوم تحويل الرخصة 10000" · checkbox "أقر بمعرفتي أن رسوم الطلب غير مستردة…" ·
 *   "إرسال الرد" → ActionCreateBillAndChangeStatus_BL → dialog "تم إرسال فاتورة طلب تحويل رخصة الكشف بنجاح …
 *   رقم الطلب #76352 الرقم المرجعي لنظام سداد #202610305020". On load, DataActionGetPaymentData returns
 *   Out_Payment.BillNumber ("" until issued) — used to resume without issuing a second bill.
 */
export class TransferPaymentPage extends BasePage {
  constructor(
    page: Page,
    /** Body of DataActionGetPaymentData, captured by the caller while the page loaded. */
    private readonly paymentData: Promise<{ data?: { Out_Payment?: { BillNumber?: string }; Out_Fees?: string } } | undefined>,
  ) {
    super(page, 'investor');
  }

  /** Starts listening for the page's payment data — call BEFORE opening the To-Do task. */
  static capturePaymentData(page: Page) {
    return page
      .waitForResponse((r) => r.url().includes('/DataActionGetPaymentData'), { timeout: 120_000 })
      .then((r) => r.json())
      .catch(() => undefined);
  }

  static isTransferPaymentUrl(url: string): boolean {
    return /\/Licenses_Exploration_Transfer\/InvestorToDo\?/.test(url);
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page.getByText('رمز السداد للمدفوعات الحكومية').first()).toBeVisible({ timeout: 60_000 });
  }

  /** Issues the bill (acknowledge + "إرسال الرد"), or returns the one already issued. */
  async issueBill(): Promise<TransferBill> {
    const loaded = await this.paymentData;
    const text = (await this.page.locator('body').innerText()).replace(/\s+/g, ' ');
    const billerCode = text.match(/رمز السداد للمدفوعات الحكومية\s*#?\s*(\d+)/)?.[1] ?? '';
    const fee = text.match(/(رسوم[^\d#]{0,40}?)\s*([\d,]+)/);
    const amount = Number(fee?.[2]?.replace(/,/g, '') ?? loaded?.data?.Out_Fees ?? 0);
    const description = fee?.[1]?.trim() ?? 'رسوم';
    const existing = loaded?.data?.Out_Payment?.BillNumber;
    if (existing) return { billId: existing, amount, description, billerCode, issuedNow: false };

    const box = this.page.getByRole('checkbox').filter({ visible: true }).first();
    if (!(await box.isChecked())) await box.check();
    const submit = this.page.getByRole('button', { name: 'إرسال الرد', exact: true });
    await expect(submit).toBeEnabled();
    const activity = trackServerActivity(this.page);
    await submit.click();
    await activity.idle(1_000, 90_000);
    const dialog = this.page.getByRole('dialog').filter({ visible: true }).filter({ hasText: /الرقم المرجعي لنظام سداد/ });
    const errors = this.feedback.of('error').filter({ visible: true });
    await expect(dialog.or(errors).first()).toBeVisible({ timeout: 60_000 });
    if (await errors.count()) throw new Error(`Bill was not issued: ${(await errors.allInnerTexts()).join(' | ')}`);
    const billId = (await dialog.first().innerText()).match(/الرقم المرجعي لنظام سداد\s*#?\s*(\d{6,})/)?.[1];
    if (!billId) throw new Error('The payment confirmation shows no SADAD reference.');
    return { billId, amount, description, billerCode, issuedNow: true };
  }
}

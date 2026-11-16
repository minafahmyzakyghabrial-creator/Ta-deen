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
   * request", button "RELOAD"), seen on TEST on 2026-10-31 (request 76367) and three times in a row on 2026-11-12
   * (77182) when the reloads came seconds apart. So a failed load is retried PAYMENT_PAGE_ATTEMPTS times (default 6)
   * with a growing pause first (20 s, 40 s, 60 s…), alternating the page's own "RELOAD" with reopening the payment
   * URL. Each attempt waits PAYMENT_PAGE_TIMEOUT_MS (default 2 minutes) — TEST is slow to render the page.
   * Mind the short TEST payment deadline (~20 min): the whole budget stays well inside it.
   */
  async expectLoaded(): Promise<void> {
    const timeout = readNumber('PAYMENT_PAGE_TIMEOUT_MS', 120_000);
    const attempts = readNumber('PAYMENT_PAGE_ATTEMPTS', 6);
    // The payment URL is reached first; the error page replaces it afterwards (VERIFIED on 76367).
    await this.page.waitForURL(/DoPayment\?|\/InvestorResponse\?|\/InvestorReviewTaskDetails\?/, { timeout });
    if (this.isInvestorResponse) return this.issueReference(timeout);
    const paymentUrl = this.page.url();
    const reference = this.page.getByText(/الرقم المرجعي لنظام سداد/).first();
    const reload = this.page.getByRole('button', { name: 'RELOAD' }).or(this.page.getByText('RELOAD', { exact: true })).first();
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const shown = await reference
        .or(reload)
        .first()
        .waitFor({ timeout })
        .then(async () => reference.isVisible(), () => false);
      if (shown) return;
      if (attempt === attempts) break;
      const pause = 20_000 * attempt;
      console.warn(`[Payment] Payment page did not load (${this.page.url()}) — retrying in ${pause / 1000}s, attempt ${attempt + 1}/${attempts}`);
      await this.page.waitForTimeout(pause);
      if (attempt % 2 === 1 && (await reload.isVisible().catch(() => false))) await reload.click().catch(() => undefined);
      else await this.page.goto(paymentUrl);
    }
    await expect(reference, `Payment page (${paymentUrl})`).toBeVisible({ timeout: 5_000 });
  }

  /** Public-projects fee task ("رسوم الطلب" → /Licenses_PublicProjects/InvestorResponse). */
  private get isInvestorResponse(): boolean {
    // Small mine "دفع رسوم الرخصة" (/Licenses_MSM/InvestorReviewTaskDetails, TEST 77270) works the same way.
    return /\/InvestorResponse\?|\/InvestorReviewTaskDetails\?/.test(this.page.url());
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
    // Label and number can sit in separate elements, so the reference is looked for in the page text.
    const hasReference = async () => PaymentPage.REFERENCE.test((await this.page.locator('body').innerText()).replace(/\s+/g, ' '));
    const reference = {
      isVisible: hasReference,
      waitFor: ({ timeout: t }: { timeout: number }) => expect.poll(hasReference, { timeout: t, intervals: [2_000] }).toBe(true),
    };
    const loaded = this.page.getByText(/أقر بمعرفتي/).or(this.page.getByText(PaymentPage.REFERENCE)).first();
    await expect(loaded).toBeVisible({ timeout });
    await trackServerActivity(this.page).idle();
    if (await reference.isVisible()) return;
    // Small mine "دفع رسوم الرخصة" names the button "تأكيد" (TEST 77270).
    const submit = this.page.getByRole('button', { name: /^\s*(إرسال( الرد)?|تأكيد)\s*$/ }).filter({ visible: true }).first();
    for (const box of await this.page.getByRole('checkbox').filter({ visible: true }).all()) {
      if (!(await box.isChecked())) await box.check();
    }
    const applyAll = this.page.getByRole('button', { name: 'تطبيق على الكل', exact: true });
    if (await applyAll.isVisible()) await applyAll.click();
    await expect(submit).toBeEnabled({ timeout: 90_000 });
    await submit.click();
    for (let attempt = 1; attempt <= 6; attempt++) {
      if (await reference.waitFor({ timeout: 90_000 }).then(() => true, () => false)) return;
      await this.page.goto(url);
      await expect(loaded).toBeVisible({ timeout });
    }
    if (!(await reference.isVisible())) throw new Error(`No SADAD reference after "${await submit.innerText().catch(() => 'إرسال')}" (${url})`);
  }

  /** "الرقم المرجعي لنظام سداد 2026…" (payments) or "الرقم المرجعي 2026…" / "#2026…" (small mine). */
  private static readonly REFERENCE = /الرقم المرجعي(?: لنظام سداد)?\s*#?\s*\d{6,}/;

  private parse(text: string): Bill | undefined {
    const id = text.match(/الرقم المرجعي(?: لنظام سداد)?\s*#?\s*(\d{6,})/)?.[1];
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

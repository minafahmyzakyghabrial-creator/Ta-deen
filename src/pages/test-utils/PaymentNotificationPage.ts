import { expect, Page } from '@playwright/test';
import { ConfigError, getEnvName, getPortalUrls, readVar } from '@config/index';

export interface NotificationResult {
  readonly billId: string;
  readonly requestBody: string;
  readonly response: string;
}

/**
 * TEST-only payment notification utility — <host>/TadeenTest/CallPaymentNotification.
 *
 * VERIFIED on TEST (2026-10-26, read only): the textarea (#TextArea_TextVar) starts EMPTY; the
 * page TEXT shows the template body and says "Pls change serviceProviderID based on Env:
 * For Dev: 002 For QA: 003 For UAT: 004". The bill goes in pmtInfo.billAcct. Button
 * "Call Notification"; the result is printed after "Reponse :".
 *
 * The body is never invented: it is the page's own template with only billAcct, pmtAmt and
 * serviceProviderID replaced. PAYMENT_SERVICE_PROVIDER_ID overrides the provider id (default
 * 003 for TEST — unconfirmed, see README).
 */
export class PaymentNotificationPage {
  constructor(private readonly page: Page) {}

  static allowedOrThrow(): void {
    if (getEnvName() !== 'test') {
      throw new ConfigError(`The payment notification utility may only run on TEST (TEST_ENV is "${getEnvName()}").`);
    }
  }

  get url(): string {
    return new URL('/TadeenTest/CallPaymentNotification', getPortalUrls('investor').loginUrl).toString();
  }

  async open(): Promise<void> {
    PaymentNotificationPage.allowedOrThrow();
    await this.page.goto(this.url);
    await expect(this.page.getByRole('button', { name: 'Call Notification' })).toBeVisible({ timeout: 60_000 });
  }

  /** The template body printed on the page (the JSON after the instructions). */
  async template(): Promise<Record<string, unknown>> {
    const text = await this.page.locator('body').innerText();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('No JSON template found on the payment notification page.');
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  }

  async notify(billId: string, amount: number): Promise<NotificationResult> {
    const body = await this.template();
    const pmtInfo = body.pmtInfo as Record<string, unknown> | undefined;
    if (!pmtInfo || !('billAcct' in pmtInfo)) throw new Error('Template has no pmtInfo.billAcct — the utility page changed.');
    // Per the TEST team's procedure only the bill changes; everything else is the page's template.
    pmtInfo.billAcct = billId;
    const provider = readVar('PAYMENT_SERVICE_PROVIDER_ID');
    if (provider) body.serviceProviderID = provider;
    const templateAmount = Number(pmtInfo.pmtAmt);
    if (templateAmount !== amount) {
      console.warn(`[Payment] Template pmtAmt ${templateAmount} differs from the bill amount ${amount} — sent unchanged as instructed.`);
    }
    const requestBody = JSON.stringify(body);

    const responseArea = this.page.locator('body');
    const before = await responseArea.innerText();
    await this.page.locator('textarea').first().fill(requestBody);
    await this.page.getByRole('button', { name: 'Call Notification' }).click();
    await expect.poll(() => responseArea.innerText(), { timeout: 60_000, message: 'No response from Call Notification' }).not.toBe(before);
    const after = await responseArea.innerText();
    const response = after.slice(after.lastIndexOf('Reponse :') + 'Reponse :'.length).trim();
    return { billId, requestBody, response };
  }
}

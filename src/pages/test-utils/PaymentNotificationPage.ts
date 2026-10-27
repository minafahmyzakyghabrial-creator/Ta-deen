import { expect, Page } from '@playwright/test';
import { ConfigError, EnvName, envPrefix, getEnvName, getPortalUrls, readEnvList, readVar } from '@config/index';

export interface NotificationResult {
  readonly billId: string;
  readonly requestBody: string;
  readonly response: string;
}

/**
 * Payment notification utility — <host>/TadeenTest/CallPaymentNotification, on TEST and UAT only
 * (e.g. https://platform-uat.taadeen.dev/TadeenTest/CallPaymentNotification).
 *
 * VERIFIED on TEST (2026-10-26, read only): the textarea (#TextArea_TextVar) starts EMPTY; the
 * page TEXT shows the template body and says "Pls change serviceProviderID based on Env:
 * For Dev: 002 For QA: 003 For UAT: 004". The bill goes in pmtInfo.billAcct. Button
 * "Call Notification" posts to …/CallPaymentNotification/ActionBill_Req; the result is printed after
 * "Reponse :" and returned as data.Response.Status ("S000" = success).
 *
 * TRAP (UAT, 2026-10-27, bill 202610275023): the page's "UAT: 004" note is WRONG — 004 was refused with
 * "Failed thrown system error / 400 Bad Request"; the UAT template's own value 002 succeeded (S000).
 *
 * The body is never invented: it is the page's own template with only billAcct, pmtAmt and
 * serviceProviderID replaced.
 *
 * Configured in .env:
 *   PAYMENT_UTILITY_ENVS=test,uat          environments allowed to use the utility (default: test,uat; never prod)
 *   <ENV>_PAYMENT_SERVICE_PROVIDER_ID=…    provider id per environment, e.g. UAT_PAYMENT_SERVICE_PROVIDER_ID
 *   PAYMENT_SERVICE_PROVIDER_ID=…          fallback for every environment
 * Without any of them the template's own value is sent (verified on TEST and UAT).
 */
const DEFAULT_ENVS: readonly EnvName[] = ['test', 'uat'];

export class PaymentNotificationPage {
  constructor(private readonly page: Page) {}

  static allowedOrThrow(): void {
    const allowed = readEnvList('PAYMENT_UTILITY_ENVS', DEFAULT_ENVS);
    if (!allowed.includes(getEnvName())) {
      throw new ConfigError(
        `The payment notification utility may only run on ${allowed.join(', ') || '(none)'} (TEST_ENV is "${getEnvName()}"). ` +
          'Change PAYMENT_UTILITY_ENVS in .env to allow it.',
      );
    }
  }

  /** Provider id for the active environment, or undefined to keep the template's own value. */
  static serviceProviderId(env: EnvName = getEnvName()): string | undefined {
    return readVar(`${envPrefix(env)}_PAYMENT_SERVICE_PROVIDER_ID`) ?? readVar('PAYMENT_SERVICE_PROVIDER_ID');
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
    const provider = PaymentNotificationPage.serviceProviderId();
    if (provider) body.serviceProviderID = provider;
    const templateAmount = Number(pmtInfo.pmtAmt);
    if (templateAmount !== amount) {
      console.warn(`[Payment] Template pmtAmt ${templateAmount} differs from the bill amount ${amount} — sent unchanged as instructed.`);
    }
    const requestBody = JSON.stringify(body);

    const responseArea = this.page.locator('body');
    const before = await responseArea.innerText();
    await this.page.locator('textarea').first().fill(requestBody);
    const served = this.page.waitForResponse((r) => r.url().includes('/ActionBill_Req'), { timeout: 60_000 });
    await this.page.getByRole('button', { name: 'Call Notification' }).click();
    // The server's answer is authoritative; the page text can lag behind it (it was read as empty on TEST).
    const result = (await (await served).json())?.data?.Response as { Status?: string; Message?: string } | undefined;
    await expect.poll(() => responseArea.innerText(), { timeout: 60_000, message: 'No response from Call Notification' }).not.toBe(before);
    const after = await responseArea.innerText();
    const response = after.slice(after.lastIndexOf('Reponse :') + 'Reponse :'.length).trim();
    if (result?.Status !== 'S000') {
      throw new Error(
        `Payment notification for bill ${billId} was refused: ${result?.Status ?? '(no status)'} ${result?.Message ?? ''}`.trim() +
          ` (serviceProviderID ${String(body.serviceProviderID)}; set ${envPrefix()}_PAYMENT_SERVICE_PROVIDER_ID in .env to change it).`,
      );
    }
    return { billId, requestBody, response: response || `${result.Status} ${result.Message ?? ''}`.trim() };
  }
}

import { expect, Locator } from '@playwright/test';
import { pickDate } from '@utils/field-helper';
import { createLogger } from '@utils/logger';
import { trackServerActivity } from '@utils/os-waits';
import { splitRules, WizardValidationError } from '@utils/validation';
import { PublicProjectLicensePage } from './PublicProjectLicensePage';

const log = createLogger('PublicProjects');

/** Shown on Next of step 1 when the chosen licence already has an open request (VERIFIED on TEST 2026-11-05/08). */
const PENDING_REQUESTS = /طلبات معلقة/;

export class LicencesHavePendingRequestsError extends Error {
  constructor(readonly licences: string[]) {
    super(
      `Every licence offered for extension already has a pending request: ${licences.join(', ')}. ` +
        'Wait until those requests finish (or are cancelled), or use another investor.',
    );
    this.name = 'LicencesHavePendingRequestsError';
  }
}

export interface ExtensionStep1 {
  /** Licence to extend; '' = the first offered licence without a pending request. */
  readonly licence: string;
  /** New contract end / licence expiry = the licence's earliest allowed date + this many months. */
  readonly extendByMonths: number;
}

/**
 * "تمديد رخصة مواد بناء للمشاريع العامة خارج نطاق المشروع" — investor wizard
 * (/Licenses_PublicProjects/New_PublicProjects_Request?…&LicenseTypeId=42), same 6 steps as the issuance.
 * VERIFIED on TEST (2026-11-05 and 2026-11-08):
 *   - step 1 "اختر الرخصة" (single Virtual-Select) lists the company's licences; choosing one PRE-FILLS the project
 *     information, the contract start (locked) and the class-ج minerals/quantities from that licence;
 *   - "تاريخ انتهاء العقد" and "تاريخ انتهاء الرخصة" must be after the licence's current end: their pickers' minimum
 *     date is that day + 1 (e.g. 2027-04-18 for licence 20261000079), so the dates are derived from it;
 *   - Next refuses a licence with an open request: "لا يمكنك تمديد الرخصة ما دامت هناك طلبات معلقة خاصة بها".
 *
 * Steps 2–6 could not be opened yet — every licence on TEST had a pending request — so they are passed generically
 * (declarations + Next) and report the app's own rules if a step needs more data.
 */
export class PublicProjectExtensionPage extends PublicProjectLicensePage {
  private get step1(): Locator {
    return this.step('Step1_LicenseInformation');
  }

  private get licencePicker(): Locator {
    return this.step1.getByRole('combobox', { name: 'Select an option' }).first();
  }

  private get licenceOptions(): Locator {
    return this.page.locator('.vscomp-option').filter({ visible: true });
  }

  override async expectNewLoaded(): Promise<void> {
    await this.page.waitForURL(/\/New_PublicProjects_Request\?/, { timeout: 60_000 });
    await expect(this.licencePicker).toBeVisible({ timeout: 90_000 });
    await trackServerActivity(this.page).idle();
  }

  /** Licence numbers offered in "اختر الرخصة". */
  async licences(): Promise<string[]> {
    await this.licencePicker.click();
    await expect(this.licenceOptions.first()).toBeVisible({ timeout: 30_000 });
    const offered = (await this.licenceOptions.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    await this.page.keyboard.press('Escape');
    await this.page.locator('body').click({ position: { x: 5, y: 300 } });
    return offered;
  }

  /** Chooses a licence; its project information and minerals load from it. */
  private async chooseLicence(licence: string): Promise<void> {
    if (!(await this.licenceOptions.first().isVisible().catch(() => false))) await this.licencePicker.click();
    // The list re-renders while it opens ("element is not stable"), hence the short pause and forced click.
    await this.page.waitForTimeout(1_000);
    const activity = trackServerActivity(this.page);
    await this.licenceOptions.filter({ hasText: licence }).first().click({ force: true });
    await expect(this.licencePicker).toContainText(licence);
    await activity.idle();
    await expect(this.step1.getByRole('textbox', { name: '*اسم المشروع' })).not.toHaveValue('', { timeout: 30_000 });
  }

  /** Earliest allowed new end date (day after the licence's current end), read from the contract-end picker. */
  private async earliestEndDate(): Promise<Date> {
    const min = await this.step1
      .locator('input[id$="Input_ContractExpiryDate"]')
      .evaluate((el) => {
        const value = (el as HTMLInputElement & { _flatpickr?: { config: { minDate?: Date } } })._flatpickr?.config.minDate;
        return value ? new Date(value).toISOString() : '';
      });
    return min ? new Date(min) : new Date(Date.now() + 86_400_000);
  }

  private async fillDates(extendByMonths: number): Promise<string> {
    const min = await this.earliestEndDate();
    const end = new Date(min.getFullYear(), min.getMonth() + extendByMonths, Math.min(min.getDate(), 28));
    const iso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    await pickDate(this.step1.locator('input[id$="Input_ContractExpiryDate"]'), iso);
    const expiry = this.step1.locator('input[id$="Input_LicenseExpiryDate2"]');
    await expect(expiry).toBeEnabled({ timeout: 30_000 });
    await pickDate(expiry, iso);
    return iso;
  }

  /**
   * Step 1: tries `d.licence`, or every offered licence in turn, until Next is accepted. Returns the licence used.
   * Throws LicencesHavePendingRequestsError when every candidate has an open request.
   */
  async completeLicenceInformation(d: ExtensionStep1, reopen: () => Promise<void>): Promise<{ licence: string; newEnd: string }> {
    const offered = await this.licences();
    if (!offered.length) throw new Error('"اختر الرخصة" offers no licence to extend for this investor.');
    if (d.licence && !offered.includes(d.licence)) throw new Error(`Licence ${d.licence} is not offered for extension. Offered: ${offered.join(', ')}.`);
    const candidates = d.licence ? [d.licence] : offered;
    const blocked: string[] = [];
    for (const licence of candidates) {
      // A fresh form each time: after the list was read (or a licence refused) the picker does not reopen reliably.
      await reopen();
      await this.chooseLicence(licence);
      const newEnd = await this.fillDates(d.extendByMonths);
      await this.tickDeclarations(this.step1);
      const change = await this.wizard.next(180_000);
      if (change.moved) {
        log.info(`Licence ${licence} → new end ${newEnd}; "${change.from}" → "${change.to}"`);
        return { licence, newEnd };
      }
      const rules = splitRules(change.errors);
      if (!rules.some((r) => PENDING_REQUESTS.test(r))) throw new WizardValidationError(change.from, rules);
      log.warn(`Licence ${licence} has a pending request — ${rules.join(' | ')}`);
      blocked.push(licence);
    }
    throw new LicencesHavePendingRequestsError(blocked);
  }

  /** Steps 2…5: declarations + Next until the terms step ("إرسال" visible). Fails with the app's rules when a step needs more. */
  async passRemainingSteps(): Promise<string[]> {
    const passed: string[] = [];
    while (!(await this.page.getByRole('button', { name: 'إرسال', exact: true }).isVisible())) {
      const step = await this.wizard.activeName();
      await this.tickDeclarations(this.page.locator('main'));
      await this.next();
      passed.push(step);
    }
    return passed;
  }
}

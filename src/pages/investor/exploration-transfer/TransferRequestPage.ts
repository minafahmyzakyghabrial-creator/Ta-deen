import { expect, Locator, Page } from '@playwright/test';
import { escapeRegExp, uploadIfEmpty } from '@utils/field-helper';
import { trackServerActivity } from '@utils/os-waits';
import { BasePage } from '../../BasePage';

export class LicenseNotOwnedError extends Error {
  constructor(licenseNumber: string, available: string[]) {
    super(
      `Licence ${licenseNumber} is not in the transferor's "رخص الكشف السارية" list, so it cannot be transferred. ` +
        `Available: ${available.join(', ') || 'none'}. Configure a licence the transferor owns — no other licence is chosen automatically.`,
    );
    this.name = 'LicenseNotOwnedError';
  }
}

/** The licence is listed but blocked by the "concurrent applications" rule (documentation §4.1). */
export class LicenseNotEligibleError extends Error {
  constructor(licenseNumber: string, message: string) {
    super(
      `Licence ${licenseNumber} cannot be transferred now — the form says: "${message}" (documentation §4.1: pending ` +
        'requests on the licence block a transfer). Close those requests or configure another licence — no other licence is chosen automatically.',
    );
    this.name = 'LicenseNotEligibleError';
  }
}

/** Shown under "معلومات الرخصة" when the licence has an active pending request (VERIFIED on TEST, 2026-11-01, licence 20260311313). */
const PENDING_REQUESTS_MESSAGE = /لا يمكنك نقل الرخصة أثناء وجود طلبات معلقة[^.]*\./;

export interface TransfereeCompany {
  readonly name: string;
  readonly crNumber: string;
}

/**
 * Transferor form "طلب تحويل رخصة كشف" — /Licenses_Exploration_Transfer/ExplorationTransferRequest?LicenseRequest_Id=0…
 * Opened from Requests → "طلب جديد" → service "تحويل رخصة الكشف".
 *
 * VERIFIED on TEST (2026-10-30, investor3): ONE page (no wizard), accordion sections inside block
 * TransferRequest_Flow.TransferRequest_WB:
 *   - التحقق من الأهلية + transferor company — read-only, filled by the server;
 *   - معلومات الرخصة: single Virtual-Select [id$=DropdownSearch_LicenseId] listing the active licences
 *     (option = number + "الفئة ( أ )"); choosing one shows رقم الرخصة / فئة / dates / المعادن (DataActionFetchLicenseInfo);
 *   - transferee: checkboxes [id$=CheckIsSubsidaryCompany], [id$=CheckboxIsEquipmentOnSite] (adds the upload
 *     "اتفاقية مبايعة المعدات/الآلات"), CR input [id$=CRInput] + button [id$=-Inquire] "استعلام", which shows the
 *     transferee company and its owner (DataActionFetchCompanyRepresentitiveData);
 *   - المرفقات: uploaders [id$=TransferAgreementAttachment], [id$=AcceptanceDeclarationAttachment]
 *     (+ the machinery agreement); formats PDF, XLSX, XLS, PNG, JPG, JPEG, KML, KMZ, 50 MB;
 *   - التعهدات: one checkbox in [id$=acknowledgeObligation];
 *   - "إرسال الطلب" — disabled until the form is valid.
 */
export class TransferRequestPage extends BasePage {
  constructor(page: Page) {
    super(page, 'investor');
  }

  get form(): Locator {
    return this.page.locator('[data-block="TransferRequest_Flow.TransferRequest_WB"]');
  }

  private get licenseSelect(): Locator {
    return this.page.locator('[id$="DropdownSearch_LicenseId"]').getByRole('combobox');
  }

  private get licenseSection(): Locator {
    return this.page.locator('[id$="ExplorationLicenseInformation"]');
  }

  get submitButton(): Locator {
    return this.page.getByRole('button', { name: 'إرسال الطلب', exact: true });
  }

  async expectLoaded(): Promise<void> {
    const activity = trackServerActivity(this.page);
    await this.page.waitForURL(/\/ExplorationTransferRequest\?/, { waitUntil: 'commit', timeout: 60_000 });
    // A cold module load once showed OutSystems' "_error.html" on TEST; reloading it recovered.
    if (/_error\.html/.test(this.page.url())) await this.page.goBack();
    await expect(this.licenseSelect).toBeVisible({ timeout: 60_000 });
    await activity.idle();
  }

  /** Licence numbers offered in "رخص الكشف السارية". */
  async availableLicenses(): Promise<string[]> {
    const box = await this.openLicenseList();
    const texts = await box.locator('.vscomp-option').allInnerTexts();
    await this.licenseSelect.locator('.vscomp-toggle-button').click();
    return texts.map((t) => t.match(/\d{6,}/)?.[0] ?? t.trim());
  }

  private async openLicenseList(): Promise<Locator> {
    if ((await this.licenseSelect.getAttribute('aria-expanded')) !== 'true') await this.licenseSelect.locator('.vscomp-toggle-button').click();
    const box = this.page.locator(`[id="${await this.licenseSelect.getAttribute('aria-controls')}"]`);
    await box.locator('.vscomp-option').first().waitFor({ timeout: 30_000 });
    return box;
  }

  /** Selects exactly `licenseNumber`; throws LicenseNotOwnedError when it is not offered (never picks another). */
  async selectLicense(licenseNumber: string): Promise<void> {
    const box = await this.openLicenseList();
    const option = box.locator('.vscomp-option').filter({ hasText: new RegExp(`(^|\\s)${escapeRegExp(licenseNumber)}(\\s|$)`) });
    const search = box.locator('input.vscomp-search-input');
    // The list is virtualized: filter by the number when the option is not rendered.
    if ((await option.count()) === 0 && (await search.isVisible())) {
      await search.fill(licenseNumber);
      await option.first().waitFor({ timeout: 5_000 }).catch(() => undefined);
    }
    if ((await option.count()) === 0) {
      if (await search.isVisible()) await search.fill('');
      const available = (await box.locator('.vscomp-option').allInnerTexts()).map((t) => t.match(/\d{6,}/)?.[0] ?? t.trim());
      throw new LicenseNotOwnedError(licenseNumber, available);
    }
    const activity = trackServerActivity(this.page);
    await option.first().click();
    await activity.idle();
    await expect(this.licenseSection, 'Selected licence details').toContainText(new RegExp(`رقم الرخصة\\s*${licenseNumber}`), { timeout: 30_000 });
    const blocked = (await this.licenseSection.innerText()).match(PENDING_REQUESTS_MESSAGE);
    if (blocked) throw new LicenseNotEligibleError(licenseNumber, blocked[0]);
  }

  /** Licence details shown after selection (رقم الرخصة, فئة الرخصة, dates, المعادن). */
  async licenseDetails(): Promise<string> {
    return (await this.licenseSection.innerText()).replace(/\s+/g, ' ').trim();
  }

  private checkbox(idSuffix: string): Locator {
    return this.page.locator(`input[type=checkbox][id$="${idSuffix}"]`);
  }

  async setSubsidiary(on: boolean): Promise<void> {
    await this.checkbox('CheckIsSubsidaryCompany').setChecked(on);
  }

  async setEquipmentOnSite(on: boolean): Promise<void> {
    await this.checkbox('CheckboxIsEquipmentOnSite').setChecked(on);
  }

  /** CR + "استعلام"; returns the transferee company the server resolved (must match the CR). */
  async inquireTransferee(crNumber: string): Promise<TransfereeCompany> {
    await this.page.locator('input[id$="CRInput"]').fill(crNumber);
    const inquire = this.page.locator('button[id$="-Inquire"]');
    await expect(inquire).toBeEnabled();
    const activity = trackServerActivity(this.page);
    await inquire.click();
    await activity.idle();
    const owner = this.page.getByText('معلومات مالك الشركة المحال لها الرخصة', { exact: true });
    const errors = this.feedback.of('error').filter({ visible: true });
    await expect(owner.or(errors).first()).toBeVisible({ timeout: 30_000 });
    if (await errors.count()) throw new Error(`Transferee CR ${crNumber} was refused: ${(await errors.allInnerTexts()).join(' | ')}`);
    // The resolved company block is the one that follows the CR input (the first block is the transferor's own company).
    const text = (await this.form.innerText()).replace(/\s+/g, ' ');
    const after = text.slice(text.indexOf('استعلام'));
    const name = after.match(/الإسم (.+?) السجل التجاري/)?.[1]?.trim() ?? '';
    const cr = after.match(/السجل التجاري (\d+)/)?.[1] ?? '';
    return { name, crNumber: cr };
  }

  /** Uploads into an attachment row by its name (e.g. "اتفاقية التحويل"), unless already filled. */
  async upload(attachmentName: string, file: string): Promise<void> {
    const slots: Record<string, string> = {
      'اتفاقية التحويل': 'TransferAgreementAttachment',
      'إقرار القبول': 'AcceptanceDeclarationAttachment',
    };
    const id = slots[attachmentName];
    const slot = id
      ? this.page.locator(`[id$="${id}"]`)
      : this.form.locator('[data-block="Adaptive.Columns2"]').filter({ hasText: attachmentName }).locator('[data-block="LicensesCommonUploader.CommonUploader"]');
    await uploadIfEmpty(slot.first(), file);
  }

  async acknowledgeObligations(): Promise<void> {
    const boxes = this.page.locator('[id$="acknowledgeObligation"]').getByRole('checkbox');
    for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check();
  }

  /**
   * "إرسال الطلب" → confirmation dialog "إرسال طلب التحويل" (buttons "إرسال طلب التحويل" / "إلغاء طلب التحويل")
   * → success dialog "تم إرسال طلب تحويل رخصة كشف بنجاح … رقم الطلب #<n>" (VERIFIED on TEST, request 76352).
   * Returns the transferor's request number. A refused submit raises the app's own messages.
   */
  async submit(): Promise<string> {
    await expect(this.submitButton).toBeEnabled();
    await this.submitButton.click();
    const confirm = this.page.getByRole('dialog').filter({ visible: true }).filter({ hasText: 'إلغاء طلب التحويل' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'إرسال طلب التحويل', exact: true }).click();
    const success = this.page.getByText(/رقم الطلب\s*#\s*\d+/).filter({ visible: true }).first();
    const errors = this.feedback.of('error').filter({ visible: true });
    await expect(success.or(errors).first()).toBeVisible({ timeout: 90_000 });
    if (await errors.count()) throw new Error(`Transfer request was refused: ${(await errors.allInnerTexts()).join(' | ')}`);
    const requestNumber = (await success.innerText()).match(/#\s*(\d+)/)?.[1];
    if (!requestNumber) throw new Error('The success message shows no request number.');
    return requestNumber;
  }
}

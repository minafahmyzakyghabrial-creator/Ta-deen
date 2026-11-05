import { expect, Locator } from '@playwright/test';
import { escapeRegExp, fillIfEmpty, uploadIfEmpty } from '@utils/field-helper';
import { WizardStep } from '../exploration-license/WizardStep';
import { tickDeclarations } from './TransfereeSteps';

export interface TransfereeLicenseInfoData {
  /** Experts picked in the "إضافة خبير جيولوجي جديد" popup ("اختر الخبير"); empty = the first one listed. */
  readonly geologists: string[];
  readonly consultant: { readonly name: string; readonly yearsOfExperience: string };
  readonly attachment: string;
}

/**
 * Transferee wizard step 1 — "معلومات الرخصة" (block Steps_Flow.LicenseInformation_WB).
 *
 * VERIFIED on TEST (2026-10-30, request 76352): declarations "التصريحات" with "تطبيق على الكل" (4 checkboxes);
 * the licence being transferred (read-only); "القدرة الفنية" with button "إضافة خبير جيولوجي جديد" and
 * "المستشار الفني": inputs [id$=Input_Name], [id$=Input_YearsofExperience] + two uploads
 * (العرض التقديمي للاستشاري, خطاب الاتفاق مع الاستشاري — blocks ExplorationUploadAttachment_WB).
 */
export class TransfereeLicenseInfoStep extends WizardStep<TransfereeLicenseInfoData> {
  readonly name = 'معلومات الرخصة';

  private get root(): Locator {
    return this.block('Steps_Flow.LicenseInformation_WB');
  }

  private get technical(): Locator {
    return this.root.locator('[role=tab]').filter({ hasText: 'القدرة الفنية' }).last();
  }

  async expectLoaded(): Promise<void> {
    await expect(this.root.getByRole('button', { name: 'تطبيق على الكل', exact: true })).toBeVisible({ timeout: 60_000 });
  }

  protected async fillStep(d: TransfereeLicenseInfoData): Promise<void> {
    // Declarations (legal attestations — authorised for TEST runs).
    const declarations = this.root.locator('[role=tab]').filter({ has: this.page.getByRole('button', { name: 'تطبيق على الكل', exact: true }) }).last();
    this.record('التصريحات', await tickDeclarations(declarations));

    if ((await this.technical.locator('tbody tr').count()) > 0) {
      this.record('الخبراء الجيولوجيين', 'kept');
    } else {
      // Unlike the issuance wizard, this popup picks from the company's REGISTERED experts (multi-select
      // "اختر الخبير" + "حفظ"), VERIFIED on TEST 2026-10-30.
      await this.technical.getByRole('button', { name: /إضافة خبير جيولوجي جديد/ }).click();
      const dialog = this.page.getByRole('dialog').filter({ visible: true }).last();
      await expect(dialog.getByRole('button', { name: 'حفظ', exact: true })).toBeVisible();
      const picked = await this.pickExperts(dialog, d.geologists);
      // The expert list stays drawn over "حفظ" even after the widget reports closed (a close-transition defect,
      // VERIFIED on TEST: Escape / toggle / outside click / its close() API all leave it visible). A keyboard user
      // can still save — focus the button and press Enter.
      await dialog.getByRole('button', { name: 'حفظ', exact: true }).focus();
      await this.page.keyboard.press('Enter');
      await expect(dialog).toBeHidden();
      await expect(this.technical.locator('tbody tr').first()).toBeVisible();
      this.record(`خبير جيولوجي = ${picked.join(', ')}`, 'filled');
    }

    this.record('اسم المستشار', await fillIfEmpty(this.root.locator('input[id$="Input_Name"]'), d.consultant.name));
    this.record('سنوات الخبرة', await fillIfEmpty(this.root.locator('input[id$="Input_YearsofExperience"]'), d.consultant.yearsOfExperience));
    const uploads = this.technical.locator('[data-block="Common_NeedToMove.ExplorationUploadAttachment_WB"]');
    for (let i = 0; i < (await uploads.count()); i++) this.record(`مرفق المستشار ${i + 1}`, await uploadIfEmpty(uploads.nth(i), d.attachment));
  }

  /**
   * "اختر الخبير" is a Virtual-Select rendered as a CENTRED popup (popup-position-center). The shared MultiSelect
   * can't drive it (VERIFIED on TEST 2026-10-30): its aria-controls id does not match the rendered list, a click
   * while the dialog animates is lost. So: the open list is the dropbox wrapper without the "closed" class;
   * open with retries and pick inside it.
   */
  private async pickExperts(dialog: Locator, names: readonly string[]): Promise<string[]> {
    const combo = dialog.getByRole('combobox');
    const openList = this.page.locator('.vscomp-dropbox-wrapper.popup-position-center:not(.closed)');
    for (let attempt = 1; attempt <= 5 && (await openList.count()) === 0; attempt++) {
      await combo.click();
      await openList.first().waitFor({ timeout: 3_000 }).catch(() => undefined);
    }
    await expect(openList.locator('.vscomp-option').first(), 'Registered experts ("اختر الخبير")').toBeVisible({ timeout: 30_000 });
    const picked: string[] = [];
    const options = openList.locator('.vscomp-option');
    if (!names.length) {
      picked.push((await options.first().innerText()).trim());
      await options.first().click();
    }
    for (const name of names) {
      await openList.locator('input.vscomp-search-input').fill(name);
      const option = options.filter({ hasText: new RegExp(`^\\s*${escapeRegExp(name)}\\s*$`) });
      if ((await option.count()) === 0) throw new Error(`Expert "${name}" is not registered for the transferee. Listed: ${(await options.allInnerTexts()).map((t) => t.trim()).join(' | ')}`);
      await option.first().click();
      picked.push(name);
    }
    await expect(combo.locator('.vscomp-value')).not.toHaveText(/اختر الخبير/);
    return picked;
  }
}

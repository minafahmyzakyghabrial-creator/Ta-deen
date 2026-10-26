import { expect, Locator } from '@playwright/test';
import { AddRowDialog } from '@components/AddRowDialog';
import { MultiSelect } from '@components/MultiSelect';
import { NewExplorationRequestData } from '@data/new-exploration-request.data';
import { trackServerActivity } from '@utils/os-waits';
import { WizardStep } from './WizardStep';

/**
 * Step 1 — "معلومات الطلب" on a NEW request.
 *
 * VERIFIED on TEST (2026-10-26, draft 76111). Required (toast on an empty Next):
 * "يرجى تحديد جميع الإقرارات - اخنر مدة الرخصة - يجب ادخال خبير جيولوجي واحد على الأقل".
 * Sections are accordions identified by their title button; القدرة الفنية appears only after a category is chosen.
 */
export class RequestInfoStep extends WizardStep<NewExplorationRequestData['requestInfo'] & { attachment: string }> {
  readonly name = 'معلومات الطلب';

  private section(title: string | RegExp): Locator {
    return this.page.locator('[role=tab]').filter({ has: this.page.getByRole('button', { name: title }) });
  }

  async expectLoaded(): Promise<void> {
    await expect(this.section('مدة الرخصة والمعادن المطلوبة')).toBeVisible({ timeout: 60_000 });
  }

  protected async fillStep(d: NewExplorationRequestData['requestInfo'] & { attachment: string }): Promise<void> {
    // Declarations (legal attestations — authorised for TEST runs)
    const declarations = this.section(/التزامات وإفصاحات مقدم الطلب/);
    await declarations.getByRole('button', { name: 'تطبيق على الكل', exact: true }).click();
    await expect(declarations.getByRole('checkbox', { checked: false })).toHaveCount(0);
    this.record('التزامات وإفصاحات مقدم الطلب', 'filled');

    const licence = this.section('مدة الرخصة والمعادن المطلوبة');
    const category = new MultiSelect(licence.getByRole('combobox', { name: 'Select an option' }));
    // The minerals list is loaded from the server for the chosen category — wait for it.
    const loading = trackServerActivity(this.page);
    this.record(`فئة الرخصة = ${(await category.select([d.category])).join()}`, 'filled');
    await loading.idle();
    const selects = licence.locator('select');
    await selects.nth(0).selectOption({ label: d.durationYears });
    this.record(`مدة الرخصة = ${d.durationYears}`, 'filled');
    const minerals = new MultiSelect(licence.getByRole('combobox', { name: 'Select one or more options' }));
    this.record(`المعادن = ${(await minerals.select(d.minerals)).join(', ')}`, 'filled');
    await selects.nth(1).selectOption({ label: d.miningComplex });
    this.record(`المجمع التعديني = ${d.miningComplex}`, 'filled');

    // Technical capability: one geologist (popup with 3 mandatory attachments)
    const technical = this.section('القدرة الفنية');
    await expect(technical).toBeVisible();
    if ((await technical.locator('tbody tr').count()) > 0) return this.record('الخبراء الجيولوجيين', 'kept');
    await technical.getByRole('button', { name: /إضافة جديدة/ }).click();
    const dialog = new AddRowDialog(this.page);
    await dialog.waitOpen();
    await dialog.fill(d.geologist);
    // Each upload replaces its <input type=file> with the file name, so always take the first remaining one.
    const inputs = dialog.root.locator('input[type=file]');
    for (let guard = 0; guard < 5 && (await inputs.count()) > 0; guard++) {
      const activity = trackServerActivity(this.page);
      await inputs.first().setInputFiles(d.attachment);
      await activity.idle();
    }
    const errors = await dialog.save();
    if (errors.length) throw new Error(`Geologist popup refused: ${errors.join(' | ')}`);
    await expect(technical.locator('tbody tr').first()).toBeVisible();
    this.record(`خبير جيولوجي = ${d.geologist['الاسم']}`, 'filled');
  }
}

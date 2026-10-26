import { expect, Locator } from '@playwright/test';
import { MultiSelect } from '@components/MultiSelect';
import { ExplorationLicenseData } from '@data/exploration-license.data';
import { AddRowDialog } from '@components/AddRowDialog';
import { checkAll, checkRadioByLabel, escapeRegExp, fillIfEmpty, selectIfEmpty, uploadIfEmpty } from '@utils/field-helper';
import { trackServerActivity } from '@utils/os-waits';
import { WizardStep } from './WizardStep';

/**
 * Step 3 — "خطة العمل و الانفاق" (work & expenditure plan).
 *
 * Mandatory content, as reported by the app on an empty Next (TEST, 2026-10-26):
 *   work-plan description fields · desk studies · technical studies · geochemical survey ·
 *   geophysical survey · physical lab analysis · rehabilitation cost for every year ·
 *   other expenses · applicant declarations · land ownership ·
 *   at least one of reverse-circulation OR diamond drilling.
 * The development timeline gets one row per planned activity and needs start year/month/duration.
 * Technical justifications are optional.
 */
export class WorkPlanStep extends WizardStep<ExplorationLicenseData['workPlan'] & { attachment: string }> {
  readonly name = 'خطة العمل و الانفاق';

  private section(name: string): Locator {
    return this.block(`StepThree_WorkPlan_UIFlow.${name}`);
  }

  private drillingSection(heading: string): Locator {
    return this.section('Drilling').filter({
      has: this.page.locator('.font-size-h6', { hasText: new RegExp(`^\\s*${escapeRegExp(heading)}\\s*\\*?\\s*$`) }),
    });
  }

  async expectLoaded(): Promise<void> {
    await expect(this.section('WorkPlanDescription')).toBeVisible();
    await expect(this.section('ApplicantsDeclaration')).toBeVisible();
  }

  protected async fillStep(d: ExplorationLicenseData['workPlan'] & { attachment: string }): Promise<void> {
    // --- Technical justifications: mandatory on NEW requests ("حقل المبررات الفنيه اجباري");
    // popup = type select + 5 mandatory attachments (VERIFIED on TEST draft 76116).
    const justification = this.section('TechnicalJustification');
    if ((await justification.locator('tbody tr').filter({ hasText: /\S/ }).count()) > 0) {
      this.record('المبررات الفنية الأساسية', 'kept');
    } else {
      await justification.getByRole('button', { name: /إضافة/ }).first().click();
      const dialog = new AddRowDialog(this.page);
      await dialog.waitOpen();
      await dialog.fill({ 'المبررات الفنية': d.technicalJustification });
      const files = dialog.root.locator('input[type=file]');
      for (let guard = 0; guard < 8 && (await files.count()) > 0; guard++) {
        const activity = trackServerActivity(this.page);
        await files.first().setInputFiles(d.attachment);
        await activity.idle();
      }
      const errors = await dialog.save();
      if (errors.length) throw new Error(`Technical justification popup refused: ${errors.join(' | ')}`);
      this.record(`المبررات الفنية = ${d.technicalJustification}`, 'filled');
    }

    // --- Work plan description
    const description = this.section('WorkPlanDescription');
    const nature = new MultiSelect(description.locator('[role=combobox][aria-haspopup=listbox]').first());
    if ((await nature.selected()).length) this.record('طبيعة عمليات الكشف', 'kept');
    else this.record(`طبيعة عمليات الكشف = ${(await nature.select(d.explorationNature)).join(', ')}`, 'filled');

    const survey = description.getByRole('radiogroup');
    if (await survey.getByRole('radio', { checked: true }).count()) this.record('نتائج أعمال المسح الميداني', 'kept');
    else this.record('نتائج أعمال المسح الميداني', await checkRadioByLabel(survey, new RegExp(escapeRegExp(d.fieldSurveyResult))));

    this.record('التقرير الميداني (attachment)', await uploadIfEmpty(description, d.attachment));

    // --- Land ownership
    const ownership = this.section('LandOwnership');
    if (await ownership.getByRole('radio', { checked: true }).count()) this.record('ملكية الأرض', 'kept');
    else this.record(`ملكية الأرض = ${d.landOwnership}`, await checkRadioByLabel(ownership, d.landOwnership));

    // --- Expenditure plan tables (popups)
    await this.addRowIfEmpty(this.section('StudyPlan'), 'الدراسات الاولية/المكتبية', d.deskStudy);
    await this.addRowIfEmpty(this.section('TechnicalStudy'), 'الدراسات الفنية', d.technicalStudy);
    await this.addRowIfEmpty(this.section('SurveyPlan_GeochemicalAnalysis'), 'المسح الجيوكيميائي', d.geochemicalSurvey);
    await this.addRowIfEmpty(this.section('SurveyPlan_Geophysical'), 'المسح الجيوفيزيائي', d.geophysicalSurvey);
    await this.addRowIfEmpty(this.section('PhysicalLaboratoryPlan'), 'تحاليل المختبرات الفيزيائية', d.physicalLabAnalysis);
    await this.addRowIfEmpty(this.section('OtherExpensesPlan'), 'المصاريف الاخرى', d.otherExpenses);

    // Rule: at least one of reverse-circulation or diamond drilling.
    const rc = await this.drillingSection('حفر الدوران العكسي').locator('tbody tr').count();
    const diamond = await this.drillingSection('الحفر الماسي').locator('tbody tr').count();
    if (rc + diamond > 0) this.record('الحفر (الدوران العكسي / الماسي)', 'kept');
    else await this.addRowIfEmpty(this.drillingSection(d.drilling.heading), d.drilling.heading, d.drilling.fields);

    // --- Rehabilitation cost: one input per licence year
    const rehab = this.section('RehabilitationPlan').locator('tbody input');
    for (let i = 0; i < (await rehab.count()); i++) {
      this.record(`تكلفة إعادة التأهيل (سنة ${i + 1})`, await fillIfEmpty(rehab.nth(i), d.rehabilitationCostPerYear));
    }

    // --- Development timeline: rows are generated from the activities planned above
    const timeline = this.section('DetailsOfTheDevelopment').locator('tbody tr');
    await expect(timeline.first(), 'Timeline rows appear once activities are planned').toBeVisible();
    for (let i = 0; i < (await timeline.count()); i++) {
      const row = timeline.nth(i);
      const task = (await row.locator('td').first().innerText()).trim();
      const selects = row.locator('select');
      const year = await selectIfEmpty(selects.nth(0), d.timeline.startYear);
      const month = await selectIfEmpty(selects.nth(1), d.timeline.startMonth);
      const duration = row.locator('input[type=text]');
      await expect(duration).toBeEnabled(); // unlocks once year + month are chosen
      const dur = await fillIfEmpty(duration, d.timeline.durationMonths);
      this.record(`الجدول الزمني › ${task}`, [year, month, dur].includes('filled') ? 'filled' : 'kept');
    }

    // --- Applicant declarations (attestations; authorised for TEST runs)
    const declarations = this.section('ApplicantsDeclaration');
    const ticked = await checkAll(declarations);
    this.record('التصريحات', ticked ? 'filled' : 'kept');
    await expect(declarations.getByRole('checkbox', { checked: false })).toHaveCount(0);
  }
}

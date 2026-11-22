import { expect, Locator } from '@playwright/test';
import { MultiSelect } from '@components/MultiSelect';
import { ExplorationLicenseData } from '@data/exploration-license.data';
import { AddRowDialog } from '@components/AddRowDialog';
import { checkAll, checkRadioByLabel, escapeRegExp, fillIfEmpty, selectIfEmpty, uploadIfEmpty } from '@utils/field-helper';
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
      await dialog.uploadAll(d.attachment);
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
    await this.balanceYearTotals();

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

  /**
   * "إجمالي مبلغ خطة الإنفاق" has one row per licence year (1–5) plus a "المجموع" row:
   * minimum spending | actual costs | difference.
   *
   * On Next the app checks EVERY row of that list — the years AND the "المجموع" row — for actual >= minimum,
   * but compares them as TEXT (app bug, TEST 2026-11-22: "100000" < "3000", and with 3 years
   * "209997" < "21000" on the total row → "لا يمكن تقديم الطلب، إجمالي التكاليف أقل من الحد الأدنى للإنفاق").
   * Years without planned activities have no costs at all, so they fail too.
   *
   * The rehabilitation cost is a free per-year input, so it sets each year's total:
   *   - every year but the first → an all-9 total (9,999 / 99,999 …) as long as its minimum and other costs;
   *   - the first year → the remainder that makes the GRAND total all-9 too (e.g. 999,999).
   * An all-9 number at least as long as the minimum is >= it both as text and as a number, so every row
   * passes for any licence duration — and still passes once the app compares numbers.
   */
  private async balanceYearTotals(): Promise<void> {
    const amount = (text: string): number => Number(text.replace(/[^\d.]/g, '')) || 0;
    const nines = (digits: number): number => 10 ** digits - 1;
    const len = (n: number): number => String(Math.ceil(n)).length;
    const passes = (actual: number, minimum: number): boolean =>
      actual >= minimum && String(actual) >= String(Math.round(minimum)); // as a number AND as the app's text
    const MAX_REHAB = 9_999_999; // Regex_7Digits_2Decimal

    const rows = this.section('ExpenditurePlanTotalAmount').locator('tbody tr');
    const yearRows = rows.filter({ hasNot: this.page.getByText('المجموع', { exact: true }) });
    const totalRow = rows.filter({ has: this.page.getByText('المجموع', { exact: true }) });
    const rehabRows = this.section('RehabilitationPlan').locator('tbody tr').filter({ has: this.page.locator('input') });
    await expect(yearRows.first(), 'Expenditure summary rows').toBeVisible();
    await expect(yearRows, 'One expenditure summary row per rehabilitation year').toHaveCount(await rehabRows.count());

    // Read every year: minimum and the costs other than rehabilitation.
    const years: { label: string; minimum: number; other: number; input: Locator; cells: Locator; target: number }[] = [];
    for (let i = 0; i < (await yearRows.count()); i++) {
      const cells = yearRows.nth(i).locator('td');
      const label = (await cells.nth(0).innerText()).trim();
      const input = rehabRows.filter({ hasText: label }).locator('input');
      const other = amount(await cells.nth(2).innerText()) - amount(await input.inputValue());
      years.push({ label, minimum: amount(await cells.nth(1).innerText()), other, input, cells, target: 0 });
    }

    // Years 2…n: smallest all-9 total covering the minimum and leaving a rehabilitation cost >= 1.
    for (const y of years.slice(1)) {
      let digits = Math.max(len(y.minimum), len(y.other));
      if (nines(digits) - y.other < 1) digits++;
      y.target = nines(digits);
    }
    // Year 1: whatever makes the grand total all-9, as long as year 1 itself passes too.
    const first = years[0];
    const othersTotal = years.slice(1).reduce((sum, y) => sum + y.target, 0);
    const minimumTotal = years.reduce((sum, y) => sum + y.minimum, 0);
    for (let digits = len(othersTotal + first.other + 1); ; digits++) {
      const target = nines(digits) - othersTotal;
      if (target - first.other >= 1 && passes(target, first.minimum) && passes(nines(digits), minimumTotal)) {
        first.target = target;
        break;
      }
      if (digits > 12) throw new Error(`No expenditure total found for ${first.label}`);
    }
    const grandTotal = years.reduce((sum, y) => sum + y.target, 0);

    for (const y of years) {
      const rehab = Math.round(y.target - y.other);
      if (rehab > MAX_REHAB) throw new Error(`${y.label}: rehabilitation ${rehab} exceeds the 7-digit input`);
      await y.input.fill(String(rehab));
      await y.input.blur();
      await expect
        .poll(async () => amount(await y.cells.nth(2).innerText()), { message: `${y.label}: actual costs updated to ${y.target}` })
        .toBe(y.target);
      this.record(`إجمالي خطة الإنفاق › ${y.label}: ${y.target} (حد أدنى ${y.minimum}, إعادة التأهيل ${rehab})`, 'filled');
    }
    if (await totalRow.count()) {
      await expect
        .poll(async () => amount(await totalRow.locator('td').nth(2).innerText()), { message: `المجموع updated to ${grandTotal}` })
        .toBe(grandTotal);
    }
    this.record(`إجمالي خطة الإنفاق › المجموع: ${grandTotal} (حد أدنى ${minimumTotal})`, 'filled');
  }
}

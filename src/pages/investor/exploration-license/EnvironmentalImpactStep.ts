import { expect, Locator } from '@playwright/test';
import { AddRowDialog } from '@components/AddRowDialog';
import { MultiSelect } from '@components/MultiSelect';
import { ExplorationLicenseData } from '@data/exploration-license.data';
import { checkAll } from '@utils/field-helper';
import { WizardValidationError } from '@utils/validation';
import { validationLog, WizardStep } from './WizardStep';

/**
 * Domains of the "الآثار الناجمة عن أنشطة التعدين" popup, in screen order. Each domain has 3
 * multi-selects (impacts, causing activities, mitigation) and one monitoring <select>; the
 * labels repeat per domain, so controls are addressed by domain position (VERIFIED on TEST).
 */
const DOMAINS = ['الهواء', 'النفايات والمواد الخطرة', 'التنوع البيولوجي', 'المياه والمياه الجوفية', 'التربة والمناظر الطبيعية'];

/**
 * Step 6 — "خطة الأثر البيئي" (environmental impact plan).
 * Rule on an empty Next: "يجب عليك التحقق من جميع الالتزامات/التعهدات" (all obligations).
 * The impacts table is not reported as mandatory; one domain row is added for completeness.
 */
export class EnvironmentalImpactStep extends WizardStep<ExplorationLicenseData['environmentalImpact']> {
  readonly name = 'خطة الأثر البيئي';

  private section(name: string): Locator {
    return this.block(`EnvironmentalImpactStudyFlow.${name}`);
  }

  async expectLoaded(): Promise<void> {
    await expect(this.section('ApplicantObligations').getByRole('checkbox').first()).toBeVisible();
  }

  /**
   * This table is NOT a <table>: it is a CSS grid (`.table-custom-dga`) whose first child is the
   * header and every further `.gridContainer6` is one domain row (e.g. id "…-AirTable").
   */
  private get impactRows(): Locator {
    return this.section('ImpactsCausedbyMiningActivities').locator('.table-custom-dga > .gridContainer6:not(.table-header-custom)');
  }

  protected async fillStep(d: ExplorationLicenseData['environmentalImpact']): Promise<void> {
    const impacts = this.section('ImpactsCausedbyMiningActivities');
    if ((await this.impactRows.count()) > 0) {
      this.record('الآثار الناجمة عن أنشطة التعدين', 'kept');
    } else {
      const domain = DOMAINS.indexOf(d.domain);
      if (domain < 0) throw new Error(`Unknown environmental domain "${d.domain}". Use one of: ${DOMAINS.join(' | ')}.`);
      await impacts.getByRole('button', { name: /إضافة/ }).first().click();
      const dialog = new AddRowDialog(this.page);
      await dialog.waitOpen();
      const selects = dialog.root.locator('[role=combobox][aria-haspopup=listbox]');
      for (let k = 0; k < 3; k++) await new MultiSelect(selects.nth(domain * 3 + k)).select();
      await dialog.root.locator('select').nth(domain).selectOption({ label: d.monitoring });
      const errors = await dialog.save();
      if (errors.length) {
        errors.forEach((e) => validationLog.warn(`الآثار البيئية: ${e}`));
        throw new WizardValidationError(`${this.name} › الآثار الناجمة عن أنشطة التعدين`, errors);
      }
      await expect(this.impactRows.first()).toBeVisible();
      this.record(`الآثار الناجمة عن أنشطة التعدين = ${d.domain} / ${d.monitoring}`, 'filled');
    }

    // Applicant obligations (attestations; authorised for TEST runs)
    const obligations = this.section('ApplicantObligations');
    this.record('التزامات/تعهدات مقدم الطلب', (await checkAll(obligations)) ? 'filled' : 'kept');
    await expect(obligations.getByRole('checkbox', { checked: false })).toHaveCount(0);
  }
}

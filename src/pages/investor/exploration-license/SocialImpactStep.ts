import { expect, Locator } from '@playwright/test';
import { MultiSelect } from '@components/MultiSelect';
import { ExplorationLicenseData } from '@data/exploration-license.data';
import { fieldByLabel, fillIfEmpty, uploadIfEmpty } from '@utils/field-helper';
import { WizardStep } from './WizardStep';

/**
 * Step 5 — "خطة الأثر الاجتماعي" (social impact plan).
 *
 * Rules reported by the app (TEST, 2026-10-26):
 *   employee: name/position valid text · ID 10 digits starting 1 or 2 · mobile 9 digits starting 5 ·
 *   valid email; at least one: grievance mechanism, stakeholder, engagement plan, social impact,
 *   local development programme, local community, local employment plan, local purchase plan.
 * "الاستخدام المحلي للأراضي" and voluntary activities are optional.
 */
export class SocialImpactStep extends WizardStep<ExplorationLicenseData['socialImpact'] & { attachment: string }> {
  readonly name = 'خطة الأثر الاجتماعي';

  private section(name: string): Locator {
    return this.block(`SocialImpact.${name}`);
  }

  async expectLoaded(): Promise<void> {
    await expect(this.section('EmployeeAppointedtoManageCommunityPerformance')).toBeVisible();
    await expect(this.section('PurchaseplansfromtheLocalCommunity')).toBeVisible();
  }

  private async multiSelect(section: Locator, index: number, label: string, wanted: string[]): Promise<void> {
    const select = new MultiSelect(section.locator('[role=combobox][aria-haspopup=listbox]').nth(index));
    if ((await select.selected()).length) return this.record(label, 'kept');
    this.record(`${label} = ${(await select.select(wanted)).join(', ')}`, 'filled');
  }

  protected async fillStep(d: ExplorationLicenseData['socialImpact'] & { attachment: string }): Promise<void> {
    const employee = this.section('EmployeeAppointedtoManageCommunityPerformance');
    const e = d.employee;
    for (const [label, value] of [
      ['اسم المكلف', e.name],
      ['رقم الهوية', e.nationalId],
      ['الوظيفة', e.position],
      ['رقم الجوال', e.mobile],
      ['البريد الإلكتروني', e.email],
    ] as const) {
      this.record(label, await fillIfEmpty(fieldByLabel(employee, label), value));
    }
    this.record('خطاب التوظيف (attachment)', await uploadIfEmpty(employee, d.attachment));

    const engagement = this.section('LocalCommunitiesandEngagement');
    await this.addRowIfEmpty(engagement, 'المجتمعات المحلية المحيطة بالموقع', d.localCommunity);
    await this.multiSelect(engagement, 0, 'منهجيات آلية التظلم', d.grievanceMechanisms);
    await this.multiSelect(engagement, 1, 'تحديد أصحاب المصلحة', d.stakeholders);
    await this.multiSelect(engagement, 2, 'خطة إشراك أصحاب المصلحة', d.stakeholderEngagementPlan);

    const assessment = this.section('SocialImpactAssessmentPlan');
    await this.multiSelect(assessment, 0, 'تحديد الأثار الإجتماعية', d.socialImpacts);
    await this.multiSelect(assessment, 1, 'برامج الاجتماعية المحلية', d.localPrograms);

    await this.addRowIfEmpty(this.section('EmploymentofLocalCommunityMembersPlan'), 'خطة توظيف أفراد المجتمع المحلي', d.employmentPlan);
    await this.addRowIfEmpty(this.section('PurchaseplansfromtheLocalCommunity'), 'خطة الشراء من المجتمع المحلي', d.purchasePlan);
  }
}

import { expect, Page } from '@playwright/test';
import { Wizard } from '@components/Wizard';
import { trackServerActivity } from '@utils/os-waits';
import { BasePage } from '../../BasePage';
import { EnvironmentalImpactStep } from './EnvironmentalImpactStep';
import { AttachmentsStep, TermsStep } from './FinalSteps';
import { FinancialCapabilityStep } from './FinancialCapabilityStep';
import { LocationStep } from './LocationStep';
import { RequestInfoStep } from './RequestInfoStep';
import { SocialImpactStep } from './SocialImpactStep';
import { WorkPlanStep } from './WorkPlanStep';

/**
 * Exploration License application wizard ("طلب رخصة إستكشاف جديدة").
 *
 * URL (VERIFIED on TEST): /Licenses_Explorations/Exploration_License?In_RequestId=<n>&IsView=false&LicenseTypeId=2
 * — a different OutSystems module than the portal, so it is reached through the Requests
 * list (row action "تعديل"), never by building the URL.
 *
 * Steps observed on TEST (2026-10-26):
 *   1 معلومات الطلب · 2 موقع الطلب · 3 خطة العمل و الانفاق · 4 إثبات القدرة المالية ·
 *   5 خطة الأثر الاجتماعي · 6 خطة الأثر البيئي · 7 المرفقات · 8 الشروط والأحكام
 */
export class ExplorationLicensePage extends BasePage {
  readonly wizard: Wizard;

  constructor(page: Page) {
    super(page, 'investor');
    this.wizard = new Wizard(page);
  }

  get requestInfo() {
    return new RequestInfoStep(this.page);
  }
  get location() {
    return new LocationStep(this.page);
  }
  get workPlan() {
    return new WorkPlanStep(this.page);
  }
  get financialCapability() {
    return new FinancialCapabilityStep(this.page);
  }
  get socialImpact() {
    return new SocialImpactStep(this.page);
  }
  get environmentalImpact() {
    return new EnvironmentalImpactStep(this.page);
  }
  get attachments() {
    return new AttachmentsStep(this.page);
  }
  get terms() {
    return new TermsStep(this.page);
  }

  /** A NEW (unsaved) application wizard is open on step 1 — no In_RequestId in the URL yet. */
  async expectNewLoaded(): Promise<void> {
    const activity = trackServerActivity(this.page);
    await this.page.waitForURL(/Exploration_License\?/, { waitUntil: 'commit', timeout: 60_000 });
    await expect(this.wizard.steps.first()).toBeVisible({ timeout: 60_000 });
    await expect(this.wizard.nextButton).toBeVisible();
    await activity.idle();
  }

  /** Request number once the server assigned one (after step 1 is saved), else undefined. */
  requestNumber(): string | undefined {
    return new URL(this.page.url()).searchParams.get('In_RequestId') ?? undefined;
  }

  /**
   * The wizard of this request is open and its first data load has finished.
   * Measured on TEST: a cold load of this module takes ~13 s (separate OutSystems app), so the
   * first render gets an explicit budget instead of the default expect timeout.
   */
  async expectLoaded(requestNumber: string): Promise<void> {
    const activity = trackServerActivity(this.page);
    // 'commit' = the navigation has started; the module's document itself can take >15 s to load.
    await this.page.waitForURL(new RegExp(`Exploration_License\\?.*In_RequestId=${requestNumber}(&|$)`), {
      waitUntil: 'commit',
      timeout: 60_000,
    });
    await expect(this.wizard.steps.first()).toBeVisible({ timeout: 60_000 });
    await expect(this.wizard.nextButton).toBeVisible();
    await activity.idle();
  }
}

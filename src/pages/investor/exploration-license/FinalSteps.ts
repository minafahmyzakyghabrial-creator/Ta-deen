import { expect, Locator } from '@playwright/test';
import { checkAll } from '@utils/field-helper';
import { WizardStep } from './WizardStep';

/**
 * Step 7 — "المرفقات" (additional attachments).
 * The screen says "لإضافة أي مرفقات ترغب في إضافتها (إذا وجدت)" — optional; Next passes empty.
 */
export class AttachmentsStep extends WizardStep<void> {
  readonly name = 'المرفقات';

  async expectLoaded(): Promise<void> {
    await expect(this.block('ExplorationSteps.Attachments')).toBeVisible();
  }

  protected async fillStep(): Promise<void> {
    this.note('Additional attachments are optional — none added.');
  }
}

/**
 * Step 8 — "الشروط والأحكام" (terms and conditions) + the final "إرسال" (Submit) button.
 * Submit is always enabled (it does not reflect readiness), so readiness = every previous step
 * accepted by Next + every terms checkbox ticked.
 */
export class TermsStep extends WizardStep<void> {
  readonly name = 'الشروط والأحكام';

  get section(): Locator {
    return this.block('CommonComponents.TermsandConditions');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.section.getByRole('checkbox').first()).toBeVisible();
  }

  protected async fillStep(): Promise<void> {
    this.record('الموافقة على الشروط والأحكام', (await checkAll(this.section)) ? 'filled' : 'kept');
    await expect(this.section.getByRole('checkbox', { checked: false })).toHaveCount(0);
  }
}

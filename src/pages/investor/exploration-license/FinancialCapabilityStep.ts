import { expect, Locator } from '@playwright/test';
import { ExplorationLicenseData } from '@data/exploration-license.data';
import { fillIfEmpty, uploadIfEmpty } from '@utils/field-helper';
import { WizardStep } from './WizardStep';

/** Checkbox order on the screen (VERIFIED on TEST); the checkboxes have no accessible names. */
const PROOF_TYPES = ['الشهادة البنكية', 'كشف الحساب البنكي', 'خطاب تسهيلات', 'القوائم المالية'] as const;

/**
 * Step 4 — "إثبات القدرة المالية" (proof of financial capability).
 *
 * Rules (TEST, 2026-10-26):
 *   - "يجب عليك تحديد مربع واحد على الأقل من مربعات الاختيار" — at least one proof type;
 *   - bank certificate / statement / facilities letter each reveal "الرصيد المتاح" + one attachment;
 *   - tooltip on the total: it must be ≥ the minimum annual exploration spend;
 *   - "القوائم المالية" (financial statements) instead asks for 3 years of availability and
 *     the articles of association — not automated (no verified data for it yet).
 */
export class FinancialCapabilityStep extends WizardStep<ExplorationLicenseData['financial'] & { attachment: string }> {
  readonly name = 'إثبات القدرة المالية';

  private get section(): Locator {
    return this.block('ProofofFinancialCapabilityFlow.ProofOfFinancialCapability');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.section.getByRole('checkbox')).toHaveCount(PROOF_TYPES.length);
  }

  protected async fillStep(d: ExplorationLicenseData['financial'] & { attachment: string }): Promise<void> {
    const boxes = this.section.getByRole('checkbox');
    if ((await this.section.getByRole('checkbox', { checked: true }).count()) === 0) {
      const index = PROOF_TYPES.indexOf(d.proofType as (typeof PROOF_TYPES)[number]);
      if (index < 0 || index === 3) {
        throw new Error(`Unsupported financial proof type "${d.proofType}". Use one of: ${PROOF_TYPES.slice(0, 3).join(' | ')}.`);
      }
      await boxes.nth(index).check();
      this.record(`نوع الإثبات = ${d.proofType}`, 'filled');
    } else {
      this.record('نوع الإثبات', 'kept');
    }
    if (await boxes.nth(3).isChecked()) {
      this.note('⚠ "القوائم المالية" is selected on this request — its fields are not automated; verify them manually.');
    }

    const balances = this.section.getByRole('spinbutton');
    await expect(balances.first()).toBeVisible();
    for (let i = 0; i < (await balances.count()); i++) {
      this.record(`الرصيد المتاح #${i + 1}`, await fillIfEmpty(balances.nth(i), d.availableBalance));
    }
    const slots = this.section.locator('[data-block$="UploadAttachment"]').filter({ visible: true });
    for (let i = 0; i < (await slots.count()); i++) {
      this.record(`المرفق #${i + 1}`, await uploadIfEmpty(slots.nth(i), d.attachment));
    }
  }
}

import { expect, Locator } from '@playwright/test';
import { checkAll, FillResult, fillIfEmpty, uploadIfEmpty } from '@utils/field-helper';
import { WizardStep } from '../exploration-license/WizardStep';

/**
 * Ticks every declaration of a section that has a "تطبيق على الكل" button.
 * VERIFIED on TEST (2026-10-30): "تطبيق على الكل" TOGGLES — on a reopened draft it UNticked the saved
 * declarations — so it is pressed only when something is unticked, and any leftover is ticked one by one.
 */
export async function tickDeclarations(section: Locator): Promise<FillResult> {
  const unticked = section.getByRole('checkbox', { checked: false });
  if ((await unticked.count()) === 0) return 'kept';
  await section.getByRole('button', { name: 'تطبيق على الكل', exact: true }).click();
  while ((await unticked.count()) > 0) await unticked.first().check();
  return 'filled';
}

/**
 * Transferee wizard step 2 — "موقع الرخصة" (blocks Steps_Flow.LicenseLocationStep_WB, ExplorationLocationFlow.LocationReservedView).
 * VERIFIED on TEST (2026-10-30, request 76352): read-only — "جميع البيانات المعروضة أدناه هي من الرخصة الأصلية،
 * ولا يمكن تعديلها في هذه المرحلة" (the original licence's coordinates). Next passes it unchanged.
 */
export class TransfereeLocationStep extends WizardStep<void> {
  readonly name = 'موقع الرخصة';

  async expectLoaded(): Promise<void> {
    await expect(this.block('ExplorationLocationFlow.LocationReservedView')).toBeVisible({ timeout: 60_000 });
  }

  protected async fillStep(): Promise<void> {
    this.note('Location comes from the original licence and is read-only — passed unchanged.');
  }
}

/** Proof type label → checkbox id suffix (VERIFIED on TEST, request 76352). */
const PROOF_CHECKBOXES: Record<string, string> = {
  'الشهادة البنكية': 'CheckboxBankCertificate',
  'كشف الحساب البنكي': 'CheckboxBankStatement',
  'خطاب تسهيلات': 'CheckboxBankFacilitiesLetter',
};

export interface TransfereeFinancialData {
  /** One of: الشهادة البنكية | كشف الحساب البنكي | خطاب تسهيلات ("القوائم المالية" is not automated). */
  readonly proofType: string;
  /** "الرصيد المتاح" — must cover the minimum spend of licence years 1–2 (TP-16992). */
  readonly availableBalance: string;
  readonly attachment: string;
}

/**
 * Transferee wizard step 4 — "إثبات القدرة المالية" (block Steps_Flow.ProofOfFinancialCapability_WB, TP-16992).
 * VERIFIED on TEST (request 76352): four checkboxes [id$=CheckboxBankCertificate | CheckboxBankStatement |
 * CheckboxBankFacilitiesLetter | CheckboxFinancialStatements]; ticking one reveals its balance + supporting document.
 */
export class TransfereeFinancialStep extends WizardStep<TransfereeFinancialData> {
  readonly name = 'إثبات القدرة المالية';

  private get root(): Locator {
    return this.block('Steps_Flow.ProofOfFinancialCapability_WB');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.root.locator('input[id$="CheckboxBankStatement"]')).toBeVisible({ timeout: 60_000 });
  }

  protected async fillStep(d: TransfereeFinancialData): Promise<void> {
    const suffix = PROOF_CHECKBOXES[d.proofType];
    if (!suffix) throw new Error(`Unsupported financial proof type "${d.proofType}". Use one of: ${Object.keys(PROOF_CHECKBOXES).join(' | ')}.`);
    if ((await this.root.getByRole('checkbox', { checked: true }).count()) > 0) {
      this.record('نوع الإثبات', 'kept');
    } else {
      await this.root.locator(`input[id$="${suffix}"]`).check();
      this.record(`نوع الإثبات = ${d.proofType}`, 'filled');
    }
    // Each ticked proof reveals [id$=Input_Balance<Type>] "الرصيد المتاح" and a ProofofFinancialCapabilityFlow.NewUploadAttachment.
    const balances = this.root.locator('input[id*="Input_Balance"]').filter({ visible: true });
    await expect(balances.first(), 'Balance field revealed by the proof type').toBeVisible();
    for (let i = 0; i < (await balances.count()); i++) {
      this.record(`الرصيد المتاح #${i + 1}`, await fillIfEmpty(balances.nth(i), d.availableBalance));
    }
    const slots = this.root.locator('[data-block$="UploadAttachment"]').filter({ visible: true });
    for (let i = 0; i < (await slots.count()); i++) this.record(`المرفق #${i + 1}`, await uploadIfEmpty(slots.nth(i), d.attachment));
  }
}

export interface TransfereeSocialImpactData {
  /** Community-performance employee (TP-16993): name alphabetic ≤100, ID 10 digits starting 1, position alphabetic,
   *  mobile starting 05 (max 10 digits), email ≤100. */
  readonly employee: { readonly name: string; readonly nationalId: string; readonly position: string; readonly mobile: string; readonly email: string };
  /** Mandatory letter (≤50 MB). */
  readonly attachment: string;
}

/**
 * Transferee wizard step 5 — "دراسة الأثر الاجتماعي" (block Steps_Flow.SocialImpact_WB, TP-16993).
 * The licence's social-impact plans (SocialImpact.* blocks) are READ-ONLY. Editable (VERIFIED on TEST, request 76352):
 * [id$=Input_Assignedemployee] اسم المكلف, [id$=Input_IdentityNumber] رقم الهوية, [id$=Input_Position] الوظيفة,
 * [id$=Input_PhoneNumber] رقم الجوال, [id$=Input_Email] البريد الالكتروني + one CommonUploader (the letter).
 */
export class TransfereeSocialImpactStep extends WizardStep<TransfereeSocialImpactData> {
  readonly name = 'دراسة الأثر الاجتماعي';

  private get root(): Locator {
    return this.block('Steps_Flow.SocialImpact_WB');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.root.locator('input[id$="Input_Assignedemployee"]')).toBeVisible({ timeout: 60_000 });
  }

  protected async fillStep(d: TransfereeSocialImpactData): Promise<void> {
    const fields: [string, string, string][] = [
      ['اسم المكلف', 'Input_Assignedemployee', d.employee.name],
      ['رقم الهوية', 'Input_IdentityNumber', d.employee.nationalId],
      ['الوظيفة', 'Input_Position', d.employee.position],
      ['رقم الجوال', 'Input_PhoneNumber', d.employee.mobile],
      ['البريد الالكتروني', 'Input_Email', d.employee.email],
    ];
    for (const [label, id, value] of fields) this.record(label, await fillIfEmpty(this.root.locator(`input[id$="${id}"]`), value));
    const letter = this.root.locator('[data-block="LicensesCommonUploader.CommonUploader"]').filter({ visible: true }).first();
    this.record('خطاب المكلف (attachment)', await uploadIfEmpty(letter, d.attachment));
  }
}

/**
 * Transferee wizard step 6 — "دراسة الأثر البيئي" (block Steps_Flow.EnvironmentalImpactStudy_WB, TP-16998).
 * The original impacts are READ-ONLY; the ten applicant obligations (EnvironmentalImpactStudy_Flow.ApplicantObligations_WB,
 * "تطبيق على الكل") are mandatory (VERIFIED on TEST, request 76352).
 */
export class TransfereeEnvironmentalStep extends WizardStep<void> {
  readonly name = 'دراسة الأثر البيئي';

  private get obligations(): Locator {
    return this.block('EnvironmentalImpactStudy_Flow.ApplicantObligations_WB');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.obligations.getByRole('checkbox').first()).toBeVisible({ timeout: 60_000 });
  }

  protected async fillStep(): Promise<void> {
    this.record('التزامات مقدم الطلب', await tickDeclarations(this.obligations));
  }
}

/** Transferee wizard step 7 — "المرفقات" (TP-16999): optional named attachments; none are added. */
export class TransfereeAttachmentsStep extends WizardStep<void> {
  readonly name = 'المرفقات';

  async expectLoaded(): Promise<void> {
    await expect(this.page.locator('[role=tab].wizard-wrapper-item.active[aria-label="المرفقات"]')).toBeVisible({ timeout: 60_000 });
  }

  protected async fillStep(): Promise<void> {
    this.note('Additional attachments are optional — none added.');
  }
}

/**
 * Transferee wizard step 8 — "الشروط والأحكام" (block Steps_Flow.TermsandConditions_WB): three mandatory
 * undertakings (VERIFIED on TEST, request 76352). Legal attestations — authorised for TEST runs.
 */
export class TransfereeTermsStep extends WizardStep<void> {
  readonly name = 'الشروط والأحكام';

  private get root(): Locator {
    return this.block('Steps_Flow.TermsandConditions_WB');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.root.getByRole('checkbox').first()).toBeVisible({ timeout: 60_000 });
  }

  protected async fillStep(): Promise<void> {
    this.record('الشروط والأحكام', (await checkAll(this.root)) ? 'filled' : 'kept');
    await expect(this.root.getByRole('checkbox', { checked: false })).toHaveCount(0);
  }
}

export interface TransfereeWorkPlanData {
  /** "مبررات التحويل" — required, max 2,000 characters. */
  readonly transferJustifications: string;
  /** Updated Rehabilitation & Closure Plan ("مرفق خطة إعادة التأهيل والإغلاق المحدثة") — required. */
  readonly attachment: string;
}

/**
 * Transferee wizard step 3 — "خطة العمل والإنفاق" (block Steps_Flow.WorkPlan_WB, story TP-16991).
 * The original work plan is shown READ-ONLY. Editable (VERIFIED on TEST, request 76352):
 *   - checkboxes [id$=Checkbox_ExperienceInsideKSA] / [id$=Checkbox_ExperienceinOutsideKSA] — left unticked
 *     (outside-KSA experience would require a description);
 *   - textarea [id$=TextArea_TransferJustifications] "مبررات التحويل";
 *   - WorkPlan_Flow.WorkPlanAttachments_WB: uploader [id$=UpdatedRehabilitationandClosurePlan] "مرفق خطة إعادة التأهيل
 *     والإغلاق المحدثة" (mandatory) and [id$=AdditionalMinistryRequirements] "متطلبات إضافية من الوزارة" (optional, not used);
 *   - WorkPlan_Flow.ApplicantsDeclaration_WB: five declarations + "تطبيق على الكل".
 */
export class TransfereeWorkPlanStep extends WizardStep<TransfereeWorkPlanData> {
  readonly name = 'خطة العمل والإنفاق';

  private get root(): Locator {
    return this.block('Steps_Flow.WorkPlan_WB');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.root.locator('textarea[id$="TextArea_TransferJustifications"]')).toBeVisible({ timeout: 60_000 });
  }

  protected async fillStep(d: TransfereeWorkPlanData): Promise<void> {
    this.record('مبررات التحويل', await fillIfEmpty(this.root.locator('textarea[id$="TextArea_TransferJustifications"]'), d.transferJustifications));
    this.record('مرفق خطة إعادة التأهيل والإغلاق المحدثة', await uploadIfEmpty(this.page.locator('[id$="UpdatedRehabilitationandClosurePlan"]'), d.attachment));
    this.record('التصريحات', await tickDeclarations(this.block('WorkPlan_Flow.ApplicantsDeclaration_WB')));
  }
}

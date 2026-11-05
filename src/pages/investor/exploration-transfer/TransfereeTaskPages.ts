import path from 'path';
import { expect, Locator, Page } from '@playwright/test';
import { Wizard } from '@components/Wizard';
import { ExplorationTransferData } from '@data/exploration-transfer.data';
import { checkRadioByLabel } from '@utils/field-helper';
import { trackServerActivity } from '@utils/os-waits';
import { WizardValidationError, splitRules } from '@utils/validation';
import { BasePage } from '../../BasePage';
import { StepReport } from '../exploration-license/WizardStep';
import { TransfereeLicenseInfoStep } from './TransfereeLicenseInfoStep';
import {
  TransfereeAttachmentsStep,
  TransfereeEnvironmentalStep,
  TransfereeFinancialStep,
  TransfereeLocationStep,
  TransfereeSocialImpactStep,
  TransfereeTermsStep,
  TransfereeWorkPlanStep,
  tickDeclarations,
} from './TransfereeSteps';

/** Success dialog of the transfer screens: "… بنجاح … رقم الطلب #<n>" (VERIFIED on TEST). Returns its text. */
async function successMessage(page: Page, feedback: BasePage['feedback'], timeout = 90_000): Promise<string> {
  const success = page.getByRole('dialog').filter({ visible: true }).filter({ hasText: /رقم الطلب\s*#\s*\d+/ });
  const errors = feedback.of('error').filter({ visible: true });
  await expect(success.or(errors).first()).toBeVisible({ timeout });
  if (await errors.count()) throw new Error((await errors.allInnerTexts()).join(' | '));
  return (await success.first().innerText()).replace(/\s+/g, ' ').trim();
}

/**
 * Transferee To-Do "مراجعة طلب تحويل رخصة كشف" — /Licenses_Exploration_Transfer/InvestorToDo?In_Request_Id=<n>&In_StepType=329.
 *
 * VERIFIED on TEST (2026-10-30, request 76352): shows the request, the transferor company and the licence;
 * "الرد على الطلب" radios "قبول الطلب" / "رفض الطلب"; accepting reveals two obligations + "تطبيق على الكل";
 * "إرسال الطلب" → success "تم الموافقة على طلب تحويل رخصة الكشف، يرجى تقديم نماذج التحويل في غضون 30 يومًا … رقم الطلب #<n>".
 * TRAP: a choice made before the page's data load settles is reset — wait for the server to go quiet first.
 */
export class TransfereeReviewPage extends BasePage {
  constructor(page: Page) {
    super(page, 'investor');
  }

  private get accept(): Locator {
    return this.page.locator('input[type=radio][id$="ApproveRecommendation-input"]');
  }

  async expectLoaded(requestNumber: string): Promise<void> {
    const activity = trackServerActivity(this.page);
    await this.page.waitForURL(new RegExp(`InvestorToDo\\?.*In_Request_Id=${requestNumber}(&|$)`), { timeout: 60_000 });
    await expect(this.accept).toBeAttached({ timeout: 60_000 });
    await activity.idle(2_000, 90_000);
  }

  /** Licence number shown on the invitation. */
  async licenseNumber(): Promise<string> {
    return this.page.locator('input[id$="Input_LicenseNumber"]').inputValue().catch(async () => (await this.page.locator('body').innerText()).match(/رقم الرخصة\s*(\d+)/)?.[1] ?? '');
  }

  /** "قبول الطلب" + obligations + "إرسال الطلب". Returns the success message. */
  async approve(): Promise<string> {
    await checkRadioByLabel(this.page.locator('body'), 'قبول الطلب');
    const obligations = this.page.locator('[role=tab]').filter({ has: this.page.getByRole('button', { name: 'تطبيق على الكل', exact: true }) }).last();
    await expect(obligations).toBeVisible();
    await tickDeclarations(obligations);
    const submit = this.page.getByRole('button', { name: 'إرسال الطلب', exact: true });
    await expect(submit).toBeEnabled();
    await submit.click();
    return successMessage(this.page, this.feedback);
  }
}

/**
 * Transferee To-Do "مراجعة شروط نظم المعلومات الجغرافية" (Review of GIS Terms, TP-17354) —
 * /Licenses_Exploration_Transfer/InvestorToDo?In_Request_Id=<n>&In_StepType=337.
 *
 * VERIFIED on TEST (2026-10-30, request 76354): original location (read-only), table "الشروط والأحكام"
 * (العدد · الشروط والأحكام), radios "قبول الشروط" / "رفض الشروط", "إلغاء" / "إرسال الرد". The terms come from
 * DataActionGetConditionsAndIssuance (data.Terms.List).
 * ⚠ On 76354 that list was EMPTY although the GIS task and the evaluation each saved a clause; the same response
 * carried IssuanceRequestId 76350 (the licence's original issuance request) — reported as a discrepancy.
 */
export class TransfereeGisTermsPage extends BasePage {
  private terms?: Promise<string[]>;

  constructor(page: Page) {
    super(page, 'investor');
  }

  /** Starts capturing the terms the screen loads — call BEFORE opening the To-Do task. */
  captureTerms(): void {
    this.terms = this.page
      .waitForResponse((r) => r.url().includes('/DataActionGetConditionsAndIssuance'), { timeout: 120_000 })
      .then(async (r) => {
        const list = (await r.json())?.data?.Terms?.List as unknown[] | undefined;
        return (list ?? []).map((t) => (typeof t === 'string' ? t : JSON.stringify(t)));
      })
      .catch(() => []);
  }

  async expectLoaded(requestNumber: string): Promise<void> {
    const activity = trackServerActivity(this.page);
    await this.page.waitForURL(new RegExp(`InvestorToDo\\?.*In_Request_Id=${requestNumber}(&|$)`), { timeout: 60_000 });
    await expect(this.page.getByRole('radio', { name: 'قبول الشروط' })).toBeAttached({ timeout: 120_000 });
    await activity.idle(2_000, 90_000);
  }

  /** Terms the screen received from the server (empty when none were loaded). */
  async loadedTerms(): Promise<string[]> {
    return this.terms ? this.terms : [];
  }

  /** "قبول الشروط" + "إرسال الرد". Returns the confirmation text (dialog) or the URL the page moved to. */
  async approveConditions(): Promise<string> {
    await checkRadioByLabel(this.page.locator('body'), 'قبول الشروط');
    const submit = this.page.getByRole('button', { name: 'إرسال الرد', exact: true });
    await expect(submit).toBeEnabled();
    const from = this.page.url();
    await submit.click();
    const dialog = this.page.getByRole('dialog').filter({ visible: true }).filter({ hasText: /بنجاح|رقم الطلب/ });
    const errors = this.feedback.of('error').filter({ visible: true });
    const outcome = await Promise.race([
      dialog.first().waitFor({ timeout: 120_000 }).then(async () => (await dialog.first().innerText()).replace(/\s+/g, ' ').trim()),
      this.page.waitForURL((u) => u.href !== from, { timeout: 120_000 }).then(() => `moved to ${this.page.url()}`),
      errors.first().waitFor({ timeout: 120_000 }).then(async () => { throw new Error((await errors.allInnerTexts()).join(' | ')); }),
    ]);
    return outcome;
  }
}

/** Editable fields of the social-impact correction task, by their label (VERIFIED on TEST, request 76362). */
const SOCIAL_IMPACT_FIELDS: Record<string, string> = {
  'اسم المكلف': 'Input_Assignedemployee',
  'رقم الهوية': 'Input_IdentityNumber',
  'الوظيفة': 'Input_Position',
  'رقم الجوال': 'Input_PhoneNumber',
  'البريد الالكتروني': 'Input_Email',
  // Financial correction To-Do "تقييم القدرة المالية" (StepType 334, VERIFIED on TEST request 76362).
  'الرصيد المتاح': 'Input_BalanceBankStatement',
};

export interface FieldChange {
  readonly field: string;
  readonly before: string;
  readonly after: string;
}

/**
 * Transferee rework To-Do "تقييم الأثر الإجتماعي" (Return to Transferee, social impact) —
 * /Licenses_Exploration_Transfer/InvestorToDo?In_Request_Id=<n>&In_StepType=345.
 *
 * VERIFIED on TEST (2026-10-31, request 76362): the social-impact employee fields (اسم المكلف, رقم الهوية, الوظيفة,
 * رقم الجوال, البريد الالكتروني) are editable and prefilled; the employee's evaluation is shown read-only
 * ([id$=Radio_Not_Met-input] checked, [id$=TextArea_Evaluation_Comment] with the return comment); "إرسال الطلب".
 */
export class TransfereeCorrectionPage extends BasePage {
  constructor(page: Page) {
    super(page, 'investor');
  }

  async expectLoaded(requestNumber: string): Promise<void> {
    const activity = trackServerActivity(this.page);
    await this.page.waitForURL(new RegExp(`InvestorToDo\\?.*In_Request_Id=${requestNumber}(&|$)`), { timeout: 60_000 });
    // Social-impact correction shows the employee fields; the financial one shows the balance.
    await expect(this.page.locator('input[id$="Input_Position"], input[id*="Input_Balance"]').first()).toBeVisible({ timeout: 120_000 });
    await activity.idle(2_000, 90_000);
  }

  /** The employee's read-only evaluation shown to the transferee. */
  async returnedEvaluation(): Promise<{ notMet: boolean; comment: string }> {
    return {
      notMet: await this.page.locator('input[type=radio][id$="Radio_Not_Met-input"]').isChecked(),
      comment: (await this.page.locator('textarea[id$="TextArea_Evaluation_Comment"]').first().inputValue()).trim(),
    };
  }

  /** Replaces the given fields (label → new value); returns before/after for each. */
  async correct(values: Readonly<Record<string, string>>): Promise<FieldChange[]> {
    const changes: FieldChange[] = [];
    for (const [field, after] of Object.entries(values)) {
      const id = SOCIAL_IMPACT_FIELDS[field];
      if (!id) throw new Error(`Correction field "${field}" is not on this task. Fields: ${Object.keys(SOCIAL_IMPACT_FIELDS).join(' | ')}`);
      const input = this.page.locator(`input[id$="${id}"]`);
      const before = (await input.inputValue()).trim();
      await input.fill(after);
      await input.blur();
      await expect(input, `"${field}" holds the corrected value`).toHaveValue(after);
      changes.push({ field, before, after });
    }
    return changes;
  }

  /** "إرسال الطلب" — resolves with the confirmation dialog text or the page it moved to. */
  async submit(): Promise<string> {
    const button = this.page.getByRole('button', { name: 'إرسال الطلب', exact: true });
    await expect(button).toBeEnabled();
    const from = this.page.url();
    await button.click();
    const dialog = this.page.getByRole('dialog').filter({ visible: true }).filter({ hasText: /بنجاح|رقم الطلب/ });
    const errors = this.feedback.of('error').filter({ visible: true });
    return Promise.race([
      dialog.first().waitFor({ timeout: 120_000 }).then(async () => (await dialog.first().innerText()).replace(/\s+/g, ' ').trim()),
      this.page.waitForURL((u) => u.href !== from, { timeout: 120_000 }).then(() => `moved to ${this.page.url()}`),
      errors.first().waitFor({ timeout: 120_000 }).then(async () => {
        throw new Error((await errors.allInnerTexts()).join(' | '));
      }),
    ]);
  }
}

/**
 * Transferee To-Do "معلومات إضافية" (Consolidated "إعادة للمحال إليه" + "طلب بيانات إضافية", TP-16316) —
 * /Licenses_Exploration_Transfer/InvestorToDo?In_Request_Id=<n>&In_StepType=310, block ToDo_Flow.Todo_Additional_Information.
 *
 * VERIFIED on TEST (2026-11-01, request 76386): header رقم الطلب / تاريخ المهمة / عدد الايام المتبقية (29 on day 1 → 30-day
 * SLA); "يرجى إضافة البيانات المطلوبة حسب إفادة الموظف أدناه"; read-only "وصف المعلومات الإضافية"
 * [id$=TextArea_Additional_InfoDescriptionOut] with the employee's request; a table "الوصف / المرفق" with one row per
 * requested attachment name, each with an uploader (ExplorationUploadAttachment_WB, "إضافة"); the transferee's
 * "الوصف" [id$=TextArea_InvestorDescription] (≤ 2,000); "إلغاء" / "إرسال الطلب".
 */
export class TransfereeAdditionalInfoPage extends TransfereeCorrectionPage {
  private get block(): Locator {
    return this.page.locator('[data-block="ToDo_Flow.Todo_Additional_Information"]');
  }

  override async expectLoaded(requestNumber: string): Promise<void> {
    const activity = trackServerActivity(this.page);
    await this.page.waitForURL(new RegExp(`InvestorToDo\\?.*In_Request_Id=${requestNumber}(&|$)`), { timeout: 60_000 });
    await expect(this.page.locator('textarea[id$="TextArea_InvestorDescription"]')).toBeVisible({ timeout: 120_000 });
    await activity.idle(2_000, 90_000);
  }

  /**
   * Rows of the "الوصف / المرفق" list — not a table: [id$=ListTable] holds Adaptive.Columns2 rows, Column1 = the
   * requested name (label), Column2 = its uploader (VERIFIED in the trace of 76386). The header row has no uploader.
   */
  private get rows(): Locator {
    return this.block
      .locator('[id$="ListTable"] [data-block="Adaptive.Columns2"]')
      .filter({ has: this.page.locator('[data-block="Common_NeedToMove.ExplorationUploadAttachment_WB"]') });
  }

  private async rowName(row: Locator): Promise<string> {
    return (await row.locator('[id$="-Column1"]').first().innerText()).trim();
  }

  /** What the employee asked for: the description and the requested attachment names. */
  async requested(): Promise<{ description: string; attachmentNames: string[] }> {
    const description = (await this.page.locator('textarea[id$="TextArea_Additional_InfoDescriptionOut"]').inputValue()).trim();
    const attachmentNames: string[] = [];
    for (let i = 0; i < (await this.rows.count()); i++) attachmentNames.push(await this.rowName(this.rows.nth(i)));
    return { description, attachmentNames };
  }

  /** Uploads `file` for every requested attachment and writes the transferee's description. Returns the names uploaded. */
  async provide(file: string, description: string): Promise<string[]> {
    const uploaded: string[] = [];
    for (let i = 0; i < (await this.rows.count()); i++) {
      const row = this.rows.nth(i);
      const slot = row.locator('[data-block="Common_NeedToMove.ExplorationUploadAttachment_WB"]');
      // Not uploadIfEmpty: in this uploader .dga-uploaded-file is present (and visible) in EMPTY rows too. An uploaded
      // row shows the green .esnad-success-fill + the file name, and its file input is gone; a file uploaded in an
      // earlier, unsubmitted session is not kept (all VERIFIED on TEST, 76386).
      const done = slot.locator('.esnad-success-fill');
      if ((await done.count()) === 0) {
        const activity = trackServerActivity(this.page);
        await slot.locator('input[type=file]').first().setInputFiles(path.resolve(process.cwd(), file));
        await activity.idle();
      }
      await expect(done.first(), `"${await this.rowName(row)}" shows an uploaded file`).toBeVisible({ timeout: 30_000 });
      uploaded.push(await this.rowName(row));
    }
    // VERIFIED on TEST (76386): filled right after the uploads, "الوصف" was empty again at "إرسال الطلب" (refused with
    // "يجب تعبئة جميع الحقول الإلزامية…") — let the uploads' refresh finish, then fill, leave the field and re-check.
    await trackServerActivity(this.page).idle(3_000, 60_000);
    const reply = this.page.locator('textarea[id$="TextArea_InvestorDescription"]');
    await reply.fill(description);
    await reply.blur();
    await trackServerActivity(this.page).idle(2_000, 30_000);
    await expect(reply, '"الوصف" holds the reply before submitting').toHaveValue(description);
    return uploaded;
  }
}

/**
 * Transferee To-Do "تقديم نماذج تحويل رخصة الكشف" — /Licenses_Exploration_Transfer/InvestorToDo?…&In_StepType=301:
 * the 8-step transferee wizard (TP-16241). Steps are dispatched by the wizard's own step name, so a renamed or
 * new step fails loudly instead of being filled with guessed data. VERIFIED end to end on TEST (request 76352).
 * The final button is "إرسال" (no -Submit id) and submits without a confirmation dialog.
 */
export class TransfereeWizardPage extends BasePage {
  readonly wizard: Wizard;

  constructor(page: Page) {
    super(page, 'investor');
    this.wizard = new Wizard(page);
  }

  async expectLoaded(requestNumber: string): Promise<void> {
    const activity = trackServerActivity(this.page);
    await this.page.waitForURL(new RegExp(`InvestorToDo\\?.*In_Request_Id=${requestNumber}(&|$)`), { timeout: 60_000 });
    await expect(this.wizard.nextButton).toBeVisible({ timeout: 60_000 });
    await activity.idle(2_000, 90_000);
  }

  private fillers(d: ExplorationTransferData): Record<string, () => Promise<StepReport>> {
    const w = d.transfereeWizard;
    const p = this.page;
    return {
      'معلومات الرخصة': () => new TransfereeLicenseInfoStep(p).fill({ geologists: w.geologists, consultant: w.consultant, attachment: d.attachment }),
      'موقع الرخصة': () => new TransfereeLocationStep(p).fill(),
      'خطة العمل والإنفاق': () => new TransfereeWorkPlanStep(p).fill({ transferJustifications: w.transferJustifications, attachment: d.attachment }),
      'إثبات القدرة المالية': () => new TransfereeFinancialStep(p).fill({ ...w.financial, attachment: d.attachment }),
      'دراسة الأثر الاجتماعي': () => new TransfereeSocialImpactStep(p).fill({ employee: w.socialImpactEmployee, attachment: d.attachment }),
      'دراسة الأثر البيئي': () => new TransfereeEnvironmentalStep(p).fill(),
      'المرفقات': () => new TransfereeAttachmentsStep(p).fill(),
      'الشروط والأحكام': () => new TransfereeTermsStep(p).fill(),
    };
  }

  /** Fills every step from the active one to the last, saving each with Next. */
  async fillAll(d: ExplorationTransferData): Promise<StepReport[]> {
    const fillers = this.fillers(d);
    const reports: StepReport[] = [];
    for (;;) {
      const name = await this.wizard.activeName();
      const fill = fillers[name];
      if (!fill) throw new Error(`Transferee wizard step "${name}" is not automated — inspect it and add a step object in TransfereeSteps.ts.`);
      reports.push(await fill());
      if ((await this.wizard.activeIndex()) === (await this.wizard.stepNames()).length - 1) return reports;
      const change = await this.wizard.next();
      if (!change.moved) throw new WizardValidationError(change.from, splitRules(change.errors));
    }
  }

  /** Final "إرسال" on the last step. Returns the success message ("… رقم الطلب #<n>"). */
  async submit(): Promise<string> {
    await this.page.getByRole('button', { name: 'إرسال', exact: true }).click();
    return successMessage(this.page, this.feedback);
  }
}

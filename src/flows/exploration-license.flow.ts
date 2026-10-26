import { assertMutationsAllowed } from '@config/index';
import { StepChange } from '@components/Wizard';
import { ExplorationLicenseData, explorationLicenseData } from '@data/exploration-license.data';
import { InvestorPortal } from '@pages/investor/InvestorPortal';
import { StepReport } from '@pages/investor/exploration-license/WizardStep';
import { createLogger } from '@utils/logger';
import { trackServerActivity } from '@utils/os-waits';
import { splitRules, WizardValidationError } from '@utils/validation';

const log = createLogger('Exploration License');
const navLog = createLogger('Navigation');
const validationLog = createLogger('Validation');

/**
 * Business flow: complete an EXISTING Exploration License draft, found by its request number.
 *
 *   openRequest → passUnchangedSteps (1–2, no edits) → fillCurrentStep / next … → (submit)
 *
 * Every step is dispatched by the wizard's own step name, so a renamed or new step fails
 * loudly ("needs exploration") instead of being filled with guessed data.
 */
export class ExplorationLicenseFlow {
  constructor(
    private readonly investor: InvestorPortal,
    private readonly data: ExplorationLicenseData = explorationLicenseData(),
  ) {}

  private get license() {
    return this.investor.explorationLicense;
  }

  private get wizard() {
    return this.license.wizard;
  }

  /** Portal page with the side menu, remembered so the Requests list can be reopened later. */
  private portalHomeUrl?: string;

  /** Requests list → exact request number → "تعديل" → wizard loaded on step 1. */
  async openRequest(requestNumber: string): Promise<{ status: string; steps: string[] }> {
    const requests = this.investor.requests;
    this.portalHomeUrl = this.investor.page.url();
    await requests.open();
    await requests.find(requestNumber);
    const status = await requests.cell(requestNumber, 'الحالة');
    const type = await requests.cell(requestNumber, 'نوع الطلب');
    log.info(`Request ${requestNumber} found — type "${type}", status "${status}"`);
    await requests.rowAction(requestNumber, 'تعديل');
    await this.license.expectLoaded(requestNumber);
    await this.wizard.expectActive(0);
    const steps = await this.wizard.stepNames();
    log.info(`Wizard steps: ${steps.map((s, i) => `${i + 1}.${s}`).join(' | ')}`);
    return { status, steps };
  }

  async currentStepName(): Promise<string> {
    return this.wizard.activeName();
  }

  async isOnLastStep(): Promise<boolean> {
    return (await this.wizard.activeIndex()) === (await this.wizard.stepNames()).length - 1;
  }

  /** Clicks Next; when the app refuses, fails with the app's own reasons (never bypasses them). */
  async next(): Promise<StepChange> {
    const change = await this.wizard.next();
    if (!change.moved) {
      const rules = splitRules(change.errors);
      rules.forEach((r) => validationLog.warn(r));
      throw new WizardValidationError(change.from, rules);
    }
    navLog.info(`"${change.from}" saved → "${change.to}" loaded successfully`);
    return change;
  }

  /** Steps 1..count: Next without touching any field. */
  async passUnchangedSteps(count = 2): Promise<string[]> {
    const passed: string[] = [];
    for (let i = 0; i < count; i++) {
      const name = await this.currentStepName();
      log.info(`Wizard: ${name} (unchanged)`);
      await this.next();
      passed.push(name);
    }
    return passed;
  }

  /** Fills the active step with the configured data; returns what was filled vs kept. */
  async fillCurrentStep(): Promise<StepReport> {
    const name = await this.currentStepName();
    log.info(`Wizard: ${name}`);
    const l = this.license;
    const d = this.data;
    const fillers: Record<string, () => Promise<StepReport>> = {
      [l.workPlan.name]: () => l.workPlan.fill({ ...d.workPlan, attachment: d.attachment }),
      [l.financialCapability.name]: () => l.financialCapability.fill({ ...d.financial, attachment: d.attachment }),
      [l.socialImpact.name]: () => l.socialImpact.fill({ ...d.socialImpact, attachment: d.attachment }),
      [l.environmentalImpact.name]: () => l.environmentalImpact.fill(d.environmentalImpact),
      [l.attachments.name]: () => l.attachments.fill(),
      [l.terms.name]: () => l.terms.fill(),
    };
    const fill = fillers[name];
    if (!fill) {
      throw new Error(
        `Wizard step "${name}" is not automated — it was not present when the wizard was explored. ` +
          `Inspect it and add a step object under src/pages/investor/exploration-license/.`,
      );
    }
    return fill();
  }

  /** Draft → steps 1–2 unchanged → steps 3–8 filled → stops on the last step. */
  async completeDraft(requestNumber: string): Promise<StepReport[]> {
    await this.openRequest(requestNumber);
    await this.passUnchangedSteps(2);
    const reports: StepReport[] = [];
    for (;;) {
      reports.push(await this.fillCurrentStep());
      if (await this.isOnLastStep()) return reports;
      await this.next();
    }
  }

  /** Presses the final "إرسال". Only call when ALLOW_SUBMIT=true. Returns the toasts it raised. */
  async submit(): Promise<string[]> {
    assertMutationsAllowed('Submit Exploration License request');
    const feedback = this.license.feedback;
    const baseline = await feedback.count();
    const errorsBefore = await feedback.of('error').count();
    const activity = trackServerActivity(this.license.page);
    await this.wizard.submitButton.click();
    await activity.idle();
    const messages = await feedback.textsSince(baseline);
    messages.forEach((m) => log.info(`Submit response: ${m}`));
    // A rejected submit stays on the page with an error toast, e.g. (TEST, request 76092):
    // "حدث خطأ يتعلق بالموقع، يرجى تحديث إحداثيات الخريطة للمتابعة" — invalid map location (step 2).
    const errors = (await feedback.of('error').allInnerTexts()).slice(errorsBefore).map((t) => t.trim());
    if (errors.length) {
      errors.forEach((e) => validationLog.warn(`Submit rejected: ${e}`));
      throw new WizardValidationError('إرسال (Submit)', errors);
    }
    return messages;
  }

  /**
   * Re-reads the request's status in the Requests list. VERIFIED on TEST (request 76096):
   * Submit shows no toast; the proof is the list — status leaves "مسودة" (draft), e.g.
   * "الموقع قيد المراجعة", and "تاريخ تقديم الطلب" gets the submission time.
   */
  async statusInList(requestNumber: string): Promise<{ status: string; submittedAt: string }> {
    if (!this.portalHomeUrl) throw new Error('openRequest() must run first.');
    await this.investor.page.goto(this.portalHomeUrl);
    const requests = this.investor.requests;
    await requests.open();
    await requests.find(requestNumber);
    const status = await requests.cell(requestNumber, 'الحالة');
    const submittedAt = await requests.cell(requestNumber, 'تاريخ تقديم الطلب');
    log.info(`Request ${requestNumber} status after submit: "${status}" (submitted ${submittedAt})`);
    return { status, submittedAt };
  }
}

import fs from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import { assertMutationsAllowed, readNumber, readVar } from '@config/index';
import { ExplorationTransferData, maskCR, TransferScenario, TransferScenarioKey } from '@data/exploration-transfer.data';
import { EmployeePortal } from '@pages/employee/EmployeePortal';
import { EmployeeTask, OPEN_TASK_STATUSES } from '@pages/employee/TaskManagementPage';
import { TransferTaskManagementPage, TransferTaskResponsePage } from '@pages/employee/TransferTaskResponsePage';
import { InvestorPortal } from '@pages/investor/InvestorPortal';
import { LicensesPage } from '@pages/investor/LicensesPage';
import { PaymentPage } from '@pages/investor/PaymentPage';
import { ToDoListPage } from '@pages/investor/ToDoListPage';
import { StepReport } from '@pages/investor/exploration-license/WizardStep';
import { TransferRequestPage } from '@pages/investor/exploration-transfer/TransferRequestPage';
import { FieldChange, TransfereeAdditionalInfoPage, TransfereeCorrectionPage, TransfereeGisTermsPage, TransfereeReviewPage, TransfereeWizardPage } from '@pages/investor/exploration-transfer/TransfereeTaskPages';
import { TransferPaymentPage } from '@pages/investor/exploration-transfer/TransferPaymentPage';
import { PaymentNotificationPage } from '@pages/test-utils/PaymentNotificationPage';
import { createLogger } from '@utils/logger';
import { WizardValidationError } from '@utils/validation';
import { PaidBill, UnsupportedTaskError } from './approval-workflow.flow';

const log = {
  workflow: createLogger('Transfer'),
  transferor: createLogger('Transferor'),
  transferee: createLogger('Transferee'),
  employee: createLogger('Employee'),
  payment: createLogger('Payment'),
};

/** Statuses after which nothing more can happen. */
const DEAD_STATUSES = [/ملغي/, /مرفوض/, /مسحوب/];
/** End state of a completed transfer (VERIFIED on TEST: earlier transfers 76264/76265, 76315/76316). EXPECTED_FINAL_STATUS overrides. */
const COMPLETED_STATUS = 'مكتمل';
/** Investor payment tasks: "الدفع" (VERIFIED on TEST for transfers, e.g. 75636) and fee tasks "رسوم …". */
const PAYMENT_TASK = /الدفع|رسوم/;
/** Fee of both transfer payments per the service documentation (TP-16306, TP-16328). */
const EXPECTED_FEE = 10_000;
/** Consolidated Feedback decision that sends the request back to the transferee (rework). */
const RETURN_TO_TRANSFEREE = 'إعادة للمحال إليه';
/** Employee-return round (rework.employeeReturn) decisions — also the keys of its stage transitions. */
const RETURN_TO_EMPLOYEE = 'إعادة للموظف السابق';
const FINANCIAL_NOT_MET = 'لم تتحقق المتطلبات (financial)';
const RETURN_FINANCIAL_TO_TRANSFEREE = 'إعادة للمحال إليه (financial)';
const FINANCIAL_REASSESSED = 'financial reassessed';
/** SADAD biller code of both transfer payments (documentation; VERIFIED "#116" on TEST). */
const SADAD_BILLER_CODE = '116';
/** Consolidated Feedback task (TP-16316). */
const CONSOLIDATED = 'المراجعة العامة';
/** Consolidated "إعادة للمحال إليه" with "طلب بيانات إضافية" (returnChain.additionalInfo). */
const ADDITIONAL_INFO = 'إعادة للمحال إليه + طلب بيانات إضافية';
/** Prefix of the decisions made by the return chain (scenario.returnChain). */
const CHAIN_RETURN = 'return chain';
/**
 * Documented return routes (service documentation §7.1 GIS Review, §9.1 Financial Review, §10 review + approval chain):
 * task → the task the request goes back to. "المراجعة العامة" returns to the branches it selects (§9.2).
 * Return labels VERIFIED on TEST: reviews "إعادة للموظف السابق", levels 3–5 "إعادة لموظف موافقة مستوى الأول".
 */
const RETURN_ROUTES: Record<string, string> = {
  'مراجعة نظم المعلومات الجغرافية': 'نظم المعلومات الجغرافية',
  'مراجعة تقييم القدرة المالية': 'تقييم القدرة المالية',
  'المراجعة المبدئية': CONSOLIDATED,
  'التقييم النهائي': 'المراجعة المبدئية',
  'موافقة المستوى الاول': 'التقييم النهائي',
  'موافقة المستوى الثاني': 'موافقة المستوى الاول',
  'موافقة المستوى الثالث': 'موافقة المستوى الاول',
  'موافقة المستوى الرابع': 'موافقة المستوى الاول',
  'موافقة المستوى الخامس': 'موافقة المستوى الاول',
};

/** Investor To-Do task types of the transfer (VERIFIED on TEST, request 76352). */
export const TRANSFEREE_TASKS = {
  review: 'مراجعة طلب تحويل رخصة كشف',
  wizard: 'تقديم نماذج تحويل رخصة الكشف',
  gisTerms: 'مراجعة شروط نظم المعلومات الجغرافية',
  /** Rework: social impact returned by Consolidated Feedback ("إعادة للمحال إليه"). */
  socialImpactCorrection: 'تقييم الأثر الإجتماعي',
  /** Rework: financial capability returned to the transferee (StepType 334). */
  financialCorrection: 'تقييم القدرة المالية',
  /** Consolidated "طلب بيانات إضافية" (StepType 310, VERIFIED on TEST, request 76386). */
  additionalInfo: 'معلومات إضافية',
} as const;
/** The transferee's reply to the additional-information request ("الوصف" on "معلومات إضافية"). */
const ADDITIONAL_INFO_REPLY = 'تم إرفاق المستندات الإضافية المطلوبة - اختبار آلي';

export type Party = 'transferor' | 'transferee';

/** Raised by STOP_BEFORE_TASK: the run stops (state saved) so the task can be inspected manually; re-run to resume. */
export class WorkflowPausedError extends Error {
  constructor(requestNumber: string, task: string) {
    super(
      `Paused before employee task "${task}" on request ${requestNumber} (STOP_BEFORE_TASK) — nothing was assigned or ` +
        'submitted. Check the request manually, then re-run the same command without STOP_BEFORE_TASK to continue.',
    );
    this.name = 'WorkflowPausedError';
  }
}

export interface TransferBill extends PaidBill {
  readonly payer: Party;
}

export interface ChainReturn {
  /** Task that sent the request back, and the return decision it chose. */
  from: string;
  decision: string;
  /** Unique per return, so the next handler's "سجل الطلب" can be checked for exactly this one. */
  description: string;
  at: string;
  /** Documented next task(s) (RETURN_ROUTES, or the branches selected on "المراجعة العامة"). */
  expectedNext: string[];
  /** Open employee tasks seen after the return, and whether they include every documented one. */
  openedNext?: string[];
  routedAsDocumented?: boolean;
  /** Each next handler: did "سجل الطلب" show this return's description? */
  seenBy?: { task: string; shown: boolean }[];
}

export interface TransferContext {
  scenario: TransferScenarioKey;
  licenseNumber: string;
  /** Masked — the full CR stays in the configuration only. */
  transfereeCR: string;
  requestNumber: string;
  bills: TransferBill[];
  handledTasks: { actor: Party | 'employee'; task: string; decision: string; comment?: string; at: string }[];
  /** Task Management rows seen for the request, round by round (task → status). */
  employeeTaskLog: { at: string; tasks: { task: string; status: string }[] }[];
  /** Second rework round (rework.employeeReturn): its stage, and the transferee's financial correction. */
  employeeReturn?: {
    stage: 'returnedToEmployee' | 'ratedNotMet' | 'returnedToTransferee' | 'corrected' | 'verified';
    changes?: FieldChange[];
  };
  /** Rework: one entry per completed return to the transferee (what was returned and what the transferee changed). */
  reworkReturns: {
    returnedAt: string;
    section: string;
    /** Transferee correction: each field's value before and after. */
    changes?: FieldChange[];
    correctedAt?: string;
    /** True once the employee's reassessment showed the corrected values. */
    verified?: boolean;
  }[];
  /** Return chain: one entry per return to a previous employee, with where it went and who saw it. */
  chainReturns: ChainReturn[];
  /** Return chain: configured returns the task did not offer (reported as discrepancies, then approved). */
  chainReturnsNotOffered: { task: string; options: string[]; at: string }[];
  /**
   * Return chain: "سجل الردود" read on the LAST approval task (Level 5) before it answers — a completed request is no
   * longer listed in Task Management (VERIFIED on TEST, 76386 / 76352), so it cannot be read afterwards.
   */
  responseLog?: { task: string; decision: string; comment: string }[];
  /** Return chain: Consolidated's request for additional information to the transferee, and how far it got. */
  additionalInfo?: { stage: 'requested' | 'provided' | 'reviewed'; requestedAt: string; transfereeTask?: string };
  wizardReport?: StepReport[];
  /** Conditioned land: terms the transferee's "مراجعة شروط نظم المعلومات الجغرافية" screen received. */
  gisTermsShown?: string[];
  finalStatus?: string;
  /** Licence status in each company's licence list ("الرخص") after completion; undefined = not listed. */
  ownership?: { transferorStatus?: string; transfereeStatus?: string; checkedAt: string };
}

/**
 * Exploration License TRANSFER — drives one transfer from the transferor's request to the licence changing owner.
 *
 *   submitTransferorRequest()  transferor: Requests → "طلب جديد" → "تحويل رخصة الكشف" → configured licence + CR → submit
 *   run()                      every round handles exactly ONE pending task, looking in this order at
 *                                1. Task Management (employee) — any open task of the request
 *                                2. transferee To-Do — invitation review, 8-step wizard, transfer fee
 *                                3. transferor To-Do — application fee
 *                              until the request is "مكتمل" (or a dead status / an unsupported task).
 *   verifyOwnership()          licence list of each company: transferor "محولة", transferee "فعال"
 *
 * STATE-DRIVEN, so parallel employee tasks are handled in whatever order they appear, and a re-run resumes
 * where the request is. Decisions are chosen from the options a task offers, by label; an option set that is
 * not covered stops the run with UnsupportedTaskError (nothing submitted). Every employee answer is checked:
 * the task must leave the open list. State lives in .workflow-state/transfer-<scenario>-<licence>.json.
 */
export class ExplorationTransferWorkflow {
  readonly context: TransferContext;
  private readonly stateFile: string;

  constructor(
    private readonly transferor: InvestorPortal,
    private readonly transferee: InvestorPortal,
    private readonly employee: EmployeePortal,
    private readonly data: ExplorationTransferData & { scenario: TransferScenario },
    scenarioKey: TransferScenarioKey,
  ) {
    const s = data.scenario;
    this.stateFile = path.resolve('.workflow-state', `transfer-${scenarioKey}-${s.licenseNumber}.json`);
    const saved = fs.existsSync(this.stateFile) ? (JSON.parse(fs.readFileSync(this.stateFile, 'utf8')) as TransferContext) : undefined;
    // A finished transfer is never resumed: its licence has moved, so a new run starts from scratch (and fails
    // clearly if the transferor no longer owns the configured licence).
    const resumable = saved && !saved.finalStatus;
    this.context = resumable
      ? saved
      : { scenario: scenarioKey, licenseNumber: s.licenseNumber, transfereeCR: maskCR(s.transfereeCR), requestNumber: '', bills: [], handledTasks: [], employeeTaskLog: [], reworkReturns: [], chainReturns: [], chainReturnsNotOffered: [] };
    this.context.reworkReturns ??= []; // state files written before rework support
    this.context.chainReturns ??= [];
    this.context.chainReturnsNotOffered ??= [];
    const forced = readVar('TRANSFER_REQUEST_NUMBER');
    if (forced) this.context.requestNumber = forced;
  }

  /** Rework settings while returns to the transferee are still due (one per rework.returns entry), else undefined. */
  private reworkDue(): TransferScenario['rework'] | undefined {
    const rework = this.scenario.rework;
    return rework && this.context.reworkReturns.length < rework.returns.length ? rework : undefined;
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    fs.writeFileSync(this.stateFile, JSON.stringify(this.context, null, 2));
  }

  private get rn(): string {
    return this.context.requestNumber;
  }

  private get scenario(): TransferScenario {
    return this.data.scenario;
  }

  private record(actor: Party | 'employee', task: string, decision: string, comment?: string): void {
    this.context.handledTasks.push({ actor, task, decision, ...(comment ? { comment } : {}), at: new Date().toISOString() });
    this.save();
  }

  /** Bill of `payer` (application fee = transferor, transfer fee = transferee). */
  bill(payer: Party): TransferBill | undefined {
    return this.context.bills.find((b) => b.payer === payer);
  }

  // ---------------------------------------------------------------- transferor request

  private async home(investor: InvestorPortal): Promise<void> {
    await investor.page.goto(new URL('Redirect', investor.requests.urls.appBaseUrl).toString());
  }

  /** Stage 1 — skipped when this scenario already has a request in progress (resume). Returns the request number. */
  async submitTransferorRequest(): Promise<string> {
    if (this.rn) {
      log.transferor.info(`Scenario "${this.context.scenario}" already has request ${this.rn} in progress — resuming it`);
      return this.rn;
    }
    assertMutationsAllowed('Submit Exploration License Transfer request');
    const s = this.scenario;
    const requests = this.transferor.requests;
    await this.home(this.transferor);
    await requests.open();
    await requests.startNewRequest('تحويل رخصة الكشف');
    const form = new TransferRequestPage(this.transferor.page);
    await form.expectLoaded();
    await form.selectLicense(s.licenseNumber);
    log.transferor.info(`Licence selected: ${await form.licenseDetails()}`);
    if (s.subsidiary) await form.setSubsidiary(true);
    if (s.equipmentOnSite) await form.setEquipmentOnSite(true);
    const company = await form.inquireTransferee(s.transfereeCR);
    expect(company.crNumber, 'Transferee resolved by "استعلام" has the configured CR').toBe(s.transfereeCR);
    log.transferor.info(`Transferee resolved: ${company.name} (CR ${maskCR(company.crNumber)})`);
    await form.upload('اتفاقية التحويل', this.data.attachment);
    await form.upload('إقرار القبول', this.data.attachment);
    if (s.equipmentOnSite) await form.upload('اتفاقية مبايعة المعدات/الآلات', this.data.attachment);
    await form.acknowledgeObligations();
    this.context.requestNumber = await form.submit();
    this.save();
    log.transferor.info(`Transfer request submitted — request number ${this.rn}`);
    return this.rn;
  }

  // ---------------------------------------------------------------- investor To-Do

  private async todo(investor: InvestorPortal): Promise<ToDoListPage> {
    await this.home(investor);
    const todo = new ToDoListPage(investor.page);
    await todo.open();
    return todo;
  }

  /** To-Do tasks of the request; the list can render after the search returns, so an empty answer is re-read once. */
  private async investorTasks(investor: InvestorPortal): Promise<{ todo: ToDoListPage; tasks: string[] }> {
    const todo = await this.todo(investor);
    let tasks = await todo.search(this.rn);
    if (!tasks.length) {
      await investor.page.waitForTimeout(2_000);
      tasks = await todo.search(this.rn);
    }
    return { todo, tasks: tasks.map((t) => t.taskType) };
  }

  private async pay(investor: InvestorPortal, payer: Party, todo: ToDoListPage, taskType: string): Promise<void> {
    const which = payer === 'transferor' ? 'Application Fees (transferor)' : 'Transfer Fee (transferee)';
    const page = investor.page;
    const paymentData = TransferPaymentPage.capturePaymentData(page);
    await todo.openTask({ requestNumber: this.rn, taskType });
    // Transfer payments open the transfer module's own page (VERIFIED for the application fee); the shared
    // DoPayment page is still supported in case a payment task uses it.
    await page.waitForURL((u) => /DoPayment\?/.test(u.href) || TransferPaymentPage.isTransferPaymentUrl(u.href), { timeout: 60_000 });
    let bill: { billId: string; amount: number; description: string };
    if (TransferPaymentPage.isTransferPaymentUrl(page.url())) {
      const transferPage = new TransferPaymentPage(page, paymentData);
      await transferPage.expectLoaded();
      const issued = await transferPage.issueBill();
      expect.soft(issued.billerCode, `${which} SADAD biller code per the service documentation`).toBe(SADAD_BILLER_CODE);
      log.payment.info(`${which}: bill ${issued.billId} ${issued.issuedNow ? 'issued' : 'already issued earlier'} — biller #${issued.billerCode}`);
      bill = issued;
    } else {
      const paymentPage = new PaymentPage(page);
      await paymentPage.expectLoaded();
      bill = await paymentPage.bill();
      const ack = await paymentPage.acknowledge();
      if (ack === undefined) throw new Error(`${which}: the payment page shows no non-refundable-fee acknowledgement.`);
    }
    log.payment.info(`${which}: bill ${bill.billId} — ${bill.description} ${bill.amount}`);
    expect.soft(bill.amount, `${which} amount per the service documentation`).toBe(EXPECTED_FEE);
    if (this.context.bills.some((b) => b.billId === bill.billId)) {
      throw new Error(`Bill ${bill.billId} was already notified as paid, yet a payment task still shows it. Not notifying twice — check it manually.`);
    }
    const utilityPage = await investor.page.context().newPage();
    try {
      const utility = new PaymentNotificationPage(utilityPage);
      await utility.open();
      const result = await utility.notify(bill.billId, bill.amount, { setAmount: true }); // billAcct + pmtAmt (user decision)
      this.context.bills.push({ ...result, amount: bill.amount, paidAt: new Date().toISOString(), task: taskType, verified: false, payer });
      this.save();
      log.payment.info(`${which}: payment notification accepted for bill ${bill.billId} (${result.response})`);
    } finally {
      await utilityPage.close();
    }
    // The notification is not proof: the payment task must leave the To-Do list. The transfer bill dialog warns that
    // the payment status "may take 15 minutes" to change, so the wait is PAYMENT_CONFIRM_MS (default 20 min).
    await expect
      .poll(async () => (await this.investorTasks(investor)).tasks.includes(taskType), {
        timeout: readNumber('PAYMENT_CONFIRM_MS', 20 * 60_000),
        intervals: [20_000],
        message: `${which}: the "${taskType}" task is still in the To-Do list after paying bill ${bill.billId}`,
      })
      .toBe(false);
    const paid = this.context.bills.find((b) => b.billId === bill.billId);
    if (paid) paid.verified = true;
    this.record(payer, taskType, `paid ${bill.billId}`);
    log.payment.info(`${which}: payment verified — task closed for bill ${bill.billId}`);
  }

  /**
   * Rework, transferee side: the returned section's To-Do. Asserts what came back (the employee's Not-Met rating and
   * comment, and that only this To-Do is open), applies this return's correction (rework.returns[i]), asserts every
   * value really changed, and submits. The employee's reassessment later asserts the new values (verifyCorrection).
   */
  /**
   * Employee reassessment: the returned section's step must show every corrected value (as text or in a read-only
   * field), and none of the replaced ones for the corrected fields.
   */
  private async verifyCorrection(response: TransferTaskResponsePage, corrected: TransferContext['reworkReturns'][number]): Promise<void> {
    const n = this.context.reworkReturns.indexOf(corrected) + 1;
    const shown = async () => {
      const values = await response.page.locator('input, textarea').filter({ visible: true }).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
      return `${await response.page.locator('body').innerText()}\n${values.join('\n')}`;
    };
    const fieldValues = () =>
      response.page.locator('input:not([type=hidden]):not([type=radio]):not([type=checkbox])').filter({ visible: true }).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value.trim()));
    for (const c of corrected.changes ?? []) {
      await expect.poll(shown, { timeout: 30_000, message: `Return ${n}: reassessment shows the corrected "${c.field}" = "${c.after}"` }).toContain(c.after);
      // The data really changed: no field on the reassessment screen still holds the replaced value.
      expect(await fieldValues(), `Return ${n}: "${c.field}" no longer shows the old value "${c.before}"`).not.toContain(c.before);
    }
    corrected.verified = true;
    this.save();
    log.employee.info(`Return ${n}: reassessment shows the corrected values (${(corrected.changes ?? []).map((c) => `${c.field} = "${c.after}"`).join(', ')})`);
  }

  /** Financial reassessment: the transferee's corrected financial values are shown, and the old ones are gone. */
  private async verifyFinancialCorrection(response: TransferTaskResponsePage): Promise<void> {
    const changes = this.context.employeeReturn?.changes ?? [];
    const shown = async () => {
      const values = await response.page.locator('input, textarea').filter({ visible: true }).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
      return `${await response.page.locator('body').innerText()}\n${values.join('\n')}`.replace(/,/g, '');
    };
    for (const c of changes) {
      await expect.poll(shown, { timeout: 30_000, message: `Financial reassessment shows the corrected "${c.field}" = "${c.after}"` }).toContain(c.after);
      expect.soft(await shown(), `Financial reassessment no longer shows the old "${c.field}" = "${c.before}"`).not.toContain(c.before);
    }
    log.employee.info(`Financial reassessment shows the corrected values (${changes.map((c) => `${c.field} = "${c.after}"`).join(', ')})`);
  }

  private async correctReturnedSection(todo: ToDoListPage, taskType: string): Promise<void> {
    const rework = this.scenario.rework;
    const current = this.context.reworkReturns.at(-1);
    if (!rework || !current || current.changes) {
      throw new UnsupportedTaskError('transferee', taskType, 'a correction task appeared without a pending return to the transferee');
    }
    const index = this.context.reworkReturns.length - 1;
    const values = rework.returns[index];
    const others = (await this.investorTasks(this.transferee)).tasks.filter((t) => t !== taskType);
    expect.soft(others, `Return ${index + 1}: only the returned section is sent back to the transferee`).toEqual([]);

    await todo.openTask({ requestNumber: this.rn, taskType });
    const page = new TransfereeCorrectionPage(this.transferee.page);
    await page.expectLoaded(this.rn);
    const returned = await page.returnedEvaluation();
    expect.soft(returned.notMet, `Return ${index + 1}: the transferee sees the section rated "لم تتحقق المتطلبات"`).toBe(true);
    expect.soft(returned.comment, `Return ${index + 1}: the transferee sees the employee's return comment`).toBe(rework.description);

    const changes = await page.correct(values);
    for (const c of changes) {
      expect(c.after, `Return ${index + 1}: "${c.field}" is really changed (was "${c.before}")`).not.toBe(c.before);
    }
    const outcome = await page.submit();
    current.changes = changes;
    current.correctedAt = new Date().toISOString();
    log.transferee.info(
      `Return ${index + 1} corrected: ${changes.map((c) => `${c.field} "${c.before}" → "${c.after}"`).join(', ')} — ${outcome}`,
    );
    this.record('transferee', taskType, `corrected (return ${index + 1})`);
  }

  private async handleTransfereeTask(todo: ToDoListPage, taskType: string): Promise<void> {
    log.transferee.info(`To-Do task "${taskType}" on ${this.rn}`);
    if (PAYMENT_TASK.test(taskType)) return this.pay(this.transferee, 'transferee', todo, taskType);
    if (taskType === TRANSFEREE_TASKS.review) {
      await todo.openTask({ requestNumber: this.rn, taskType });
      const review = new TransfereeReviewPage(this.transferee.page);
      await review.expectLoaded(this.rn);
      const message = await review.approve();
      log.transferee.info(`Transfer request approved — "${message}"`);
      return this.record('transferee', taskType, 'قبول الطلب');
    }
    if (taskType === TRANSFEREE_TASKS.wizard) {
      await todo.openTask({ requestNumber: this.rn, taskType });
      const wizard = new TransfereeWizardPage(this.transferee.page);
      await wizard.expectLoaded(this.rn);
      this.context.wizardReport = await wizard.fillAll(this.data);
      const message = await wizard.submit();
      log.transferee.info(`Transferee application submitted (8 steps) — "${message}"`);
      return this.record('transferee', taskType, 'submitted');
    }
    if (taskType === TRANSFEREE_TASKS.gisTerms) {
      const review = new TransfereeGisTermsPage(this.transferee.page);
      review.captureTerms();
      await todo.openTask({ requestNumber: this.rn, taskType });
      await review.expectLoaded(this.rn);
      const terms = await review.loadedTerms();
      this.context.gisTermsShown = terms;
      log.transferee.info(`GIS terms shown to the transferee: ${terms.length ? terms.join(' | ') : 'NONE'}`);
      // Documented flow (TP-17354): the transferee reviews the GIS conditions. Reported, not hidden, when none arrive.
      expect.soft(terms.length, `GIS terms shown to the transferee (configured clauses: ${this.scenario.gisClauses.join(' | ')})`).toBeGreaterThan(0);
      const outcome = await review.approveConditions();
      log.transferee.info(`GIS conditions approved — ${outcome}`);
      return this.record('transferee', taskType, 'قبول الشروط');
    }
    if (taskType === TRANSFEREE_TASKS.socialImpactCorrection) return this.correctReturnedSection(todo, taskType);
    if (taskType === TRANSFEREE_TASKS.financialCorrection) return this.correctReturnedFinancial(todo, taskType);
    if (taskType === TRANSFEREE_TASKS.additionalInfo) return this.provideAdditionalInfo(todo, taskType);
    throw new UnsupportedTaskError('transferee', taskType, 'this transferee To-Do task is not automated yet');
  }

  /**
   * Employee-return round, transferee side: the financial section returned by Consolidated Feedback. Same checks as
   * the social-impact correction: Not-Met rating and the employee's comment are shown, only this To-Do is open, every
   * configured value really changes; the financial reassessment later asserts the new values (verifyFinancialCorrection).
   */
  private async correctReturnedFinancial(todo: ToDoListPage, taskType: string): Promise<void> {
    const round = this.scenario.rework?.employeeReturn;
    if (!round || this.context.employeeReturn?.stage !== 'returnedToTransferee') {
      throw new UnsupportedTaskError('transferee', taskType, 'a financial correction task appeared without a financial return to the transferee');
    }
    const others = (await this.investorTasks(this.transferee)).tasks.filter((t) => t !== taskType);
    expect.soft(others, 'Financial return: only the returned section is sent back to the transferee').toEqual([]);
    await todo.openTask({ requestNumber: this.rn, taskType });
    const page = new TransfereeCorrectionPage(this.transferee.page);
    await page.expectLoaded(this.rn);
    const returned = await page.returnedEvaluation();
    expect.soft(returned.notMet, 'Financial return: the transferee sees "لم تتحقق المتطلبات"').toBe(true);
    expect.soft(returned.comment, "Financial return: the transferee sees the employee's comment").toBe(round.description);
    const changes = await page.correct(round.corrections);
    for (const c of changes) expect(c.after, `Financial return: "${c.field}" is really changed (was "${c.before}")`).not.toBe(c.before);
    const outcome = await page.submit();
    this.context.employeeReturn = { stage: 'corrected', changes };
    this.save();
    log.transferee.info(`Financial return corrected: ${changes.map((c) => `${c.field} "${c.before}" → "${c.after}"`).join(', ')} — ${outcome}`);
    this.record('transferee', taskType, 'corrected (financial return)');
  }

  /**
   * Return chain, transferee side of "طلب بيانات إضافية": the To-Do must show exactly what Consolidated Feedback asked
   * for (description + attachment names, and only this To-Do open); every requested attachment is uploaded, the
   * transferee's description written, and the request submitted. Consolidated then checks the reply (decide()).
   */
  private async provideAdditionalInfo(todo: ToDoListPage, taskType: string): Promise<void> {
    const asked = this.scenario.returnChain?.additionalInfo;
    const round = this.context.additionalInfo;
    if (!asked || round?.stage !== 'requested') {
      throw new UnsupportedTaskError('transferee', taskType, 'an additional-information To-Do appeared without a pending request for it');
    }
    const others = (await this.investorTasks(this.transferee)).tasks.filter((t) => t !== taskType);
    expect.soft(others, 'Additional information: only this To-Do is sent to the transferee').toEqual([]);
    await todo.openTask({ requestNumber: this.rn, taskType });
    const page = new TransfereeAdditionalInfoPage(this.transferee.page);
    await page.expectLoaded(this.rn);
    const shown = await page.requested();
    expect.soft(shown.description, "Additional information: the transferee sees the employee's request").toBe(asked.description);
    expect(shown.attachmentNames, 'Additional information: one upload row per requested attachment name').toEqual(asked.attachmentNames);
    const uploaded = await page.provide(this.data.attachment, ADDITIONAL_INFO_REPLY);
    const outcome = await page.submit();
    this.context.additionalInfo = { ...round, stage: 'provided', transfereeTask: taskType };
    this.save();
    log.transferee.info(`Additional information provided: ${uploaded.join(', ')} — ${outcome}`);
    this.record('transferee', taskType, `provided ${uploaded.length} attachment(s)`);
  }

  // ---------------------------------------------------------------- employee

  private get taskManagement(): TransferTaskManagementPage {
    return new TransferTaskManagementPage(this.employee.page);
  }

  private async openEmployeeTasks(): Promise<EmployeeTask[]> {
    const all = await this.taskManagement.search(this.rn);
    this.context.employeeTaskLog.push({ at: new Date().toISOString(), tasks: all.map((t) => ({ task: t.taskType, status: t.status })) });
    return all.filter((t) => OPEN_TASK_STATUSES.some((s) => t.status.includes(s)));
  }

  /** Return chain: returns `task` still has to make (configured count minus returns made or not offered). */
  private chainReturnsDue(task: string): number {
    const chain = this.scenario.returnChain;
    const key = chain && Object.keys(chain.tasks).find((k) => sameTask(k, task));
    if (!chain || !key) return 0;
    const made = this.context.chainReturns.filter((r) => sameTask(r.from, task)).length;
    const skipped = this.context.chainReturnsNotOffered.filter((r) => sameTask(r.task, task)).length;
    return Math.max(0, chain.tasks[key] - made - skipped);
  }

  /** Return chain: the return chosen on the current task, recorded once "إرسال الرد" succeeds (handleEmployeeTask). */
  private pendingChainReturn?: Omit<ChainReturn, 'at'>;

  /**
   * Return chain (scenario.returnChain): while `task` still has returns due, sends the request back instead of
   * approving — "المراجعة العامة" to the configured branches ("إعادة للموظف السابق"), every other task with the "إعادة …"
   * option it offers (never "إعادة للمحال إليه") to the previous employee of RETURN_ROUTES, with a unique description.
   * "المراجعة العامة" waits until the transferee rework rounds are done. A configured return that is not offered is a
   * discrepancy with the documentation: reported (soft) and the task is approved. Returns the decision, or undefined.
   */
  private async chainReturn(response: TransferTaskResponsePage, task: EmployeeTask, options: string[]): Promise<string | undefined> {
    const chain = this.scenario.returnChain;
    if (!chain || !this.chainReturnsDue(task.taskType)) return undefined;
    const consolidated = sameTask(task.taskType, CONSOLIDATED);
    const round = this.scenario.rework?.employeeReturn;
    if (consolidated && (this.reworkDue() || (round && this.context.employeeReturn?.stage !== 'verified'))) return undefined;
    const description = `${chain.description} — إعادة ${this.context.chainReturns.length + 1} من "${task.taskType}"`;
    const decision = consolidated
      ? options.find((o) => o === RETURN_TO_EMPLOYEE)
      : options.find((o) => /^إعادة/.test(o) && o !== RETURN_TO_TRANSFEREE);
    const route = Object.entries(RETURN_ROUTES).find(([from]) => sameTask(from, task.taskType))?.[1];
    const expectedNext = consolidated ? chain.consolidatedBranches : route ? [route] : [];
    if (!decision || !expectedNext.length) {
      this.context.chainReturnsNotOffered.push({ task: task.taskType, options, at: new Date().toISOString() });
      this.save();
      const why = !decision ? `offers no return option (${options.join(' | ')})` : 'has no documented return route (RETURN_ROUTES)';
      expect.soft(false, `Return chain: "${task.taskType}" ${why} — the documentation lets it return the request`).toBe(true);
      log.workflow.warn(`Return chain: "${task.taskType}" ${why} — approving instead`);
      return undefined;
    }
    if (consolidated) await response.returnToPreviousEmployee(chain.consolidatedBranches, description);
    else await response.returnWithDescription(decision, description);
    this.pendingChainReturn = { from: task.taskType, decision, description, expectedNext };
    return `${CHAIN_RETURN}: ${decision} → ${expectedNext.join(' + ')}`;
  }

  /**
   * Return chain, next handler: before answering, the task the request came back to must show the return's
   * description in "سجل الطلب" ("rework history preserved", documentation §11). Soft — reported, not blocking.
   */
  private async checkReturnHistory(response: TransferTaskResponsePage, task: EmployeeTask): Promise<void> {
    const due = this.context.chainReturns.filter(
      (r) => r.expectedNext.some((t) => sameTask(t, task.taskType)) && !(r.seenBy ?? []).some((s) => sameTask(s.task, task.taskType)),
    );
    for (const r of due) {
      const n = this.context.chainReturns.indexOf(r) + 1;
      const shown = await expect
        .poll(() => response.requestHistory(), { timeout: 30_000, intervals: [2_000, 5_000] })
        .toContain(r.description)
        .then(() => true, () => false);
      (r.seenBy ??= []).push({ task: task.taskType, shown });
      this.save();
      expect.soft(shown, `Return ${n} from "${r.from}": "${task.taskType}" shows its description in "سجل الطلب"`).toBe(true);
      log.employee.info(`Return ${n} from "${r.from}": ${shown ? 'shown' : 'NOT shown'} in "سجل الطلب" of "${task.taskType}"`);
    }
  }

  /** Return chain: after a return, the documented next task(s) must open (polled up to 3 minutes). */
  private async verifyReturnRoute(r: ChainReturn): Promise<void> {
    const n = this.context.chainReturns.indexOf(r) + 1;
    r.routedAsDocumented = await expect
      .poll(
        async () => {
          r.openedNext = (await this.openEmployeeTasks()).map((t) => t.taskType);
          return r.expectedNext.every((e) => r.openedNext!.some((o) => sameTask(o, e)));
        },
        { timeout: 180_000, intervals: [10_000] },
      )
      .toBe(true)
      .then(() => true, () => false);
    this.save();
    expect.soft(r.routedAsDocumented, `Return ${n} from "${r.from}" opens ${r.expectedNext.join(' + ')} (open: ${r.openedNext?.join(' | ') || 'none'})`).toBe(true);
    log.workflow.info(`Return ${n}: "${r.from}" → ${r.openedNext?.join(' | ') || 'nothing open'}${r.routedAsDocumented ? ' (as documented)' : ` — DOCUMENTED: ${r.expectedNext.join(' + ')}`}`);
  }

  /**
   * Decision rules (by the options a task offers; VERIFIED on TEST unless noted):
   *   GIS (أرض متاحة / أرض مشروطة)                → the scenario's gisRecommendation (also on Inspection & GIS Evaluation)
   *   ممتثل / غير ممتثل (inspection, compliance) → ممتثل in EVERY group (transferor + transferee)
   *   multi-part assessment / تحققت المتطلبات    → all met
   *   قبول التوصية · توصية بالقبول (المراجعة العامة) · قبول الطلب → accept / recommend approval / approve request
   */
  private async decide(response: TransferTaskResponsePage, task: EmployeeTask): Promise<string> {
    if (await response.isSectionWizard()) {
      // Rework: while returns are still due, the configured section is rated "لم تتحقق المتطلبات" (with its
      // mandatory comment) — the run never passes as an all-Met assessment before the returns happened.
      const rework = this.reworkDue();
      let notMet = '';
      const returnedSection = this.scenario.rework?.section;
      const steps = await response.completeSectionWizard(async (step) => {
        const isReturnedSection = !!returnedSection && normalizeArabic(step).includes(normalizeArabic(returnedSection));
        // Reassessment after a correction: the employee must see the transferee's new values on this step.
        const corrected = this.context.reworkReturns.find((r) => r.changes && !r.verified);
        if (isReturnedSection && corrected) await this.verifyCorrection(response, corrected);
        if (rework && isReturnedSection) {
          await response.rateNotMet(rework.description);
          notMet = step;
        }
      }, `${this.data.employeeNote} — ${task.taskType}`);
      if (rework && !notMet) {
        throw new Error(`Rework: no technical-assessment step matches rework.section "${rework.section}". Steps: ${steps.map((s) => s.step).join(' | ')}`);
      }
      const met = `تحققت المتطلبات (${steps.map((s) => `${s.step}: ${s.items}`).join(' · ')})`;
      return notMet ? `لم تتحقق المتطلبات on "${notMet}" (return ${this.context.reworkReturns.length + 1}) · ${met}` : met;
    }
    if (await response.isPartWizard()) {
      const perPart = await response.completePartWizard();
      return `تحققت المتطلبات (${perPart.join('+')} items)`;
    }
    const options = await response.decisions();
    log.employee.info(`Task "${task.taskType}" (process ${response.taskTypeId()}) offers: ${options.join(' | ') || 'no decision options'}`);
    const gis = this.scenario.gisRecommendation;
    if (options.includes('أرض متاحة') && options.includes('أرض مشروطة')) {
      await response.choose(gis);
      // Conditioned land: the GIS task (and, where offered, the evaluation) records the condition clauses.
      if (gis === 'أرض مشروطة' && (await response.hasConditionClauses())) {
        await response.addConditionClauses(this.scenario.gisClauses);
        return `${gis} + ${this.scenario.gisClauses.length} clause(s)`;
      }
      return gis;
    }
    if (options.includes('ممتثل')) {
      const groups = await response.chooseInEveryGroup('ممتثل');
      return `ممتثل (${groups} groups)`;
    }
    // Rework: Consolidated Feedback must return the request to the transferee while returns are still due.
    // VERIFIED on TEST (request 76362): "إعادة للمحال إليه" reveals an optional checkbox "طلب بيانات إضافية" (left
    // unticked) and the description "إفادة الموظف" [id$=TextArea_Description] (≤ 2,000), filled with rework.description.
    // Second rework round (rework.employeeReturn): return branches to their employees, rate the financial assessment
    // Not Met, return to the transferee, then reassess. Stage transitions are recorded after each submit.
    const employeeReturn = this.scenario.rework?.employeeReturn;
    const stage = this.context.employeeReturn?.stage;
    if (employeeReturn && !this.reworkDue()) {
      // Only Consolidated Feedback starts the round — reviews and approval levels offer the same label.
      if (!stage && sameTask(task.taskType, CONSOLIDATED) && options.includes('إعادة للموظف السابق')) {
        await response.returnToPreviousEmployee(employeeReturn.branches, employeeReturn.description);
        return RETURN_TO_EMPLOYEE;
      }
      if (stage === 'ratedNotMet' && options.includes('إعادة للمحال إليه')) {
        await response.choose('إعادة للمحال إليه');
        await response.page.locator('textarea[id$="TextArea_Description"]').filter({ visible: true }).first().fill(employeeReturn.description);
        return RETURN_FINANCIAL_TO_TRANSFEREE;
      }
      if (/المالية/.test(task.taskType) && !/مراجعة/.test(task.taskType) && options.includes('لم تتحقق المتطلبات')) {
        if (stage === 'returnedToEmployee') {
          await response.rateNotMet(employeeReturn.description);
          const items = await response.markAllUnratedMet();
          return `${FINANCIAL_NOT_MET} (${items} items)`;
        }
        if (stage === 'corrected') {
          await this.verifyFinancialCorrection(response);
          return `${FINANCIAL_REASSESSED} — تحققت المتطلبات (${await response.markAllUnratedMet()} items)`;
        }
      }
    }
    const due = this.reworkDue();
    if (due && options.includes('إعادة للمحال إليه')) {
      await response.choose('إعادة للمحال إليه');
      await response.page.locator('textarea[id$="TextArea_Description"]').filter({ visible: true }).first().fill(due.description);
      return RETURN_TO_TRANSFEREE;
    }
    // Only Consolidated Feedback returns to the transferee; earlier tasks (GIS review, financial review) answer normally.
    if (due && sameTask(task.taskType, CONSOLIDATED)) {
      throw new UnsupportedTaskError('employee', task.taskType, `rework: a return to the transferee is still due, but "إعادة للمحال إليه" is not offered (${options.join(' | ')})`);
    }
    // Additional information, after the transferee's reply: the employee's task shows it (the reply text and every
    // requested attachment name, in any tab of the page). Soft — reported, then the task is answered normally.
    if (this.context.additionalInfo?.stage === 'provided' && sameTask(task.taskType, CONSOLIDATED)) {
      const page = await response.page.locator('body').textContent() ?? '';
      const names = this.scenario.returnChain?.additionalInfo?.attachmentNames ?? [];
      expect.soft(page, 'Consolidated Feedback shows the transferee\'s additional-information reply').toContain(ADDITIONAL_INFO_REPLY);
      for (const n of names) expect.soft(page, `Consolidated Feedback shows the provided attachment "${n}"`).toContain(n);
      this.context.additionalInfo.stage = 'reviewed';
      this.save();
    }
    // Additional information: once Consolidated's own returns and the rework rounds are done (every section Met).
    const extra = this.scenario.returnChain?.additionalInfo;
    const roundDone = !employeeReturn || stage === 'verified';
    if (extra && !this.context.additionalInfo && roundDone && sameTask(task.taskType, CONSOLIDATED) && !this.chainReturnsDue(task.taskType) && options.includes(RETURN_TO_TRANSFEREE)) {
      await response.returnForAdditionalInfo({ ...extra, employeeDescription: `${this.data.employeeNote} — طلب بيانات إضافية` });
      return ADDITIONAL_INFO;
    }
    const chained = await this.chainReturn(response, task, options);
    if (chained) return chained;
    const pick = ['قبول التوصية', 'التوصية بالقبول', 'توصية بالقبول', 'قبول الطلب'].find((o) => options.includes(o));
    if (pick) {
      await response.choose(pick);
      return pick;
    }
    if (options.includes('تحققت المتطلبات')) return `تحققت المتطلبات (${await response.markAllRequirementsMet()} items)`;
    throw new UnsupportedTaskError('employee', task.taskType, `options offered: ${options.join(' | ') || 'none'}`);
  }

  private async handleEmployeeTask(task: EmployeeTask): Promise<void> {
    log.employee.info(`Request ${this.rn} — task "${task.taskType}" (${task.status}${task.assignee ? `, ${task.assignee}` : ''})`);
    const tm = this.taskManagement;
    log.employee.info(`Task ${(await tm.assignToSelf(task)) === 'assigned' ? 'assigned to self' : 'already assigned'}`);
    const response = await tm.openResponse(task);
    let chained: ChainReturn | undefined;
    try {
      await this.checkReturnHistory(response, task);
      if (this.scenario.returnChain && sameTask(task.taskType, 'موافقة المستوى الخامس') && !this.chainReturnsDue(task.taskType)) {
        this.context.responseLog = await response.responseLog();
        this.save();
        log.employee.info(`"سجل الردود" saved before the final approval: ${this.context.responseLog.length} responses`);
      }
      await response.openRespondTab();
      this.pendingChainReturn = undefined;
      const decision = await this.decide(response, task);
      const isChainReturn = decision.startsWith(CHAIN_RETURN);
      // Every employee response carries a comment (user requirement), naming the task it belongs to — except the
      // tasks in noCommentTasks (BUG-001: a comment on "مهمة الرقابة" makes the server refuse the response).
      const comment = `${this.data.employeeNote} — ${task.taskType}`;
      const skipComment = this.data.noCommentTasks.some((t) => t.trim() === task.taskType.trim());
      // A returned task's MANDATORY "رد الموظف" is filled on every task, noCommentTasks included (not the BUG-001 field).
      if (!isChainReturn && (await response.fillEmployeeResponse(comment))) log.employee.info(`"رد الموظف" filled on returned task "${task.taskType}"`);
      // A return-chain description is the comment of that answer — nothing more is written.
      const written = skipComment || isChainReturn ? 0 : await response.commentEverywhere(comment, 1); // first description only
      if (skipComment) log.employee.info(`No comment on "${task.taskType}" (noCommentTasks — BUG-001)`);
      // On "إعادة للمحال إليه" the only comment field already holds the return description — that is the comment.
      else if (!isChainReturn && ![RETURN_TO_TRANSFEREE, RETURN_TO_EMPLOYEE, RETURN_FINANCIAL_TO_TRANSFEREE, ADDITIONAL_INFO].includes(decision)) {
        // The comment may already be in place (e.g. the reassessment's employee response filled by the wizard).
        const present = await response.page
          .locator('textarea')
          .evaluateAll((fields, note) => fields.filter((f) => (f as HTMLTextAreaElement).value.includes(note)).length, this.data.employeeNote);
        expect.soft(present + response.wizardComments, `Employee comment on "${task.taskType}"`).toBeGreaterThan(0);
      }
      const errors = await response.submit();
      if (errors.length) {
        // Evidence for a bug report: the task page as it was left, plus the server calls of the submit.
        const info = test.info();
        await info.attach(`employee task "${task.taskType}" — screen after "إرسال الرد"`, {
          body: await response.page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        await info.attach(`employee task "${task.taskType}" — server calls during submit`, {
          body: [`request ${this.rn}`, `url ${response.page.url()}`, ...errors, ...response.submitCalls].join('\n'),
          contentType: 'text/plain',
        });
        throw new WizardValidationError(`employee task "${task.taskType}"`, errors);
      }
      log.employee.info(`Task "${task.taskType}" submitted — ${decision} — comment in ${written} field(s)`);
      // decide() set it (TypeScript still sees the reset above).
      const pending = this.pendingChainReturn as Omit<ChainReturn, 'at'> | undefined;
      if (isChainReturn && pending) {
        // Recorded straight away, so a resumed run never returns the same task twice.
        chained = { ...pending, at: new Date().toISOString() };
        this.context.chainReturns.push(chained);
        log.workflow.info(`Return chain: return ${this.context.chainReturns.length} sent from "${task.taskType}"`);
      }
      if (decision === ADDITIONAL_INFO) {
        this.context.additionalInfo = { stage: 'requested', requestedAt: new Date().toISOString() };
        log.workflow.info('Additional information requested from the transferee');
      }
      if (decision === RETURN_TO_TRANSFEREE) {
        this.context.reworkReturns.push({ returnedAt: new Date().toISOString(), section: this.scenario.rework?.section ?? '' });
        log.workflow.info(`Rework: return ${this.context.reworkReturns.length} of ${this.scenario.rework?.returns.length} sent to the transferee`);
      }
      const nextStage: Record<string, NonNullable<TransferContext['employeeReturn']>['stage']> = {
        [RETURN_TO_EMPLOYEE]: 'returnedToEmployee',
        [FINANCIAL_NOT_MET]: 'ratedNotMet',
        [RETURN_FINANCIAL_TO_TRANSFEREE]: 'returnedToTransferee',
        [FINANCIAL_REASSESSED]: 'verified',
      };
      const reached = Object.entries(nextStage).find(([prefix]) => decision.startsWith(prefix))?.[1];
      if (reached) {
        this.context.employeeReturn = { ...this.context.employeeReturn, stage: reached };
        this.save();
        log.workflow.info(`Employee-return round: ${reached}`);
      }
      this.record('employee', task.taskType, decision, written ? comment : undefined);
    } finally {
      if (!response.page.isClosed()) await response.page.close();
    }
    // The current task must be closed (no longer جديد / قيد التنفيذ).
    await expect
      .poll(async () => (await this.openEmployeeTasks()).some((t) => t.taskType === task.taskType), {
        timeout: 60_000,
        intervals: [5_000],
        message: `Task "${task.taskType}" is still open after its response was submitted`,
      })
      .toBe(false);
    if (chained) await this.verifyReturnRoute(chained);
  }

  // ---------------------------------------------------------------- orchestration

  /** Status of the request in the transferor's Requests list. */
  async requestStatus(): Promise<string> {
    await this.home(this.transferor);
    await this.transferor.requests.open();
    await this.transferor.requests.find(this.rn);
    return this.transferor.requests.cell(this.rn, 'الحالة');
  }

  private async step(): Promise<boolean> {
    const open = await this.openEmployeeTasks();
    if (open.length) {
      log.workflow.info(`Open employee task(s): ${open.map((t) => t.taskType).join(' | ')}`);
      // Manual checkpoint: STOP_BEFORE_TASK="<task name>" stops before that task is assigned or answered.
      const stopAt = readVar('STOP_BEFORE_TASK');
      if (stopAt && open[0].taskType.trim() === stopAt.trim()) throw new WorkflowPausedError(this.rn, open[0].taskType);
      await this.handleEmployeeTask(open[0]);
      return true;
    }
    const transferee = await this.investorTasks(this.transferee);
    if (transferee.tasks.length) {
      await this.handleTransfereeTask(transferee.todo, transferee.tasks[0]);
      return true;
    }
    const transferor = await this.investorTasks(this.transferor);
    if (transferor.tasks.length) {
      const taskType = transferor.tasks[0];
      log.transferor.info(`To-Do task "${taskType}" on ${this.rn}`);
      if (!PAYMENT_TASK.test(taskType)) throw new UnsupportedTaskError('transferor', taskType, 'only the application-fee payment is automated for the transferor');
      await this.pay(this.transferor, 'transferor', transferor.todo, taskType);
      return true;
    }
    return false;
  }

  private async anythingPending(): Promise<boolean> {
    return (
      (await this.openEmployeeTasks()).length > 0 ||
      (await this.investorTasks(this.transferee)).tasks.length > 0 ||
      (await this.investorTasks(this.transferor)).tasks.length > 0
    );
  }

  /**
   * Rounds until the request is completed, bounded by WORKFLOW_MAX_ROUNDS (default `defaultMaxRounds`, 45). When
   * nothing is pending it waits up to WORKFLOW_IDLE_MS (default 3 min) for the next task; a request that settles in any
   * other status returns with that status, so the caller's assertion reports it (an unfinished workflow never passes).
   */
  async run(defaultMaxRounds = 45): Promise<TransferContext> {
    if (!this.rn) throw new Error('No request number — submitTransferorRequest() must run first.');
    const maxRounds = readNumber('WORKFLOW_MAX_ROUNDS', defaultMaxRounds);
    const idleMs = readNumber('WORKFLOW_IDLE_MS', 180_000);
    const completed = readVar('EXPECTED_FINAL_STATUS') ?? COMPLETED_STATUS;
    for (let round = 1; round <= maxRounds; round++) {
      log.workflow.info(`Round ${round}: pending tasks of ${this.rn}`);
      if (await this.step()) continue;
      const status = await this.requestStatus();
      if (DEAD_STATUSES.some((r) => r.test(status))) throw new Error(`Request ${this.rn} ended as "${status}".`);
      if (status.includes(completed)) {
        this.context.finalStatus = status;
        this.save();
        log.workflow.info(`Request ${this.rn} reached "${status}"`);
        return this.context;
      }
      log.workflow.info(`Nothing pending — status "${status}". Waiting up to ${idleMs / 1000}s for the next task`);
      const appeared = await expect
        .poll(() => this.anythingPending(), { timeout: idleMs, intervals: [15_000] })
        .toBe(true)
        .then(() => true, () => false);
      if (!appeared) {
        this.context.finalStatus = await this.requestStatus();
        this.save();
        log.workflow.info(`No further tasks — request status "${this.context.finalStatus}"`);
        return this.context;
      }
    }
    throw new Error(`Stopped after ${maxRounds} rounds without the workflow settling (WORKFLOW_MAX_ROUNDS).`);
  }

  /** "سجل الردود" of the request (newest first), read from any of its tasks in view mode. */
  async responseLog(): Promise<{ task: string; decision: string; comment: string }[]> {
    const tm = this.taskManagement;
    const [task] = await tm.search(this.rn);
    if (!task) throw new Error(`Request ${this.rn} has no tasks in Task Management — cannot read "سجل الردود".`);
    const view = await tm.openReadOnly(task);
    try {
      return await view.responseLog();
    } finally {
      await view.page.close();
    }
  }

  /** Status of the licence in the company's licence list ("الرخص"), or undefined when it is not listed. */
  private async licenseStatus(investor: InvestorPortal, party: Party): Promise<string | undefined> {
    await this.home(investor);
    const licences = new LicensesPage(investor.page);
    await licences.open();
    const row = await licences.find(this.context.licenseNumber);
    (party === 'transferor' ? log.transferor : log.transferee).info(
      `Licence list ("الرخص"): ${this.context.licenseNumber} ${row ? `— ${row.type}, status "${row.status}"` : 'is not listed'}`,
    );
    return row?.status;
  }

  /**
   * Last check, after the final payment: open each company's licence list and read the licence's status.
   * Expected (VERIFIED on TEST, request 76352): transferee "فعال" (active), transferor "محولة" (transferred).
   */
  async verifyOwnership(): Promise<NonNullable<TransferContext['ownership']>> {
    const transferorStatus = await this.licenseStatus(this.transferor, 'transferor');
    const transfereeStatus = await this.licenseStatus(this.transferee, 'transferee');
    this.context.ownership = { transferorStatus, transfereeStatus, checkedAt: new Date().toISOString() };
    this.save();
    return this.context.ownership;
  }
}

/** Compares Arabic labels regardless of hamza forms and spacing ("الإجتماعي" = "الاجتماعي"). */
function normalizeArabic(text: string): string {
  return text.replace(/[إأآ]/g, 'ا').replace(/\s+/g, ' ').trim();
}

/** Same employee task name — TEST spells some both ways ("موافقة المستوى الرابع" / "موافقه المستوي الرابع"). */
export function sameTask(a: string, b: string): boolean {
  const key = (t: string) => normalizeArabic(t).replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  return key(a) === key(b);
}

/** Licence statuses after a completed transfer (VERIFIED on TEST, licence 20260311313). */
export const LICENSE_STATUS_AFTER_TRANSFER = { transferor: 'محولة', transferee: 'فعال' } as const;

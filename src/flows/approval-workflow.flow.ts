import fs from 'fs';
import path from 'path';
import { expect } from '@playwright/test';
import { assertMutationsAllowed, readNumber, readVar } from '@config/index';
import { MultiSelect } from '@components/MultiSelect';
import { EmployeePortal } from '@pages/employee/EmployeePortal';
import { EmployeeTask, OPEN_TASK_STATUSES, TaskManagementPage } from '@pages/employee/TaskManagementPage';
import { TaskResponsePage } from '@pages/employee/TaskResponsePage';
import { InvestorPortal } from '@pages/investor/InvestorPortal';
import { StepReport } from '@pages/investor/exploration-license/WizardStep';
import { PaymentPage } from '@pages/investor/PaymentPage';
import { ToDoListPage } from '@pages/investor/ToDoListPage';
import { NotificationResult, PaymentNotificationPage } from '@pages/test-utils/PaymentNotificationPage';
import { createLogger } from '@utils/logger';
import { WizardValidationError } from '@utils/validation';
import { ExplorationLicenseFlow } from './exploration-license.flow';

const log = {
  workflow: createLogger('Workflow'),
  investor: createLogger('Investor'),
  employee: createLogger('Employee'),
  billing: createLogger('Billing'),
  payment: createLogger('Payment'),
};

/** Statuses after which nothing more can happen (VERIFIED: "ملغي" on 76103). */
const DEAD_STATUSES = [/ملغي/, /مرفوض/];
/** End state after the fifth approval + second payment (VERIFIED on 76107). EXPECTED_FINAL_STATUS overrides. */
const COMPLETED_STATUS = 'مكتمل';
const EMPLOYEE_NOTE = 'تمت المراجعة - اختبار آلي';
/** Government entities for "الموافقات الحكومية" — chosen by the TEST owner (2026-10-26); GOV_ENTITIES overrides. */
const DEFAULT_GOV_ENTITIES = ['وزارة الشوون البلدية والقروية والسكان', 'وزارة الطاقة', 'وزارة البيئة والمياه والزراعة', 'وزارة الداخلية'];

export interface PaidBill extends NotificationResult {
  readonly amount: number;
  readonly paidAt: string;
  /** Investor task that carried the bill (first payment: "الدفع"). */
  readonly task: string;
  /** True once the payment task left the To-Do list — the click alone is not proof. */
  verified: boolean;
}

/**
 * Investor To-Do tasks handled by the payment helper: "الدفع" (VERIFIED, first payment) and fee
 * tasks named "رسوم …" (seen in To-Do lists, e.g. "رسوم إيجار سطحي" — expected for the second payment).
 */
const PAYMENT_TASK = /الدفع|رسوم/;

export interface WorkflowContext {
  requestNumber: string;
  bills: PaidBill[];
  handledTasks: { side: 'employee' | 'investor'; task: string; decision: string; at: string }[];
  finalStatus?: string;
}

export class UnsupportedTaskError extends Error {
  constructor(side: string, task: string, detail: string) {
    super(`Stopped at ${side} task "${task}": ${detail} — this decision is not covered by the workflow rules, so nothing was submitted.`);
    this.name = 'UnsupportedTaskError';
  }
}

/**
 * Drives one Exploration License request from draft to the end of its approval workflow.
 *
 * It is STATE-DRIVEN, not a fixed script: every round it looks at what is pending — an open
 * employee task, else an investor To-Do task — and handles exactly that, so a re-run resumes
 * wherever the request currently is. Decisions are chosen from the options the task offers,
 * never by position; an option set it does not recognise stops the run (UnsupportedTaskError).
 *
 * Paid bills are recorded in .workflow-state/<request>.json (git-ignored), so a bill is never
 * notified twice, even across runs.
 */
export class ApprovalWorkflow {
  readonly context: WorkflowContext;
  private readonly stateFile: string;

  constructor(
    private readonly investor: InvestorPortal,
    private readonly employee: EmployeePortal,
    requestNumber: string,
  ) {
    // Not under test-results/: Playwright empties that folder at the start of every run.
    this.stateFile = path.resolve('.workflow-state', `${requestNumber}.json`);
    const saved = fs.existsSync(this.stateFile) ? (JSON.parse(fs.readFileSync(this.stateFile, 'utf8')) as WorkflowContext) : undefined;
    this.context = saved ?? { requestNumber, bills: [], handledTasks: [] };
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    fs.writeFileSync(this.stateFile, JSON.stringify(this.context, null, 2));
  }

  private get completedStatus(): string {
    return readVar('EXPECTED_FINAL_STATUS') ?? COMPLETED_STATUS;
  }

  private get rn(): string {
    return this.context.requestNumber;
  }

  /** Bill of the first payment (after GIS review) — empty until captured. */
  get firstBillId(): string {
    return this.context.bills.at(0)?.billId ?? '';
  }

  /** Bill of the second payment (after the fifth approval) — empty until captured. */
  get secondBillId(): string {
    return this.context.bills.at(1)?.billId ?? '';
  }

  // ---------------------------------------------------------------- investor side

  private async investorHome(): Promise<void> {
    await this.investor.page.goto(new URL('Redirect', this.investor.requests.urls.appBaseUrl).toString());
  }

  /** Status shown in the investor's Requests list. */
  async requestStatus(): Promise<string> {
    await this.investorHome();
    const requests = this.investor.requests;
    await requests.open();
    await requests.find(this.rn);
    return requests.cell(this.rn, 'الحالة');
  }

  /** Stage 1: a draft is completed and submitted with the existing wizard automation. */
  async submitDraftIfNeeded(): Promise<{ status: string; steps: StepReport[] }> {
    const status = await this.requestStatus();
    if (!/مسودة/.test(status)) {
      log.investor.info(`Request ${this.rn} is "${status}" — draft submission already done, resuming`);
      return { status, steps: [] };
    }
    assertMutationsAllowed('Submit Exploration License request');
    const wizard = new ExplorationLicenseFlow(this.investor);
    await this.investorHome();
    const steps = await wizard.completeDraft(this.rn);
    await wizard.submit();
    const after = await wizard.statusInList(this.rn);
    expect(after.status, 'Status after draft submission').not.toMatch(/مسودة/);
    log.investor.info(`Draft submitted successfully — status "${after.status}"`);
    return { status: after.status, steps };
  }

  private async investorTasks(): Promise<ToDoListPage> {
    await this.investorHome();
    const todo = new ToDoListPage(this.investor.page);
    await todo.open();
    return todo;
  }

  /** Payment task: acknowledge → bill id → notification → verify the task is gone. */
  private async handlePayment(todo: ToDoListPage, taskType: string): Promise<void> {
    const ordinal = ['first', 'second'].at(this.context.bills.length) ?? `#${this.context.bills.length + 1}`;
    log.investor.info(`Opening "${taskType}" — ${ordinal} payment`);
    await todo.openTask({ requestNumber: this.rn, taskType });
    const paymentPage = new PaymentPage(this.investor.page);
    await paymentPage.expectLoaded();
    const bill = await paymentPage.bill();
    log.billing.info(`Bill ID captured (${ordinal} payment): ${bill.billId} (${bill.description} ${bill.amount})`);
    // Never re-notify a bill, and never mistake an earlier bill for this payment's bill.
    if (this.context.bills.some((b) => b.billId === bill.billId)) {
      throw new Error(`Bill ${bill.billId} was already notified as paid, yet a payment task still shows it. Not notifying twice — check it manually.`);
    }

    const ack = await paymentPage.acknowledge();
    log.investor.info(ack === undefined ? 'No acknowledgement on this payment page' : `Acknowledgment submitted${ack.length ? ` — ${ack.join(' | ')}` : ''}`);

    const utilityPage = await this.investor.page.context().newPage();
    try {
      const utility = new PaymentNotificationPage(utilityPage);
      await utility.open();
      const result = await utility.notify(bill.billId, bill.amount);
      log.payment.info(`Notification called for ${bill.billId} — response: ${result.response || '(empty)'}`);
      this.context.bills.push({ ...result, amount: bill.amount, paidAt: new Date().toISOString(), task: taskType, verified: false });
      this.save();
    } finally {
      await utilityPage.close();
    }

    // The click is not proof: the payment task must leave the investor's To-Do list.
    await expect
      .poll(async () => (await (await this.investorTasks()).search(this.rn)).some((t) => t.taskType === taskType), {
        timeout: 180_000,
        intervals: [10_000],
        message: `Payment of bill ${bill.billId} was not reflected: the "${taskType}" task is still in the To-Do list`,
      })
      .toBe(false);
    const paid = this.context.bills.find((b) => b.billId === bill.billId);
    if (paid) paid.verified = true;
    log.payment.info(`Payment state verified — "${taskType}" task closed for bill ${bill.billId} (${ordinal} payment)`);
    this.context.handledTasks.push({ side: 'investor', task: taskType, decision: `paid ${bill.billId}`, at: new Date().toISOString() });
    this.save();
  }

  // ---------------------------------------------------------------- employee side

  private get taskManagement(): TaskManagementPage {
    return new TaskManagementPage(this.employee.page);
  }

  /**
   * Picks the decision from what the task offers. Every rule below was VERIFIED on TEST (76106):
   *   multi-part assessment (مهمة تقييم المتطلبات الفنية) → every item "تحققت المتطلبات", part by part
   *   أرض متاحة (نظم المعلومات الجغرافية) → and uncheck "الأرض بحاجة إلى الموافقات الحكومية"
   *   قبول التوصية (GIS review, financial review, initial review) → accept the recommendation
   *   التوصية بالقبول (المراجعة العامة) → recommend acceptance
   *   ممتثل (تقييم الامتثال الفني) → compliant
   *   قبول الطلب (موافقه المستوي الخامس — fifth approval) → accept the request
   *   approval levels 1–4 (موافقه المستوي …) and التقييم النهائي → قبول التوصية
   *   تحققت المتطلبات checklist (تقييم القدرة المالية) → every item met
   * Anything else — e.g. الموافقات الحكومية, which requires choosing government entities — stops
   * with UnsupportedTaskError unless GOV_ENTITIES (comma-separated option labels) is configured.
   */
  /**
   * "Does the land need government approvals?" appears ticked by default after some decisions
   * (GIS: "الأرض بحاجة إلى الموافقات الحكومية"; initial review too, per the TEST owner). It must be
   * unticked, otherwise a "الموافقات الحكومية" task is generated.
   */
  private async untickGovernmentApprovals(response: TaskResponsePage): Promise<void> {
    const state = await response.ensureUnchecked(/الموافقات الحكومية|موافقات حكومية/);
    log.employee.info(`Government-approvals question: ${state}`);
  }

  private async decide(response: TaskResponsePage, task: EmployeeTask): Promise<string> {
    if (await response.isPartWizard()) {
      const perPart = await response.completePartWizard();
      log.employee.info(`Requirements Are Met selected on all parts: ${perPart.join(' + ')} items`);
      return `تحققت المتطلبات (${perPart.join('+')} items)`;
    }
    const options = await response.decisions();
    log.employee.info(`Task "${task.taskType}" (type ${response.taskTypeId()}) offers: ${options.join(' | ') || 'no decision options'}`);
    const pick = ['أرض متاحة', 'قبول التوصية', 'التوصية بالقبول', 'ممتثل', 'قبول الطلب'].find((o) => options.includes(o));
    if (pick) {
      await response.choose(pick);
      log.employee.info(`${pick} selected`);
      await this.untickGovernmentApprovals(response);
      return pick;
    }
    if (options.includes('تحققت المتطلبات')) {
      const items = await response.markAllRequirementsMet();
      log.employee.info(`Requirements Are Met selected on ${items} item(s)`);
      return `تحققت المتطلبات (${items} items)`;
    }
    const multi = await response.requiredMultiSelect();
    if (multi) {
      const configured = readVar('GOV_ENTITIES');
      const wanted = configured ? configured.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_GOV_ENTITIES;
      const available = await new MultiSelect(multi).options();
      if (!wanted.length) {
        throw new UnsupportedTaskError('employee', task.taskType, `it requires choosing from: ${available.join(' | ')}. Set GOV_ENTITIES to decide`);
      }
      const chosen = await new MultiSelect(multi).select(wanted);
      log.employee.info(`Selected: ${chosen.join(', ')}`);
      return chosen.join(', ');
    }
    throw new UnsupportedTaskError('employee', task.taskType, `options offered: ${options.join(' | ') || 'none'}`);
  }

  private async handleEmployeeTask(task: EmployeeTask): Promise<void> {
    log.employee.info(`Request ${this.rn} — task "${task.taskType}" (${task.status}${task.assignee ? `, ${task.assignee}` : ''})`);
    const assignment = await this.taskManagement.assignToSelf(task);
    log.employee.info(`Task ${assignment === 'assigned' ? 'assigned successfully' : 'already assigned'}`);
    const response = await this.taskManagement.openResponse(task);
    try {
      await response.openRespondTab();
      const decision = await this.decide(response, task);
      if (await response.fillDescriptionIfEmpty(EMPLOYEE_NOTE)) log.employee.info('Description filled');
      let errors = await response.submit();
      // A generic server failure (seen once on TEST when submitting ~10 s after the previous task) is
      // transient: retry the same submit once. Real validation messages are never retried.
      if (errors.length && errors.every((e) => /Request failed with an error/i.test(e))) {
        log.employee.warn(`Server error on submit (${errors.join(" | ")}) — retrying once in 5 s`);
        await response.page.waitForTimeout(5_000);
        errors = await response.submit();
      }
      if (errors.length) throw new WizardValidationError(`employee task "${task.taskType}"`, errors);
      log.employee.info(`Task "${task.taskType}" submitted — ${decision}`);
      this.context.handledTasks.push({ side: 'employee', task: task.taskType, decision, at: new Date().toISOString() });
      this.save();
    } finally {
      if (!response.page.isClosed()) await response.page.close();
    }
  }

  // ---------------------------------------------------------------- orchestration

  /** One round: handles the first pending task found. Returns false when nothing was pending. */
  private async step(): Promise<boolean> {
    const open = (await this.taskManagement.search(this.rn)).filter((t) => OPEN_TASK_STATUSES.some((s) => t.status.includes(s)));
    if (open.length) {
      await this.handleEmployeeTask(open[0]);
      return true;
    }
    const todo = await this.investorTasks();
    const investorTasks = await todo.search(this.rn);
    if (investorTasks.length) {
      const task = investorTasks[0];
      log.investor.info(`To-Do task found: "${task.taskType}"`);
      if (!PAYMENT_TASK.test(task.taskType)) {
        throw new UnsupportedTaskError('investor', task.taskType, 'only payment tasks ("الدفع" / "رسوم …") are automated on the investor side');
      }
      await this.handlePayment(todo, task.taskType);
      return true;
    }
    return false;
  }

  /**
   * Runs rounds until nothing is pending for WORKFLOW_IDLE_MS (default 3 min) or the request
   * reaches a dead status. Bounded by WORKFLOW_MAX_ROUNDS (default 25).
   */
  async run(): Promise<WorkflowContext> {
    const maxRounds = readNumber('WORKFLOW_MAX_ROUNDS', 25);
    const idleMs = readNumber('WORKFLOW_IDLE_MS', 180_000);
    for (let round = 1; round <= maxRounds; round++) {
      log.workflow.info(`Round ${round}: looking for pending tasks on ${this.rn}`);
      if (await this.step()) continue;

      const status = await this.requestStatus();
      if (DEAD_STATUSES.some((r) => r.test(status))) throw new Error(`Request ${this.rn} ended as "${status}".`);
      if (status.includes(this.completedStatus)) {
        this.context.finalStatus = status;
        this.save();
        log.workflow.info(`Request ${this.rn} reached "${status}" — workflow completed`);
        return this.context;
      }
      log.workflow.info(`No pending task — status "${status}". Waiting up to ${idleMs / 1000}s for the next task`);
      let appeared = false;
      await expect
        .poll(
          async () => {
            appeared = (await this.taskManagement.search(this.rn)).some((t) => OPEN_TASK_STATUSES.some((s) => t.status.includes(s))) ||
              (await (await this.investorTasks()).search(this.rn)).length > 0;
            return appeared;
          },
          { timeout: idleMs, intervals: [15_000] },
        )
        .toBe(true)
        .catch(() => undefined);
      if (!appeared) {
        this.context.finalStatus = await this.requestStatus();
        this.save();
        log.workflow.info(`No further tasks — final request status "${this.context.finalStatus}"`);
        return this.context;
      }
    }
    throw new Error(`Stopped after ${maxRounds} rounds without the workflow settling (WORKFLOW_MAX_ROUNDS).`);
  }
}

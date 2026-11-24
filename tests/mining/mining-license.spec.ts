import fs from 'fs';
import path from 'path';
import { TestInfo } from '@playwright/test';
import { expect, test } from '@fixtures/test';
import { EnvName, getEnvName, getRequestNumber, readVar, UserKey } from '@config/index';
import { FeedbackMessage } from '@components/FeedbackMessage';
import { EmployeePortal } from '@pages/employee/EmployeePortal';
import { InvestorPortal } from '@pages/investor/InvestorPortal';
import { RequestNotFoundError } from '@pages/investor/RequestsPage';
import { PaymentPage } from '@pages/investor/PaymentPage';
import { SmallMiningSubmission } from '@pages/investor/small-mining/SmallMiningLicensePage';
import { ApprovalWorkflow } from '@flows/approval-workflow.flow';
import { miningLicenseData } from '@data/mining-license.data';
import { splitRules, WizardValidationError } from '@utils/validation';

/**
 * Run settings for this file.
 *
 *   env                 → environment this file runs on; overrides TEST_ENV from .env / npm scripts.
 *                         Only AUTHORISED_ENVS may run it (it creates, pays and completes real requests); 'prod' is refused.
 *   licenses            → how many new mining licences to create, all in parallel (one test each, own browser contexts).
 *   explorationLicences → the investor's exploration licence(s) ("رخصة الكشف") each new request is built on; licence #n uses
 *                         entry n, so `licenses` > 1 needs that many DIFFERENT licences. '' = the first one the wizard offers.
 *                         One licence carries ONE request: when an earlier run already opened a request on the licence
 *                         (.workflow-state/mining-licence-<licence>.json) and it is still open, that request is continued
 *                         instead of opening a second one (the map refuses a second part of it: "تقاطع المواقع").
 *   request             → '' : create NEW requests; '<number>' : continue that request (a draft is completed and submitted,
 *                         a submitted one is paid and approved). REQUEST_NUMBER overrides it per run.
 *   bill                → SADAD bill of a resumed request that is still "بإنتظار الدفع" (shown in the submit dialog);
 *                         normally read from .workflow-state/<request>.submission.json. BILL_NUMBER overrides it.
 *   investor / employee → who submits and pays / who answers the employee tasks. Credentials come from .env:
 *                         <ENV>_<USER>_USERNAME / <ENV>_<USER>_PASSWORD.
 *   stopAt              → stop the workflow when this employee task opens (left untouched); undefined = until "مكتمل".
 *
 * How many run AT THE SAME TIME is capped by Playwright's worker count (WORKERS in .env or --workers).
 */
const RUN: {
  env: EnvName;
  licenses: number;
  explorationLicences: string[];
  request: string;
  bill: string;
  investor: UserKey;
  employee: UserKey;
  stopAt?: RegExp;
} = {
  env: 'uat',
  licenses: 1,
  explorationLicences: ['20260311487'],
  request: '',
  bill: '',
  investor: 'investor1',
  employee: 'employee1',
  //stopAt: /الامتثال الفني/,
};

/** Environments where creating, paying and completing new requests is allowed. */
const AUTHORISED_ENVS: readonly EnvName[] = ['test', 'uat'];

/** Times to place the location again when Next still asks for the map confirmation. */
const LOCATION_SAVE_RETRIES = 3;

if (RUN.env === 'prod') throw new Error('mining-license.spec.ts must never run on PROD.');
process.env.TEST_ENV = RUN.env;
if (RUN.stopAt) process.env.WORKFLOW_IDLE_MS ??= String(10 * 60_000);
test.use({ investorUser: RUN.investor, employeeUser: RUN.employee });

/**
 * "إصدار رخصة تعدين" (mining licence) — from a new request to "مكتمل". Same Licenses_MSM wizard and page object as the
 * small mine licence (tests/small-mining), opened with In_LicenseType=8:
 *
 *   1. Investor: Requests → "طلب جديد" → "إصدار رخصة تعدين" → 10-step wizard (Licenses_MSM)
 *   2. معلومات الرخصة: declarations, exploration licence (RUN.explorationLicences), duration, minerals
 *   3. موقع الرخصة: "حدد جزءًا من الموقع" — a part of the exploration licence under 1 km² (the licence corners shrunk),
 *      checked on the map and confirmed ("نجاح"); another part is tried when the map refuses one
 *   4. Steps 3–9 (feasibility, social, environmental, rehabilitation, financial capability, attachments, terms):
 *      every empty field filled, every empty "إضافة" section added through its popup, the technical team added
 *   5. الدفع: acknowledgement → "إرسال" → request number + SADAD bill from the success dialog
 *   6. The bill is paid through the TEST payment utility; the request leaves "بإنتظار الدفع"
 *   7. Employee tasks, further payments and approvals (ApprovalWorkflow) until the status is "مكتمل"
 *
 *   npm run test:mining
 *   $env:REQUEST_NUMBER="<request>"; $env:BILL_NUMBER="<bill>"; npm run test:mining   ← continue a request
 *
 * Other values: src/data/mining-license.data.ts (starts from the small mine defaults).
 */
test.describe.configure({ mode: 'parallel' });

const resumed = readVar('REQUEST_NUMBER') ?? RUN.request.trim();
const count = resumed ? 1 : RUN.licenses;
const licences = Array.from({ length: count }, (_, i) => RUN.explorationLicences[i]?.trim() ?? '');
// Parallel requests on one exploration licence collide on the map ("تقاطع المواقع"): one licence per request.
if (count > 1 && (licences.some((l) => !l) || new Set(licences).size < count)) {
  throw new Error(
    `RUN.licenses = ${count} needs ${count} different exploration licences in RUN.explorationLicences (one request per licence); ` +
      `got: ${licences.map((l) => l || "''").join(', ')}.`,
  );
}
for (let n = 1; n <= count; n++) {
  const licence = licences[n - 1];
  const title = count > 1 ? ` #${n}` : '';
  test(`Mining licence${title}: create, pay and complete @e2e`, async ({ investor, employee }, testInfo) => {
    await createAndCompleteLicence(investor, employee, testInfo, licence);
  });
}

const submissionFile = (requestNumber: string) => path.resolve('.workflow-state', `${requestNumber}.submission.json`);

/** The mining licence request a run opened on an exploration licence — written as soon as step 1 is saved. */
const licenceRecordFile = (licence: string) => path.resolve('.workflow-state', `mining-licence-${licence}.json`);

function recordedRequest(licence: string): string | undefined {
  const file = licenceRecordFile(licence);
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as { requestNumber?: string }).requestNumber : undefined;
}

function recordRequest(licence: string, requestNumber: string): void {
  fs.mkdirSync(path.dirname(licenceRecordFile(licence)), { recursive: true });
  fs.writeFileSync(licenceRecordFile(licence), JSON.stringify({ licence, requestNumber, at: new Date().toISOString() }, null, 2));
}

/** Statuses after which the licence is free again for a new request. */
const CLOSED_STATUS = /مرفوض|رفض|ملغ[يى]|إلغاء|الغاء|محذوف/;

/**
 * The request an earlier run opened on `licence` while it is still open (draft, awaiting payment, under review), or
 * undefined when there is none or it was rejected / cancelled / deleted. A completed one means the licence is used up.
 */
async function openRequestOn(investor: InvestorPortal, employee: EmployeePortal, licence: string): Promise<{ requestNumber: string; status: string } | undefined> {
  const requestNumber = recordedRequest(licence);
  if (!requestNumber) return undefined;
  let status: string;
  try {
    status = await new ApprovalWorkflow(investor, employee, requestNumber).requestStatus();
  } catch (e) {
    if (e instanceof RequestNotFoundError) return undefined;
    throw e;
  }
  if (CLOSED_STATUS.test(status)) return undefined;
  if (/مكتمل/.test(status)) {
    throw new Error(
      `Exploration licence ${licence} already produced mining licence request ${requestNumber} ("${status}"). A second request ` +
        `on it is refused by the map ("تقاطع المواقع") — put another exploration licence in RUN.explorationLicences.`,
    );
  }
  return { requestNumber, status };
}

async function createAndCompleteLicence(investor: InvestorPortal, employee: EmployeePortal, testInfo: TestInfo, explorationLicence: string): Promise<void> {
  test.setTimeout(150 * 60_000);
  test.skip(!AUTHORISED_ENVS.includes(getEnvName()), `Creates, pays and completes requests — authorised on ${AUTHORISED_ENVS.join(', ')} only.`);
  const data = miningLicenseData();
  const wizard = investor.miningLicense;
  let requestNumber = resumed ? getRequestNumber(resumed) : '';
  if (!requestNumber && explorationLicence) {
    const open = await test.step(`Exploration licence ${explorationLicence}: request already open on it?`, () => openRequestOn(investor, employee, explorationLicence));
    if (open) {
      requestNumber = open.requestNumber;
      testInfo.annotations.push({ type: 'continued open request', description: `${requestNumber} (${open.status}) on exploration licence ${explorationLicence}` });
    }
  }
  /** An existing request is continued (REQUEST_NUMBER / RUN.request, or the one already open on the licence). */
  const continuing = !!requestNumber;
  let workflow = requestNumber ? new ApprovalWorkflow(investor, employee, requestNumber) : undefined;
  let submission: SmallMiningSubmission | undefined;

  try {
    // ---------------------------------------------------------------- investor wizard
    let wizardOpen = false;
    if (!requestNumber) {
      await test.step(`Investor: Requests → طلب جديد → ${data.serviceType}`, async () => {
        await investor.requests.open();
        await investor.requests.startNewRequest(data.serviceType);
        await wizard.expectLoaded();
        await wizard.wizard.expectActive(0);
      });
      wizardOpen = true;
    } else {
      const status = await workflow!.requestStatus();
      testInfo.annotations.push({ type: 'resumed request', description: `${requestNumber} (${status})` });
      if (/مسودة/.test(status)) {
        await test.step(`Investor: open draft ${requestNumber}`, async () => {
          await investor.requests.rowAction(requestNumber, 'تعديل');
          await wizard.expectLoaded();
        });
        wizardOpen = true;
      }
    }

    if (wizardOpen) {
      await test.step('Step 1 — معلومات الرخصة', async () => {
        const used = await wizard.fillLicenceInformation(explorationLicence, data.licenceInformation);
        testInfo.annotations.push({ type: 'exploration licence', description: `${used.licence} · ${data.licenceInformation.durationYears} yr · ${used.minerals.join(', ')}` });
        // '' took the first offered licence, unchecked so far: never open a second request on it (nothing saved yet).
        const earlier = !continuing && !explorationLicence ? recordedRequest(used.licence) : undefined;
        if (earlier) {
          throw new Error(
            `Exploration licence ${used.licence} (the first one offered) already has request ${earlier} from an earlier run. Put ` +
              `${used.licence} in RUN.explorationLicences to continue that request (a new one is opened if it was rejected or ` +
              `cancelled), or choose another licence.`,
          );
        }
        const saved = await wizard.saveLicenceInformation();
        if (requestNumber) expect(saved, 'Request number of the opened draft').toBe(requestNumber);
        requestNumber = saved;
        recordRequest(used.licence, requestNumber);
        testInfo.annotations.push({ type: 'request', description: requestNumber });
        workflow = new ApprovalWorkflow(investor, employee, requestNumber);
        expect(await wizard.activeStep()).toBe('موقع الرخصة');
      });

      await test.step(`Step 2 — موقع الرخصة: part of the exploration licence under ${data.location.maxAreaKm2} km², map confirmation`, async () => {
        try {
          // A resumed draft may already have a confirmed location: try Next first.
          if (continuing) {
            const change = await wizard.wizard.next();
            if (change.moved) return;
            await new FeedbackMessage(investor.page).closeAll();
          }
          for (let round = 1; ; round++) {
            await wizard.fillLocation(data.location);
            const change = await wizard.wizard.next();
            if (change.moved) break;
            const rules = splitRules(change.errors);
            if (round >= LOCATION_SAVE_RETRIES || !rules.some((r) => /الخريطة|الموقع/.test(r))) throw new WizardValidationError(change.from, rules);
            testInfo.annotations.push({ type: `location not saved (${round})`, description: rules.join(' | ') });
            await new FeedbackMessage(investor.page).closeAll();
          }
        } finally {
          if (wizard.attempts.length) await testInfo.attach('location-attempts.json', { body: JSON.stringify(wizard.attempts, null, 2), contentType: 'application/json' });
        }
        expect(await wizard.activeStep()).toBe('دراسة الجدوى الاقتصادية');
      });

      await test.step('Steps 3–9 — studies, attachments, terms', async () => {
        const report: Record<string, string[]> = {};
        for (let label = await wizard.activeStep(); label !== 'الدفع'; label = await wizard.next()) {
          report[label] = await wizard.fillCurrentStep(data);
        }
        await testInfo.attach('wizard-steps.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
      });

      await test.step('Step 10 — الدفع: acknowledgement → إرسال → request number and SADAD bill', async () => {
        submission = await wizard.submit();
        expect(submission.requestNumber, 'Request number in the success dialog').toBe(requestNumber);
        expect(submission.billId, 'SADAD bill in the success dialog').toMatch(/^\d{6,}$/);
        fs.mkdirSync(path.dirname(submissionFile(requestNumber)), { recursive: true });
        fs.writeFileSync(submissionFile(requestNumber), JSON.stringify(submission, null, 2));
        testInfo.annotations.push({ type: 'submission bill', description: `${submission.billId} (${submission.amount})` });
      });
    }

    // ---------------------------------------------------------------- fee payment
    if (!submission) {
      const billNumber = readVar('BILL_NUMBER') ?? RUN.bill.trim();
      if (billNumber) submission = { requestNumber, billId: billNumber, amount: 10_000, description: 'رسوم تقديم الرخصة' };
      else if (fs.existsSync(submissionFile(requestNumber))) submission = JSON.parse(fs.readFileSync(submissionFile(requestNumber), 'utf8'));
    }
    // The submission fee is the first payment: once anything was paid or handled, a later "بإنتظار الدفع" belongs to a
    // To-Do payment task (the final "دفع رسوم الرخصة") that the workflow pays itself.
    const { bills, handledTasks } = workflow!.context;
    const feeHandled = bills.some((b) => b.verified) || handledTasks.length > 0;
    const status = await workflow!.requestStatus();
    if (!feeHandled && /بإنتظار الدفع|بانتظار الدفع/.test(status)) {
      if (!submission) {
        // The success dialog was missed (e.g. "إرسال" answered "The connection has timed out" but the server submitted):
        // the Requests row "⋯" → "ادفع" opens the payment page with the bill (VERIFIED on UAT 2026-11-22, request 9645).
        submission = await test.step(`Read the SADAD bill: Requests → ⋯ → ادفع (request ${requestNumber})`, async () => {
          await investor.requests.rowAction(requestNumber, 'ادفع'); // requestStatus() left the row listed
          const payment = new PaymentPage(investor.page);
          await payment.expectLoaded();
          const bill = await payment.bill();
          return { requestNumber, ...bill };
        });
        fs.mkdirSync(path.dirname(submissionFile(requestNumber)), { recursive: true });
        fs.writeFileSync(submissionFile(requestNumber), JSON.stringify(submission, null, 2));
        testInfo.annotations.push({ type: 'submission bill (from ادفع)', description: `${submission.billId} (${submission.amount})` });
      }
      await test.step(`Pay the licence fee — bill ${submission.billId} (${submission.amount})`, async () => {
        await workflow!.paySubmissionBill({ billId: submission!.billId, amount: submission!.amount, description: submission!.description });
      });
      await test.step('Request is submitted and paid', async () => {
        const now = await workflow!.requestStatus();
        testInfo.annotations.push({ type: 'status after payment', description: now });
        expect(now, `Status of request ${requestNumber}`).not.toMatch(/مسودة|بإنتظار الدفع|بانتظار الدفع/);
      });
    } else testInfo.annotations.push({ type: 'status', description: status });

    // ---------------------------------------------------------------- approvals
    const stepTitle = RUN.stopAt ? `Employee tasks and payments until the task matching ${RUN.stopAt}` : 'Employee tasks, payments and approvals until the request is completed';
    await test.step(stepTitle, async () => {
      const { stoppedAt, handledTasks } = await workflow!.run({ stopAt: RUN.stopAt });
      testInfo.annotations.push({ type: 'tasks handled', description: handledTasks.map((t) => `${t.side}: ${t.task}`).join(' → ') });
      if (RUN.stopAt) {
        expect(stoppedAt, `Workflow reached the employee task matching ${RUN.stopAt}`).toBeTruthy();
        testInfo.annotations.push({ type: 'stopped at', description: stoppedAt! });
      }
    });
    if (RUN.stopAt) return;

    await test.step('Payments distinct and verified, final status', async () => {
      const { bills, finalStatus } = workflow!.context;
      testInfo.annotations.push({ type: 'bills', description: bills.map((b) => `${b.task}: ${b.billId}`).join(' · ') || '(none)' });
      expect(new Set(bills.map((b) => b.billId)).size, 'Every payment used a different bill').toBe(bills.length);
      for (const bill of bills) expect(bill.verified, `Payment of bill ${bill.billId} was verified`).toBe(true);
      testInfo.annotations.push({ type: 'final status', description: finalStatus ?? '' });
      expect(finalStatus ?? '').toContain(readVar('EXPECTED_FINAL_STATUS') ?? 'مكتمل');
    });
  } finally {
    if (workflow) await testInfo.attach('workflow-context.json', { body: JSON.stringify(workflow.context, null, 2), contentType: 'application/json' });
  }
}

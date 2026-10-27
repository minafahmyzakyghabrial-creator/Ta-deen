import { TestInfo } from '@playwright/test';
import { expect, test } from '@fixtures/test';
import { EnvName, getEnvName, readVar, UserKey } from '@config/index';
import { EmployeePortal } from '@pages/employee/EmployeePortal';
import { InvestorPortal } from '@pages/investor/InvestorPortal';
import { ApprovalWorkflow } from '@flows/approval-workflow.flow';
import { ExplorationLicenseFlow } from '@flows/exploration-license.flow';
import { StepReport } from '@pages/investor/exploration-license/WizardStep';
import { newExplorationRequestData } from '@data/new-exploration-request.data';
import { splitRules, WizardValidationError } from '@utils/validation';

/**
 * Run settings for this file.
 *
 *   env       → environment this file runs on; overrides TEST_ENV from .env / npm scripts.
 *               Only AUTHORISED_ENVS may run it (it creates and completes real requests); 'prod' is refused.
 *   licenses  → how many new licenses to create, all in parallel (one test each, own browser contexts).
 *   investor  → investor who creates, submits and pays the requests ('investor1', 'investor2', …)
 *   employee  → employee who completes the tasks and approvals ('employee1', 'employee2', …)
 *               Credentials come from .env: <ENV>_<USER>_USERNAME / <ENV>_<USER>_PASSWORD,
 *               e.g. UAT_INVESTOR2_USERNAME / UAT_INVESTOR2_PASSWORD.
 *
 * How many run AT THE SAME TIME is capped by Playwright's worker count, which can only be set in
 * playwright.config / on the command line — not per file. Default here: half the CPU cores (2 on a
 * 4-core machine). To run all licenses at once, set WORKERS in .env (e.g. WORKERS=3) or pass --workers:
 *
 *   npx playwright test tests/exploration-license/new-exploration-license.spec.ts --project=chromium --workers=3
 */
const RUN: { env: EnvName; licenses: number; investor: UserKey; employee: UserKey } = {
  env: 'test',
  licenses: 1,
  investor: 'investor3',
  employee: 'employee1',
};

/** Environments where creating and completing new requests is allowed. */
const AUTHORISED_ENVS: readonly EnvName[] = ['test', 'uat'];

if (RUN.env === 'prod') throw new Error('new-exploration-license.spec.ts must never run on PROD.');
process.env.TEST_ENV = RUN.env;
test.use({ investorUser: RUN.investor, employeeUser: RUN.employee });

/**
 * Step 1 — "مدة الرخصة والمعادن المطلوبة". Set your values here; they override the defaults.
 * Use the labels exactly as the screen shows them.
 */
const LICENSE_DETAILS = {
  /** فئة الرخصة: 'أ' | 'ب' | 'ج' */
  category: 'أ',
  /** مدة الرخصة (سنوياً): '1' … '5' */
  durationYears: '1',
  /** المعادن: one or more, e.g. ['ذهب'] or ['ذهب', 'نحاس'] — the list depends on the category */
  minerals: ['كسر رخام'],
  /** المجمع التعديني: 'داخل المجمعات التعدينية' | 'خارج المجمعات التعدينية' */
  miningComplex: 'خارج المجمعات التعدينية',
};

/** Step 2 — how long to wait for the GIS map (iframe load, "تأكيد" button, validation result) per KML attempt. */
const GIS_MAP_TIMEOUT_MS = 5 * 60_000;

/**
 * New Exploration License — creates a request from scratch and completes it end to end:
 *
 *   1. Investor: Requests → "طلب جديد" → service type → new wizard
 *   2. Step 1 "معلومات الطلب": declarations, LICENSE_DETAILS (above), geologist
 *   3. Step 2 "موقع الطلب": generate a clockwise KML → upload → "انظر على الخريطة" → map iframe;
 *      on a map error ("تقاطع المواقع", …) generate a new KML elsewhere and retry until "تأكيد" works
 *   4. Steps 3–8 filled exactly as in the draft test, then "إرسال" (submit)
 *   5. Employee tasks, both payments and all approvals (same ApprovalWorkflow as the draft test)
 *      until the request status is "مكتمل"
 *
 *   npx playwright test tests/exploration-license/new-exploration-license.spec.ts --project=chromium --headed
 *
 * Each run creates RUN.licenses NEW requests on RUN.env. Other step-1 data: src/data/new-exploration-request.data.ts.
 */
test.describe.configure({ mode: 'parallel' });

for (let license = 1; license <= RUN.licenses; license++) {
  const title = RUN.licenses > 1 ? ` #${license}` : '';
  test(`Exploration License: new request${title} — create, submit and complete @e2e`, async ({ investor, employee }, testInfo) => {
    await createAndCompleteLicense(investor, employee, testInfo);
  });
}

async function createAndCompleteLicense(investor: InvestorPortal, employee: EmployeePortal, testInfo: TestInfo): Promise<void> {
  test.setTimeout(60 * 60_000);
  test.skip(!AUTHORISED_ENVS.includes(getEnvName()), `Creates and completes new requests — authorised on ${AUTHORISED_ENVS.join(', ')} only.`);
  const data = newExplorationRequestData();
  const license = investor.explorationLicense;
  const wizard = license.wizard;
  const flow = new ExplorationLicenseFlow(investor);
  let requestNumber = '';
  let workflow: ApprovalWorkflow | undefined;

  const next = async () => {
    const change = await wizard.next();
    if (!change.moved) throw new WizardValidationError(change.from, splitRules(change.errors));
    return change;
  };

  try {
    await test.step(`Investor: Requests → طلب جديد → ${data.serviceType}`, async () => {
      await investor.requests.open();
      await investor.requests.startNewRequest(data.serviceType);
      await license.expectNewLoaded();
      await wizard.expectActive(0);
    });

    await test.step('Step 1 — معلومات الطلب', async () => {
      testInfo.annotations.push({
        type: 'licence details',
        description: `${LICENSE_DETAILS.category} · ${LICENSE_DETAILS.durationYears} yr · ${LICENSE_DETAILS.minerals.join(', ')} · ${LICENSE_DETAILS.miningComplex}`,
      });
      const report = await license.requestInfo.fill({ ...data.requestInfo, ...LICENSE_DETAILS, attachment: 'test-data/attachments/sample.pdf' });
      await testInfo.attach('step1-report.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
      // Saving step 1 creates the request and returns its number. Reading it here (not as the newest row of
      // the Requests list) keeps parallel runs from picking up each other's request.
      const saved = investor.page.waitForResponse((r) => r.url().includes('/ActionSave_licenseInfo'), { timeout: 120_000 });
      await next();
      const { data: savedData } = await (await saved).json();
      requestNumber = String(savedData?.LicenseReqId ?? '');
      expect(requestNumber, 'Request number returned when step 1 was saved').toMatch(/^\d+$/);
      testInfo.annotations.push({ type: 'request', description: requestNumber });
      workflow = new ApprovalWorkflow(investor, employee, requestNumber);
      await wizard.expectActive(1);
    });

    await test.step('Step 2 — موقع الطلب: KML upload, map check, retry until confirmed', async () => {
      const location = license.location;
      try {
        await location.fill({ ...data.location, mapTimeoutMs: GIS_MAP_TIMEOUT_MS });
      } finally {
        await testInfo.attach('location-attempts.json', { body: JSON.stringify(location.attempts, null, 2), contentType: 'application/json' });
      }
      testInfo.annotations.push({ type: 'location attempts', description: String(location.attempts.length) });
      const change = await next();
      expect(change.to).toBe('خطة العمل و الانفاق');
    });

    await test.step('Steps 3–8 — same as the draft test, then submit', async () => {
      const reports: StepReport[] = [];
      for (;;) {
        reports.push(await flow.fillCurrentStep());
        if (await flow.isOnLastStep()) break;
        await flow.next();
      }
      await testInfo.attach('wizard-step-report.json', { body: JSON.stringify(reports, null, 2), contentType: 'application/json' });
      await flow.submit();
      const status = await workflow!.requestStatus();
      expect(status, 'Status after submission').not.toMatch(/مسودة/);
      testInfo.annotations.push({ type: 'status after submission', description: status });
    });

    await test.step('Employee tasks, payments and approvals until the request is completed', async () => {
      await workflow!.run();
    });

    await test.step('Payments distinct and verified, final status', async () => {
      const { bills, finalStatus } = workflow!.context;
      testInfo.annotations.push({ type: 'first bill', description: workflow!.firstBillId || '(none)' });
      testInfo.annotations.push({ type: 'second bill', description: workflow!.secondBillId || '(none)' });
      expect(new Set(bills.map((b) => b.billId)).size, 'Every payment used a different bill').toBe(bills.length);
      for (const bill of bills) expect(bill.verified, `Payment of bill ${bill.billId} was verified`).toBe(true);
      testInfo.annotations.push({ type: 'final status', description: finalStatus ?? '' });
      expect(finalStatus ?? '').toContain(readVar('EXPECTED_FINAL_STATUS') ?? 'مكتمل');
    });
  } finally {
    if (workflow) {
      await testInfo.attach('workflow-context.json', { body: JSON.stringify(workflow.context, null, 2), contentType: 'application/json' });
    }
  }
}

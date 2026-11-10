import { expect, test } from '@fixtures/test';
import { EnvName, getEnvName, getRequestNumber, readVar, UserKey } from '@config/index';
import { ApprovalWorkflow } from '@flows/approval-workflow.flow';

/**
 * Run settings for this file.
 *
 *   env      → environment; overrides TEST_ENV. TEST only: the payments go through the TEST payment utility.
 *   request  → a SUBMITTED "إصدار رخصة مواد بناء للمشاريع العامة خارج نطاق المشروع" request
 *              (public-project-license.spec.ts prints it). REQUEST_NUMBER overrides it per run.
 *   investor → the investor who owns the request; employee → the employee who answers the tasks.
 */
const RUN: { env: EnvName; request: string; investor: UserKey; employee: UserKey } = {
  env: 'test',
  request: '77043',
  investor: 'investor2',
  employee: 'employee1',
};

if (RUN.env === 'prod') throw new Error('public-project-workflow.spec.ts must never run on PROD.');
process.env.TEST_ENV = RUN.env;
test.use({ investorUser: RUN.investor, employeeUser: RUN.employee });

/**
 * Public projects building-materials licence — employee side of a submitted request, to the end of the workflow.
 * Order seen on TEST (76900):
 *
 *   employee  نظم المعلومات الجغرافية → مراجعة نظم المعلومات الجغرافية
 *   investor  رسوم الطلب (payment) + الضمان المالي (guarantee form)
 *   employee  تقييم القدرة الفنية · مهمة تقييم الاستدامة · التقييم المالي · تقييم الضمان المالي → مهمة المراجعة العامة
 *   investor  التصريح البيئي (permit form)
 *   employee  تقييم التصريح البيئي → المراجعة المبدئية → التقييم النهائي → موافقة المستوى الأول / الثاني / الثالث
 *   investor  دفع المقابل المالي → دفع الايجار السطحي → الدفع
 *
 * The workflow is state-driven and resumable: each round it handles whatever task is pending, so re-running
 * continues where the request is. Paid bills are kept in .workflow-state/<request>.json and never notified twice.
 *
 *   npm run test:public-project:workflow
 *   $env:REQUEST_NUMBER="77043"; npm run test:public-project:workflow
 *
 * Optional: EXPECTED_FINAL_STATUS=<status text> (default "مكتمل").
 */
test('Public projects building-materials licence: employee workflow to the end @workflow', async ({ investor, employee }, testInfo) => {
  test.setTimeout(90 * 60_000);
  test.skip(getEnvName() !== 'test', 'Uses the TEST payment utility — authorised on TEST only.');
  const requestNumber = getRequestNumber(RUN.request);
  testInfo.annotations.push({ type: 'request', description: requestNumber });
  const workflow = new ApprovalWorkflow(investor, employee, requestNumber);

  try {
    await test.step(`Request ${requestNumber} is submitted (not a draft)`, async () => {
      const status = await workflow.requestStatus();
      testInfo.annotations.push({ type: 'status at start', description: status });
      expect(status, `Request ${requestNumber} must be submitted first (public-project-license.spec.ts)`).not.toMatch(/مسودة/);
    });

    await test.step('Employee tasks ↔ investor payments and forms, until the request settles', async () => {
      await workflow.run();
    });

    await test.step('Payments: every bill distinct and verified', async () => {
      const { bills } = workflow.context;
      testInfo.annotations.push({ type: 'bills', description: bills.map((b) => `${b.task}: ${b.billId}`).join(' · ') || '(none)' });
      expect(new Set(bills.map((b) => b.billId)).size, 'Every payment used a different bill').toBe(bills.length);
      for (const bill of bills) expect(bill.verified, `Payment of bill ${bill.billId} was verified`).toBe(true);
    });

    await test.step('Final request status', async () => {
      const finalStatus = workflow.context.finalStatus ?? '';
      testInfo.annotations.push({ type: 'final status', description: finalStatus });
      expect(finalStatus).toContain(readVar('EXPECTED_FINAL_STATUS') ?? 'مكتمل');
    });
  } finally {
    testInfo.annotations.push({ type: 'tasks handled', description: workflow.context.handledTasks.map((t) => `${t.side}: ${t.task} (${t.decision})`).join(' → ') });
    await testInfo.attach('workflow-context.json', { body: JSON.stringify(workflow.context, null, 2), contentType: 'application/json' });
  }
});

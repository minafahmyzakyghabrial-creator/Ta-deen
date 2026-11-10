import { expect, test } from '@fixtures/test';
import { EnvName, getEnvName, getRequestNumber, UserKey } from '@config/index';
import { ApprovalWorkflow, PUBLIC_PROJECTS_FINAL_PAYMENT } from '@flows/approval-workflow.flow';

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
 * The run ends once the final "الدفع" is paid and its task closes. It does not wait for "مكتمل": TEST can relist the
 * paid task for minutes before the request completes (77043, 77053).
 */
test('Public projects building-materials licence: employee workflow to the final payment @workflow', async ({ investor, employee }, testInfo) => {
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

    await test.step('Employee tasks ↔ investor payments and forms, until the final "الدفع" is paid', async () => {
      await workflow.run({ stopAfterPayment: PUBLIC_PROJECTS_FINAL_PAYMENT });
    });

    await test.step('Every payment verified, the last one "الدفع"', async () => {
      const { bills } = workflow.context;
      testInfo.annotations.push({ type: 'bills', description: bills.map((b) => `${b.task}: ${b.billId}`).join(' · ') || '(none)' });
      expect(new Set(bills.map((b) => b.billId)).size, 'Every payment used a different bill').toBe(bills.length);
      for (const bill of bills) expect(bill.verified, `Payment of bill ${bill.billId} was verified`).toBe(true);
      expect(bills.at(-1)?.task ?? '', 'Last payment').toMatch(PUBLIC_PROJECTS_FINAL_PAYMENT);
    });
  } finally {
    testInfo.annotations.push({ type: 'tasks handled', description: workflow.context.handledTasks.map((t) => `${t.side}: ${t.task} (${t.decision})`).join(' → ') });
    await testInfo.attach('workflow-context.json', { body: JSON.stringify(workflow.context, null, 2), contentType: 'application/json' });
  }
});

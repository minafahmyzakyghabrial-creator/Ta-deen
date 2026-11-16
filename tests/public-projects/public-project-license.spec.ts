import { expect, test } from '@fixtures/test';
import { EnvName, getEnvName, getRequestNumber, readVar, UserKey } from '@config/index';
import { publicProjectLicenseData } from '@data/public-project-license.data';
import { ApprovalWorkflow, PUBLIC_PROJECTS_FINAL_PAYMENT } from '@flows/approval-workflow.flow';

/**
 * Run settings for this file.
 *
 *   env      → environment this file runs on; overrides TEST_ENV. Only AUTHORISED_ENVS may run it
 *              (it submits a real request and pays through the TEST payment utility); 'prod' is refused.
 *   request  → '' : the investor submits a NEW request, then the approvals run on it;
 *              '<number>' : skip the investor wizard and continue the approvals of that submitted request
 *              (e.g. after a run stopped half-way). REQUEST_NUMBER overrides it per run.
 *   investor → investor who creates/owns the request ('investor2', 'investor3', …).
 *   employee → employee who answers the employee tasks ('employee1', …).
 *   mineral  → class-ج mineral (exact label as the screen shows it).
 *   quantity → tonnes of that mineral — at least the mineral's minimum capacity.
 */
const RUN: { env: EnvName; request: string; investor: UserKey; employee: UserKey; mineral: string; quantity: string } = {
  env: 'test',
  request: '',
  investor: 'investor2',
  employee: 'employee1',
  mineral: 'البحص:(أي صخر ملائم للاستغلال كبحص)',
  quantity: '200000',
};

/** Environments where submitting real requests is allowed. */
const AUTHORISED_ENVS: readonly EnvName[] = ['test', 'uat'];

if (RUN.env === 'prod') throw new Error('public-project-license.spec.ts must never run on PROD.');
process.env.TEST_ENV = RUN.env;
test.use({ investorUser: RUN.investor, employeeUser: RUN.employee });

/**
 * "إصدار رخصة مواد بناء للمشاريع العامة خارج نطاق المشروع" — from a new request to the final payment.
 *
 * Investor submits (skipped when RUN.request / REQUEST_NUMBER is set):
 *   1. Requests → "طلب جديد" → service type → 6-step wizard (Licenses_PublicProjects, LicenseTypeId=29)
 *   2. معلومات الرخصة: project, contract dates, licence expiry, mineral + quantity, declarations
 *   3. موقع الرخصة: project KML + licence KML outside it, licence map "تأكيد" (retries on overlap)
 *   4. خطة العمل والإنفاق: company info, production plan, extraction method, development works, equipment, attachments
 *   5. دراسة الأثر البيئي: water/energy sources, impacts popup, closure cost, attachments
 *   6. المرفقات (optional) → الشروط والأحكام → "إرسال" → request number from the success dialog
 *      (if "إرسال" refuses the location the map accepted, back to step 2 with a new one — location.submitRetries)
 *   7. The request is listed and no longer a draft
 *
 * Employee approvals ↔ investor tasks (state-driven: each round handles whatever is pending), as seen on TEST:
 *   employee  نظم المعلومات الجغرافية → مراجعة نظم المعلومات الجغرافية
 *   investor  رسوم الطلب (payment) + الضمان المالي (guarantee form)
 *   employee  تقييم القدرة الفنية · مهمة تقييم الاستدامة · التقييم المالي · تقييم الضمان المالي → مهمة المراجعة العامة
 *   investor  التصريح البيئي (permit form)
 *   employee  تقييم التصريح البيئي → المراجعة المبدئية → التقييم النهائي → موافقة المستوى الأول / الثاني / الثالث
 *   investor  دفع المقابل المالي → دفع الايجار السطحي → الدفع  ← the test ends once this is paid and verified
 * It does not wait for "مكتمل": TEST can relist the paid "الدفع" for minutes first (77043, 77053).
 * Paid bills are kept in .workflow-state/<request>.json and never notified twice, so a resumed run is safe.
 *
 *   npm run test:public-project
 *   $env:REQUEST_NUMBER="77053"; npm run test:public-project      ← continue an existing request
 *
 * Other values: src/data/public-project-license.data.ts.
 */
test('Public projects building-materials licence: submit and approve to the final payment @e2e', async ({ investor, employee }, testInfo) => {
  test.setTimeout(120 * 60_000);
  test.skip(!AUTHORISED_ENVS.includes(getEnvName()), `Submits a real request — authorised on ${AUTHORISED_ENVS.join(', ')} only.`);
  const data = publicProjectLicenseData();
  const licence = investor.publicProjectLicense;
  const existing = readVar('REQUEST_NUMBER') ?? RUN.request.trim();
  let requestNumber = existing ? getRequestNumber(existing) : '';
  let workflow: ApprovalWorkflow | undefined;

  try {
    if (!requestNumber) {
      await test.step(`Investor: Requests → طلب جديد → ${data.serviceType}`, async () => {
        await investor.requests.open();
        await investor.requests.startNewRequest(data.serviceType);
        await licence.expectNewLoaded();
        await licence.wizard.expectActive(0);
      });

      await test.step('Step 1 — معلومات الرخصة', async () => {
        testInfo.annotations.push({ type: 'mineral', description: `${RUN.mineral} · ${RUN.quantity} t` });
        await licence.fillLicenceInformation({ ...data.step1, mineral: RUN.mineral, mineralQuantity: RUN.quantity });
        expect(await licence.next()).toBe('موقع الرخصة');
      });

      await test.step('Step 2 — موقع الرخصة: project + licence location, map confirmation', async () => {
        await licence.fillLocation(data.location);
        expect(await licence.next()).toBe('خطة العمل والإنفاق');
      });

      await test.step('Step 3 — خطة العمل والإنفاق', async () => {
        await licence.fillWorkPlan(data.workPlan, data.attachment);
        expect(await licence.next()).toBe('دراسة الأثر البيئي');
      });

      await test.step('Step 4 — دراسة الأثر البيئي', async () => {
        await licence.fillEnvironmentalImpact(data.environmental, data.attachment);
        expect(await licence.next()).toBe('المرفقات');
      });

      await test.step('Step 5 — المرفقات (optional) → Step 6 — الشروط والأحكام → إرسال (new location if it is refused)', async () => {
        expect(await licence.next()).toBe('الشروط والأحكام');
        requestNumber = await licence.submitRetryingLocation(data.location);
        expect(requestNumber, 'Request number in the success dialog').toMatch(/^\d+$/);
      });
    }
    testInfo.annotations.push({ type: 'request', description: `${requestNumber}${existing ? ' (resumed)' : ' (new)'}` });
    workflow = new ApprovalWorkflow(investor, employee, requestNumber);

    await test.step(`Request ${requestNumber} is listed and submitted (not a draft)`, async () => {
      const status = await workflow!.requestStatus();
      testInfo.annotations.push({ type: 'status', description: status });
      expect(status, `Status of request ${requestNumber}`).not.toMatch(/مسودة/);
    });

    await test.step('Employee approvals ↔ investor payments and forms, until the final "الدفع" is paid', async () => {
      const { handledTasks } = await workflow!.run({ stopAfterPayment: PUBLIC_PROJECTS_FINAL_PAYMENT });
      testInfo.annotations.push({ type: 'tasks handled', description: handledTasks.map((t) => `${t.side}: ${t.task} (${t.decision})`).join(' → ') });
    });

    await test.step('Every payment verified, the last one "الدفع"', async () => {
      const { bills } = workflow!.context;
      testInfo.annotations.push({ type: 'bills', description: bills.map((b) => `${b.task}: ${b.billId}`).join(' · ') || '(none)' });
      expect(new Set(bills.map((b) => b.billId)).size, 'Every payment used a different bill').toBe(bills.length);
      for (const bill of bills) expect(bill.verified, `Payment of bill ${bill.billId} was verified`).toBe(true);
      expect(bills.at(-1)?.task ?? '', 'Last payment').toMatch(PUBLIC_PROJECTS_FINAL_PAYMENT);
    });
  } finally {
    if (licence.attempts.length) await testInfo.attach('location-attempts.json', { body: JSON.stringify(licence.attempts, null, 2), contentType: 'application/json' });
    if (workflow) await testInfo.attach('workflow-context.json', { body: JSON.stringify(workflow.context, null, 2), contentType: 'application/json' });
  }
});

import { expect, test } from '@fixtures/test';
import { EnvName, getEnvName, UserKey } from '@config/index';
import { publicProjectLicenseData } from '@data/public-project-license.data';
import { ApprovalWorkflow, PUBLIC_PROJECTS_FINAL_PAYMENT } from '@flows/approval-workflow.flow';

/**
 * Run settings for this file.
 *
 *   env      → environment this file runs on; overrides TEST_ENV. Only AUTHORISED_ENVS may run it
 *              (it submits a real request); 'prod' is refused.
 *   investor → investor who creates and submits the request ('investor2', 'investor3', …).
 *   employee → employee who completes the employee tasks ('employee1', …).
 *   mineral  → class-ج mineral (exact label as the screen shows it).
 *   quantity → tonnes of that mineral — at least the mineral's minimum capacity.
 *   workflow → false: investor side only (stops once the request is submitted and listed);
 *              true: also runs the employee ↔ investor tasks until the final "الدفع" is paid.
 */
const RUN: { env: EnvName; investor: UserKey; employee: UserKey; mineral: string; quantity: string; workflow: boolean } = {
  env: 'test',
  investor: 'investor2',
  employee: 'employee1',
  mineral: 'البحص:(أي صخر ملائم للاستغلال كبحص)',
  quantity: '200000',
  workflow: true,
};

/** Environments where submitting real requests is allowed. */
const AUTHORISED_ENVS: readonly EnvName[] = ['test', 'uat'];

if (RUN.env === 'prod') throw new Error('public-project-license.spec.ts must never run on PROD.');
process.env.TEST_ENV = RUN.env;
test.use({ investorUser: RUN.investor, employeeUser: RUN.employee });

/**
 * "إصدار رخصة مواد بناء للمشاريع العامة خارج نطاق المشروع" — investor creates and submits a new request:
 *
 *   1. Requests → "طلب جديد" → service type → 6-step wizard (Licenses_PublicProjects, LicenseTypeId=29)
 *   2. معلومات الرخصة: project, contract dates, licence expiry, mineral + quantity, declarations
 *   3. موقع الرخصة: project KML + licence KML outside it, licence map "تأكيد" (retries on overlap)
 *   4. خطة العمل والإنفاق: company info, production plan, extraction method, development works, equipment, attachments
 *   5. دراسة الأثر البيئي: water/energy sources, impacts popup, closure cost, attachments
 *   6. المرفقات (optional) → الشروط والأحكام → "إرسال" → request number from the success dialog
 *      (if "إرسال" refuses the location the map accepted, back to step 2 with a new one — location.submitRetries)
 *   7. The request is listed and no longer a draft
 *   8. (RUN.workflow only) Employee tasks → the investor tasks in between → the remaining employee tasks
 *
 *   npx playwright test tests/public-projects/public-project-license.spec.ts --project=chromium --headed
 *
 * Other values: src/data/public-project-license.data.ts. Each run submits a NEW request on RUN.env.
 */
test('Public projects building-materials licence: investor submits a new request @e2e', async ({ investor, employee }, testInfo) => {
  test.setTimeout(90 * 60_000);
  test.skip(!AUTHORISED_ENVS.includes(getEnvName()), `Submits a real request — authorised on ${AUTHORISED_ENVS.join(', ')} only.`);
  const data = publicProjectLicenseData();
  const licence = investor.publicProjectLicense;
  let requestNumber = '';
  let workflow: ApprovalWorkflow | undefined;

  try {
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
      testInfo.annotations.push({ type: 'request', description: requestNumber });
    });

    await test.step('Request is listed and submitted (not a draft)', async () => {
      await investor.requests.open();
      await investor.requests.find(requestNumber);
      const status = await investor.requests.cell(requestNumber, 'الحالة');
      testInfo.annotations.push({ type: 'status', description: status });
      expect(status, `Status of request ${requestNumber}`).not.toMatch(/مسودة/);
    });

    if (!RUN.workflow) return;
    await test.step('Employee tasks ↔ investor tasks, until the final "الدفع" is paid', async () => {
      workflow = new ApprovalWorkflow(investor, employee, requestNumber);
      const { handledTasks } = await workflow.run({ stopAfterPayment: PUBLIC_PROJECTS_FINAL_PAYMENT });
      testInfo.annotations.push({ type: 'tasks handled', description: handledTasks.map((t) => `${t.side}: ${t.task}`).join(' → ') });
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
    if (requestNumber) testInfo.annotations.push({ type: 'request number', description: requestNumber });
    if (workflow) await testInfo.attach('workflow-context.json', { body: JSON.stringify(workflow.context, null, 2), contentType: 'application/json' });
  }
});

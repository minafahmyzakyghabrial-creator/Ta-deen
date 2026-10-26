import { expect, test } from '@fixtures/test';
import { getEnvName, readVar } from '@config/index';
import { ApprovalWorkflow } from '@flows/approval-workflow.flow';
import { ExplorationLicenseFlow } from '@flows/exploration-license.flow';
import { RequestsPage } from '@pages/investor/RequestsPage';
import { StepReport } from '@pages/investor/exploration-license/WizardStep';
import { newExplorationRequestData } from '@data/new-exploration-request.data';
import { splitRules, WizardValidationError } from '@utils/validation';

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
 * Each run creates a NEW request on TEST. Other step-1 data: src/data/new-exploration-request.data.ts.
 */
test('Exploration License: new request — create, submit and complete @e2e', async ({ investor, employee }, testInfo) => {
  test.setTimeout(60 * 60_000);
  test.skip(getEnvName() !== 'test', 'Creates and completes new requests — authorised on TEST only.');
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
    let latestBefore = 0;
    await test.step(`Investor: Requests → طلب جديد → ${data.serviceType}`, async () => {
      await investor.requests.open();
      latestBefore = Number((await investor.requests.latestRequest()).number);
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
      await next();
      await wizard.expectActive(1);
    });

    await test.step('Step 2 — موقع الطلب: KML upload, map check, retry until confirmed', async () => {
      const location = license.location;
      try {
        await location.fill(data.location);
      } finally {
        await testInfo.attach('location-attempts.json', { body: JSON.stringify(location.attempts, null, 2), contentType: 'application/json' });
      }
      testInfo.annotations.push({ type: 'location attempts', description: String(location.attempts.length) });
      const change = await next();
      expect(change.to).toBe('خطة العمل و الانفاق');
    });

    await test.step('Capture the new request number (Requests list, second tab)', async () => {
      // The new wizard's URL carries no In_RequestId, so read it from the list without leaving the wizard.
      requestNumber = license.requestNumber() ?? '';
      if (!requestNumber) {
        const tab = await investor.page.context().newPage();
        try {
          await tab.goto(new URL('Redirect', investor.requests.urls.appBaseUrl).toString());
          const list = new RequestsPage(tab);
          await list.open();
          const latest = await list.latestRequest();
          expect(Number(latest.number), 'A new request was created').toBeGreaterThan(latestBefore);
          expect(latest.type).toBe(data.serviceType);
          expect(latest.status).toMatch(/مسودة/);
          requestNumber = latest.number;
        } finally {
          await tab.close();
        }
      }
      testInfo.annotations.push({ type: 'request', description: requestNumber });
      workflow = new ApprovalWorkflow(investor, employee, requestNumber);
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
});

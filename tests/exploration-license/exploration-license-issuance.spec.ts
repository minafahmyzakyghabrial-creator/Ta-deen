import { expect, test } from '@fixtures/test';
import { getEnvName, getRequestNumber, readVar, UserKey } from '@config/index';
import { ApprovalWorkflow } from '@flows/approval-workflow.flow';

/** Request to run. Change it here, or override per run with the REQUEST_NUMBER env variable. */
const REQUEST_NUMBER = '76108';

/**
 * Users for this file ('investor1', 'investor2', … / 'employee1', 'employee2', …). The investor must own
 * REQUEST_NUMBER. Credentials come from .env: <ENV>_<USER>_USERNAME / <ENV>_<USER>_PASSWORD.
 */
const USERS: { investor: UserKey; employee: UserKey } = {
  investor: 'investor1',
  employee: 'employee1',
};
test.use({ investorUser: USERS.investor, employeeUser: USERS.employee });

/**
 * Exploration License Issuance — one test from the investor's draft to the end of the workflow:
 *
 *   1. Investor: open the draft, pass steps 1–2 unchanged, fill steps 3–8, submit, confirm status
 *   2. Employee: each pending task — assign to self, Respond, choose the decision, submit
 *   3. Investor: payment task — acknowledge, capture the Bill ID, call the payment notification
 *      utility, verify the payment task closes
 *   4. Repeat 2–3 until no task is pending, then report the final request status
 *
 *   npx playwright test tests/exploration-license/exploration-license-issuance.spec.ts --project=chromium --headed
 *
 * Resumable: a request that is no longer a draft skips step 1 and continues from its pending task.
 * Investor and employee run in separate browser contexts. TEST only (payment utility).
 * Optional: EXPECTED_FINAL_STATUS=<status text> to assert the end state.
 */
test('Exploration License Issuance @e2e', async ({ investor, employee }, testInfo) => {
  test.setTimeout(45 * 60_000);
  test.skip(getEnvName() !== 'test', 'Exploration License Issuance (payment utility) is authorised on TEST only.');
  const requestNumber = getRequestNumber(REQUEST_NUMBER);
  const workflow = new ApprovalWorkflow(investor, employee, requestNumber);

  try {
    await test.step(`Investor: complete and submit draft ${requestNumber}`, async () => {
      const { status, steps } = await workflow.submitDraftIfNeeded();
      testInfo.annotations.push({ type: 'status after submission', description: status });
      if (steps.length) {
        await testInfo.attach('wizard-step-report.json', { body: JSON.stringify(steps, null, 2), contentType: 'application/json' });
      }
    });

    await test.step('Employee tasks, investor payment and approvals until the request settles', async () => {
      await workflow.run();
    });

    await test.step('Payments: both bills distinct and verified', async () => {
      const { bills } = workflow.context;
      testInfo.annotations.push({ type: 'first bill', description: workflow.firstBillId || '(none)' });
      testInfo.annotations.push({ type: 'second bill', description: workflow.secondBillId || '(none)' });
      expect(new Set(bills.map((b) => b.billId)).size, 'Every payment used a different bill').toBe(bills.length);
      for (const bill of bills) expect(bill.verified, `Payment of bill ${bill.billId} was verified`).toBe(true);
    });

    await test.step('Final request status', async () => {
      const finalStatus = workflow.context.finalStatus ?? '';
      testInfo.annotations.push({ type: 'final status', description: finalStatus });
      // "مكتمل" (completed) is the end state observed on TEST after the fifth approval + second payment.
      expect(finalStatus).toContain(readVar('EXPECTED_FINAL_STATUS') ?? 'مكتمل');
    });
  } finally {
    await testInfo.attach('workflow-context.json', { body: JSON.stringify(workflow.context, null, 2), contentType: 'application/json' });
  }
});

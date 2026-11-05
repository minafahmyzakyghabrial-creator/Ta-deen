import { expect, test } from '@fixtures/test';
import { EnvName, getEnvName, readVar } from '@config/index';
import { explorationTransferData, maskCR, TransferScenarioKey } from '@data/exploration-transfer.data';
import { ExplorationTransferWorkflow, LICENSE_STATUS_AFTER_TRANSFER } from '@flows/exploration-transfer.flow';
import { EmployeePortal } from '@pages/employee/EmployeePortal';
import { InvestorPortal } from '@pages/investor/InvestorPortal';

/** Environments where creating, paying and completing transfers is allowed (never PROD). */
const AUTHORISED_ENVS: readonly EnvName[] = ['test', 'uat'];

/**
 * Exploration License Transfer (تحويل رخصة الكشف) — three positive end-to-end scenarios.
 *
 *   transferor: Requests → طلب جديد → تحويل رخصة الكشف → configured licence + transferee CR → documents → submit
 *   transferee: To-Do "مراجعة طلب تحويل رخصة كشف" → approve → To-Do "تقديم نماذج تحويل رخصة الكشف" → 8 steps → submit
 *   employee:   GIS + Field Inspection (parallel) → … → assessments → consolidated → reviews → approvals 1–5
 *   payments:   transferor application fee, transferee transfer fee (payment notification utility)
 *   end:        request "مكتمل"; licence list ("الرخص"): transferor "محولة", transferee "فعال"
 *
 * Licence number and transferee CR per scenario: test-data/<env>/exploration-transfer.json, or per run
 * TRANSFER_<SCENARIO>_LICENSE_NUMBER / TRANSFER_<SCENARIO>_TRANSFEREE_CR (see README §13).
 *
 *   npm run test:transfer                      all three
 *   npm run test:transfer:available            @available-land only (also :conditioned, :rework)
 *
 * The scenarios run one after another (each uses its own licence); a re-run resumes a scenario's unfinished
 * request (state in .workflow-state/transfer-<scenario>-<licence>.json).
 */
test.describe.configure({ mode: 'default' });

const SCENARIOS: { key: TransferScenarioKey; id: string; title: string; tag: string }[] = [
  { key: 'availableLand', id: 'E2E-001', title: 'Available Land', tag: '@available-land' },
  { key: 'conditionedLand', id: 'E2E-002', title: 'Conditioned Land', tag: '@conditioned-land' },
  { key: 'rework', id: 'E2E-003', title: 'Rework', tag: '@rework' },
];

for (const scenario of SCENARIOS) {
  test(`${scenario.id} Exploration License Transfer — ${scenario.title} @e2e @exploration-transfer ${scenario.tag}`, async ({ sessions }, testInfo) => {
    test.setTimeout(120 * 60_000);
    test.skip(!AUTHORISED_ENVS.includes(getEnvName()), `Creates and completes transfers — authorised on ${AUTHORISED_ENVS.join(', ')} only.`);
    const data = explorationTransferData(scenario.key);
    const s = data.scenario;
    const note = (type: string, description: string) => testInfo.annotations.push({ type, description });
    note('scenario', `${scenario.id} ${scenario.title}`);
    note('licence', s.licenseNumber);
    note('transferee CR', maskCR(s.transfereeCR));

    const transferor = new InvestorPortal((await sessions.as(s.transferor)).page);
    const transferee = new InvestorPortal((await sessions.as(s.transferee)).page);
    const employee = new EmployeePortal((await sessions.as(s.employee)).page);
    const workflow = new ExplorationTransferWorkflow(transferor, transferee, employee, data, scenario.key);

    try {
      await test.step(`Transferor (${s.transferor}): submit transfer of licence ${s.licenseNumber}`, async () => {
        note('request', await workflow.submitTransferorRequest());
      });

      await test.step('Transferee approval + wizard, employee tasks, payments and approvals until completed', async () => {
        await workflow.run();
      });

      if (s.rework) {
        await test.step(`Rework: ${s.rework.returns.length} return(s) to the transferee, each corrected and reassessed`, async () => {
          const returns = workflow.context.reworkReturns;
          returns.forEach((r, i) =>
            note(`return ${i + 1}`, `${r.section}: ${(r.changes ?? []).map((c) => `${c.field} "${c.before}" → "${c.after}"`).join(', ') || '(not corrected)'}${r.verified ? ' — reassessed' : ''}`),
          );
          expect(returns.length, 'Number of returns to the transferee').toBe(s.rework!.returns.length);
          returns.forEach((r, i) => {
            expect(r.changes?.length, `Return ${i + 1} was corrected by the transferee`).toBeGreaterThan(0);
            expect(r.verified, `Return ${i + 1}: the employee's reassessment showed the corrected values`).toBe(true);
          });
          if (s.rework!.employeeReturn) {
            const round = workflow.context.employeeReturn;
            note('employee return', `${s.rework!.employeeReturn.branches.join(' + ')}: ${(round?.changes ?? []).map((c) => `${c.field} "${c.before}" → "${c.after}"`).join(', ') || '(not corrected)'} — ${round?.stage ?? 'not started'}`);
            expect(round?.stage, 'Employee-return round: financial Not Met → transferee correction → reassessed Met').toBe('verified');
            expect(round?.changes?.length, 'Employee-return round: the transferee changed the financial data').toBeGreaterThan(0);
          }
        });
      }

      await test.step('Payments: application fee (transferor) and transfer fee (transferee) verified', async () => {
        const application = workflow.bill('transferor');
        const transfer = workflow.bill('transferee');
        note('application fee bill', application?.billId ?? '(none)');
        note('transfer fee bill', transfer?.billId ?? '(none)');
        expect(application?.verified, 'Application fee paid and its task closed').toBe(true);
        expect(transfer?.verified, 'Transfer fee paid and its task closed').toBe(true);
        expect(application?.billId, 'The two payments used different bills').not.toBe(transfer?.billId);
      });

      await test.step('Final request status', async () => {
        note('final status', workflow.context.finalStatus ?? '');
        expect(workflow.context.finalStatus ?? '').toContain(readVar('EXPECTED_FINAL_STATUS') ?? 'مكتمل');
      });

      await test.step(`Licence list of transferor and transferee: status of ${s.licenseNumber}`, async () => {
        const { transferorStatus, transfereeStatus } = await workflow.verifyOwnership();
        note('licence status — transferor', transferorStatus ?? '(not listed)');
        note('licence status — transferee', transfereeStatus ?? '(not listed)');
        expect.soft(transferorStatus, `Transferor's licence list ("الرخص"): ${s.licenseNumber}`).toBe(LICENSE_STATUS_AFTER_TRANSFER.transferor);
        expect(transfereeStatus, `Transferee's licence list ("الرخص"): ${s.licenseNumber}`).toBe(LICENSE_STATUS_AFTER_TRANSFER.transferee);
      });
    } finally {
      await testInfo.attach('transfer-context.json', { body: JSON.stringify(workflow.context, null, 2), contentType: 'application/json' });
    }
  });
}

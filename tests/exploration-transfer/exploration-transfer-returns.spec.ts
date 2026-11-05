import { expect, test } from '@fixtures/test';
import { EnvName, getEnvName, readVar } from '@config/index';
import { explorationTransferData, maskCR } from '@data/exploration-transfer.data';
import { ExplorationTransferWorkflow, LICENSE_STATUS_AFTER_TRANSFER, sameTask } from '@flows/exploration-transfer.flow';
import { EmployeePortal } from '@pages/employee/EmployeePortal';
import { InvestorPortal } from '@pages/investor/InvestorPortal';

/** Environments where creating, paying and completing transfers is allowed (never PROD). */
const AUTHORISED_ENVS: readonly EnvName[] = ['test', 'uat'];

/**
 * E2E-004 Exploration License Transfer — RETURN CHAIN: every return route of the service documentation that still
 * ends in a completed transfer, on ONE request (scenario "returnChain" in test-data/<env>/exploration-transfer.json).
 *
 *   to the transferee (§9.2)        Consolidated "إعادة للمحال إليه": social impact × rework.returns, then the
 *                                   financial round (rework.employeeReturn) — each value change asserted
 *   to the previous employee        GIS Review → GIS (§7.1) · Financial Review → Financial (§9.1) ·
 *   (returnChain.tasks)             Consolidated → financial + technical + compliance (§9.2) ·
 *                                   Initial Review → Consolidated · Final Assessment → Initial Review ·
 *                                   Level 1 → Final Assessment · Levels 2–5 → Level 1 (§10)
 *
 * After every return the flow asserts (soft — the run goes on to completion and reports each one):
 *   - the documented previous task opens,
 *   - its handler sees the return description in "سجل الطلب",
 * then the transfer must still complete: both payments, "مكتمل", licence status per company.
 *
 * Not covered (documented, but each needs a screen not explored yet): "طلب بيانات إضافية", and returns of the
 * Work Plan / Attachments sections to the transferee. Rejections and cancellations are out of scope (negative).
 *
 *   npm run test:transfer:returns
 *
 * Long: ~70 tasks (each level return replays the levels below it). WORKFLOW_MAX_ROUNDS defaults to 200 here.
 * A re-run resumes the unfinished request (.workflow-state/transfer-returnChain-<licence>.json).
 */
test(`E2E-004 Exploration License Transfer — Return chain (every documented return) @e2e @exploration-transfer @return-chain`, async ({ sessions }, testInfo) => {
  test.setTimeout(6 * 60 * 60_000);
  test.skip(!AUTHORISED_ENVS.includes(getEnvName()), `Creates and completes transfers — authorised on ${AUTHORISED_ENVS.join(', ')} only.`);
  const data = explorationTransferData('returnChain');
  const s = data.scenario;
  const chain = s.returnChain!;
  const note = (type: string, description: string) => testInfo.annotations.push({ type, description });
  note('scenario', 'E2E-004 Return chain');
  note('licence', s.licenseNumber);
  note('transferee CR', maskCR(s.transfereeCR));

  const transferor = new InvestorPortal((await sessions.as(s.transferor)).page);
  const transferee = new InvestorPortal((await sessions.as(s.transferee)).page);
  const employee = new EmployeePortal((await sessions.as(s.employee)).page);
  const workflow = new ExplorationTransferWorkflow(transferor, transferee, employee, data, 'returnChain');

  try {
    await test.step(`Transferor (${s.transferor}): submit transfer of licence ${s.licenseNumber}`, async () => {
      note('request', await workflow.submitTransferorRequest());
    });

    await test.step('Whole workflow with every configured return, until completed', async () => {
      await workflow.run(200);
    });

    if (s.rework) {
      await test.step(`Returns to the transferee: ${s.rework.returns.length} × ${s.rework.section}${s.rework.employeeReturn ? ' + financial round' : ''}`, async () => {
        const returns = workflow.context.reworkReturns;
        returns.forEach((r, i) =>
          note(`transferee return ${i + 1}`, `${r.section}: ${(r.changes ?? []).map((c) => `${c.field} "${c.before}" → "${c.after}"`).join(', ') || '(not corrected)'}${r.verified ? ' — reassessed' : ''}`),
        );
        expect(returns.length, 'Number of returns to the transferee').toBe(s.rework!.returns.length);
        returns.forEach((r, i) => {
          expect(r.changes?.length, `Return ${i + 1} was corrected by the transferee`).toBeGreaterThan(0);
          expect(r.verified, `Return ${i + 1}: the employee's reassessment showed the corrected values`).toBe(true);
        });
        if (s.rework!.employeeReturn) {
          const round = workflow.context.employeeReturn;
          note('financial return', `${(round?.changes ?? []).map((c) => `${c.field} "${c.before}" → "${c.after}"`).join(', ') || '(not corrected)'} — ${round?.stage ?? 'not started'}`);
          expect(round?.stage, 'Financial round: financial Not Met → transferee correction → reassessed Met').toBe('verified');
          expect(round?.changes?.length, 'Financial round: the transferee changed the financial data').toBeGreaterThan(0);
        }
      });
    }

    await test.step('Returns to the previous employee: made, routed as documented, shown in "سجل الطلب"', async () => {
      const { chainReturns, chainReturnsNotOffered } = workflow.context;
      chainReturns.forEach((r, i) =>
        note(
          `employee return ${i + 1}`,
          `${r.from} → ${r.openedNext?.join(' + ') || '?'}${r.routedAsDocumented ? '' : ` (documented: ${r.expectedNext.join(' + ')})`} · history: ${(r.seenBy ?? []).map((x) => `${x.task} ${x.shown ? '✓' : '✗'}`).join(', ') || 'not checked'}`,
        ),
      );
      chainReturnsNotOffered.forEach((r) => note('return not offered', `${r.task}: ${r.options.join(' | ')}`));
      for (const [task, times] of Object.entries(chain.tasks)) {
        const made = chainReturns.filter((r) => sameTask(r.from, task)).length;
        expect.soft(made, `"${task}" returned the request ${times} time(s)`).toBe(times);
      }
      chainReturns.forEach((r, i) => {
        expect.soft(r.routedAsDocumented, `Return ${i + 1} "${r.from}" opened ${r.expectedNext.join(' + ')}`).toBe(true);
        for (const next of r.expectedNext) {
          const seen = (r.seenBy ?? []).find((x) => sameTask(x.task, next));
          expect.soft(seen?.shown, `Return ${i + 1} "${r.from}": "${next}" showed the return description in "سجل الطلب"`).toBe(true);
        }
      });
    });

    if (chain.additionalInfo) {
      await test.step(`Additional information: requested (${chain.additionalInfo.attachmentNames.join(', ')}), provided, reviewed`, async () => {
        note('additional information', workflow.context.additionalInfo?.stage ?? 'not requested');
        expect(workflow.context.additionalInfo?.stage, 'Consolidated asked, the transferee provided, Consolidated reviewed').toBe('reviewed');
      });
    }

    await test.step('"سجل الطلب → سجل الردود": every return listed with its decision and description', async () => {
      // Read on the last approval task: a completed request is no longer listed in Task Management.
      const log = workflow.context.responseLog ?? (await workflow.responseLog());
      await testInfo.attach('response-log.json', { body: JSON.stringify(log, null, 2), contentType: 'application/json' });
      note('responses in history', String(log.length));
      workflow.context.chainReturns.forEach((r, i) => {
        const entry = log.find((e) => sameTask(e.task, r.from) && e.decision === r.decision && e.comment === r.description);
        expect.soft(entry, `Return ${i + 1} "${r.from}" → "${r.decision}" with its description is in "سجل الردود"`).toBeTruthy();
      });
      if (s.rework) {
        // Consolidated "إعادة للمحال إليه" is logged as "معاد للمستثمر" (VERIFIED on TEST, 76386).
        const toTransferee = log.filter((e) => sameTask(e.task, 'المراجعة العامة') && e.decision === 'معاد للمستثمر').length;
        expect.soft(toTransferee, 'Returns to the transferee listed in "سجل الردود"').toBe(s.rework.returns.length + (s.rework.employeeReturn ? 1 : 0));
      }
      // Responses saved without a comment (the user wants one on every task): reported, not asserted — the
      // noCommentTasks (BUG-001) and the financial assessment when all Met have no comment field.
      const silent = log.filter((e) => !e.comment).map((e) => `${e.task} (${e.decision})`);
      if (silent.length) note('responses without a comment', silent.join(' · '));
    });

    await test.step('Payments: application fee (transferor) and transfer fee (transferee) verified', async () => {
      const application = workflow.bill('transferor');
      const transfer = workflow.bill('transferee');
      note('application fee bill', application?.billId ?? '(none)');
      note('transfer fee bill', transfer?.billId ?? '(none)');
      expect(application?.verified, 'Application fee paid and its task closed').toBe(true);
      expect(transfer?.verified, 'Transfer fee paid and its task closed').toBe(true);
      expect(application?.billId, 'The two payments used different bills').not.toBe(transfer?.billId);
      expect(workflow.context.bills.filter((b) => b.payer === 'transferor').length, 'Returns never asked the transferor to pay twice').toBe(1);
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

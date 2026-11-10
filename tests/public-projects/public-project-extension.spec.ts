import { expect, test } from '@fixtures/test';
import { EnvName, getEnvName, UserKey } from '@config/index';

/**
 * Run settings for this file.
 *
 *   env           → environment this file runs on; overrides TEST_ENV. Only AUTHORISED_ENVS may run it
 *                   (it submits a real request); 'prod' is refused.
 *   investor      → investor who owns the licence ('investor2', 'investor3', …).
 *   licence       → licence number to extend; '' = the first offered licence that has no pending request.
 *   extendByMonths→ new contract end / licence expiry = the licence's earliest allowed date + this many months.
 */
const RUN: { env: EnvName; investor: UserKey; licence: string; extendByMonths: number } = {
  env: 'test',
  investor: 'investor3',
  licence: '',
  extendByMonths: 1,
};

const SERVICE = 'تمديد رخصة مواد بناء للمشاريع العامة خارج نطاق المشروع';

/** Environments where submitting real requests is allowed. */
const AUTHORISED_ENVS: readonly EnvName[] = ['test', 'uat'];

if (RUN.env === 'prod') throw new Error('public-project-extension.spec.ts must never run on PROD.');
process.env.TEST_ENV = RUN.env;
test.use({ investorUser: RUN.investor });

/**
 * "تمديد رخصة مواد بناء للمشاريع العامة خارج نطاق المشروع" — investor extends an existing licence:
 *
 *   1. Requests → "طلب جديد" → service type → 6-step wizard (Licenses_PublicProjects, LicenseTypeId=42)
 *   2. معلومات الرخصة: choose the licence (pre-fills project + minerals), new contract end and licence expiry
 *      (after the current end), declarations — a licence with an open request is skipped
 *   3. Steps 2–5: declarations, Next (fails with the app's own rules if a step needs more data)
 *   4. الشروط والأحكام → "إرسال" → request number from the success dialog; the request is no longer a draft
 *
 *   npx playwright test tests/public-projects/public-project-extension.spec.ts --project=chromium --headed
 *
 * Needs a licence WITHOUT an open request — on TEST (2026-11-08) all licences of investor2/investor3 were blocked
 * by other testers' requests (76877, 76878).
 */
test(`${SERVICE} — investor submits @e2e`, async ({ investor }, testInfo) => {
  test.setTimeout(30 * 60_000);
  test.skip(!AUTHORISED_ENVS.includes(getEnvName()), `Submits a real request — authorised on ${AUTHORISED_ENVS.join(', ')} only.`);
  const extension = investor.publicProjectExtension;
  let requestNumber = '';

  const openNewRequest = async () => {
    await investor.requests.open();
    await investor.requests.startNewRequest(SERVICE);
    await extension.expectNewLoaded();
  };

  await test.step(`Investor: Requests → طلب جديد → ${SERVICE}`, async () => {
    await openNewRequest();
    await extension.wizard.expectActive(0);
  });

  await test.step('Step 1 — معلومات الرخصة: licence, new end date, declarations', async () => {
    const { licence, newEnd } = await extension.completeLicenceInformation(
      { licence: RUN.licence, extendByMonths: RUN.extendByMonths },
      openNewRequest,
    );
    testInfo.annotations.push({ type: 'licence', description: `${licence} → ${newEnd}` });
  });

  await test.step('Steps 2–5, then الشروط والأحكام → إرسال', async () => {
    const steps = await extension.passRemainingSteps();
    testInfo.annotations.push({ type: 'steps passed', description: steps.join(' → ') });
    requestNumber = await extension.acceptTermsAndSubmit();
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
});

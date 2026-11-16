import { test } from '@fixtures/test';
process.env.TEST_ENV = 'test';
test.use({ investorUser: 'investor3' });
// Read-only probe: open a new exploration request (nothing is saved) and list the failed eligibility checks.
test('eligibility', async ({ investor }) => {
  test.setTimeout(10 * 60_000);
  await investor.requests.open();
  await investor.requests.startNewRequest('إصدار رخصة كشف');
  const license = investor.explorationLicense;
  await license.expectNewLoaded();
  await license.requestInfo.expectLoaded();
  const failed = await (license.requestInfo as unknown as { failedEligibilityChecks(): Promise<string[]> }).failedEligibilityChecks();
  console.log('FAILED CHECKS:', JSON.stringify(failed));
});

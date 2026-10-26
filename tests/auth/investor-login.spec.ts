import { test } from '@fixtures/test';
import { DEFAULT_USERS, getCredentials } from '@config/index';
import { InvestorPortal } from '@pages/investor/InvestorPortal';

test('Investor login', async ({ sessions }) => {
  // Uses an anonymous session on purpose: this test verifies the login UI itself,
  // so it must not reuse a saved session.
  const credentials = getCredentials(DEFAULT_USERS.investor); // fail fast if not configured
  const { page } = await sessions.anonymous('investor');
  const investor = new InvestorPortal(page);

  await test.step('Log in through the investor login form', async () => {
    await investor.login.login(credentials);
  });
  await test.step('Investor lands on an authenticated page', async () => {
    await investor.home.expectLoaded();
  });
});

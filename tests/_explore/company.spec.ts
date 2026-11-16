import { test } from '@fixtures/test';
process.env.TEST_ENV = 'test';
test.use({ investorUser: 'investor3' });
// Read-only probe: which companies investor3 can act for, and which is active.
test('companies', async ({ investor }) => {
  test.setTimeout(10 * 60_000);
  const page = investor.page;
  await investor.requests.open();
  const header = page.locator('header, [role=banner]').first();
  console.log('HEADER:', (await header.innerText()).replace(/\s+/g, ' '));
  const switcher = page.getByText(/ - مالك/).filter({ visible: true }).first();
  await switcher.click();
  await page.waitForTimeout(3_000);
  console.log('AFTER CLICK:', (await page.locator('body').innerText()).split('\n').filter((l) => /مؤسسة|شركة|مالك|مفوض|Company|Comapy/.test(l)).slice(0, 30).join('\n'));
  await page.screenshot({ path: 'test-results-probe/company.png' });
});

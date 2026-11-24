import { test } from '@fixtures/test';
import * as fs from 'fs';
process.env.TEST_ENV = process.env.PROBE_ENV ?? 'uat';
test.use({ investorUser: (process.env.PROBE_INVESTOR ?? 'investor1') as 'investor1' });

const OUT = 'test-results-probe/mining-bill';
const REQUEST = process.env.PROBE_REQUEST ?? '';

// Read-only probe: the Requests row "⋯" → "ادفع" of a request "بإنتظار الدفع" — which page, does it show the SADAD bill?
// Nothing is ticked or confirmed.
test('mining bill probe', async ({ investor }) => {
  test.setTimeout(10 * 60_000);
  const page = investor.page;
  fs.mkdirSync(OUT, { recursive: true });
  await investor.requests.open();
  await investor.requests.find(REQUEST);
  await investor.requests.rowAction(REQUEST, 'ادفع');
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(5_000);
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const bills = [...new Set(text.match(/\d{10,}/g) ?? [])];
    console.log('T', i, page.url(), 'DIALOGS', await page.getByRole('dialog').filter({ visible: true }).count(), 'NUMS', bills.join(','));
    if (bills.length || i === 11) {
      fs.writeFileSync(`${OUT}/pay.txt`, text);
      await page.screenshot({ path: `${OUT}/pay.png`, fullPage: true });
      console.log('TEXT', text.slice(0, 1500));
      break;
    }
  }
});

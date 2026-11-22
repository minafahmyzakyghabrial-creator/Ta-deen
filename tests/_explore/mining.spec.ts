import { expect, test } from '@fixtures/test';
import { Page } from '@playwright/test';
import * as fs from 'fs';
import { MultiSelect } from '@components/MultiSelect';
import { Wizard } from '@components/Wizard';
import { trackServerActivity } from '@utils/os-waits';
process.env.TEST_ENV = 'test';
test.use({ investorUser: 'investor2' });

const OUT = 'test-results-probe/mining';
const LICENCE = process.env.PROBE_LICENCE ?? '20260311392';
const SERVICE = process.env.PROBE_SERVICE ?? '';

async function dump(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(2_000);
  fs.writeFileSync(`${OUT}/${name}.txt`, await page.locator('body').innerText());
  fs.writeFileSync(`${OUT}/${name}.html`, await page.content());
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log('DUMPED', name, page.url());
}

// Read-only probe: lists the services, opens the mining licence wizard and fills step 1 WITHOUT pressing Next (no request).
test('mining licence probe — step 1 only', async ({ investor }) => {
  test.setTimeout(20 * 60_000);
  const page = investor.page;
  await investor.requests.open();
  await page.getByRole('button', { name: /طلب جديد/ }).filter({ visible: true }).first().click();
  const dialog = page.getByRole('dialog').last();
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.getByRole('combobox').locator('option').count(), { timeout: 90_000 }).toBeGreaterThan(1);
  const options = (await dialog.getByRole('combobox').locator('option').allInnerTexts()).map((t) => t.trim());
  console.log('SERVICES', JSON.stringify(options));
  const service = SERVICE || options.find((o) => /منجم|تعدين/.test(o) && !/صغير/.test(o) && /إصدار/.test(o)) || '';
  console.log('SERVICE', service);
  if (!service) return;
  await dialog.getByRole('combobox').selectOption({ label: service });
  await dialog.getByRole('button', { name: 'التالي', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  const wizard = new Wizard(page);
  await expect(wizard.nextButton).toBeVisible({ timeout: 150_000 });
  await trackServerActivity(page).idle(1_000, 120_000);
  console.log('URL', page.url());
  console.log('STEPS', JSON.stringify(await wizard.stepNames()));
  console.log('BLOCKS', JSON.stringify(await page.locator('[data-block]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-block')))].filter((b) => /Steps\.|Declaration|Licen/.test(b ?? '')).slice(0, 40))));
  await dump(page, 's1-initial');

  const licence = page.locator('select[id$="Dropdown_LicenseId"]');
  if (await licence.count()) {
    const offered = (await licence.locator('option').allInnerTexts()).map((t) => t.trim());
    console.log('LICENCES OFFERED', JSON.stringify(offered));
    if (offered.includes(LICENCE)) {
      const activity = trackServerActivity(page);
      await licence.selectOption({ label: LICENCE });
      await activity.idle(1_000);
      console.log('LICENCE SELECTED', LICENCE);
    } else console.log('LICENCE NOT OFFERED', LICENCE);
  } else console.log('NO Dropdown_LicenseId — selects:', JSON.stringify(await page.locator('select').evaluateAll((s) => s.map((e) => e.id))));
  const duration = page.locator('select[id$="LicenseDurationDropdown"]');
  if (await duration.count()) console.log('DURATION disabled', await duration.isDisabled(), 'options', (await duration.locator('option').allInnerTexts()).join(','));
  const mineralsBox = page.locator('[data-block="Common.Minerals_DD"] [role=combobox]').first();
  if (await mineralsBox.count()) {
    const minerals = new MultiSelect(mineralsBox);
    console.log('MINERAL OPTIONS', JSON.stringify((await minerals.options()).slice(0, 40)), 'SELECTED', await minerals.selected());
  }
  await dump(page, 's1-licence');
});

import { test } from '@fixtures/test';
import * as fs from 'fs';
process.env.TEST_ENV = 'test';
test.use({ employeeUser: 'employee1' });
// Read-only probe (UC-001 expired-licence follow-up): employee home tile "الطلبات" → tab "متابعة رخص منتهية";
// dump the table headers + first rows, the search panel inputs, and one row's action menu. Nothing is submitted.
test('expired-menu', async ({ employee }) => {
  test.setTimeout(15 * 60_000);
  const page = employee.page;
  const out = 'test-results-probe/expired-menu';
  fs.mkdirSync(out, { recursive: true });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.locator('a', { hasText: /^\s*الطلبات/ }).first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(15_000);
  console.log('URL', page.url());
  await page.getByRole('tab', { name: 'متابعة رخص منتهية' }).filter({ visible: true }).first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(20_000);
  const dump = async (tag: string) => {
    fs.writeFileSync(`${out}/rq-${tag}.txt`, await page.locator('body').innerText());
    fs.writeFileSync(`${out}/rq-${tag}.html`, await page.content());
    await page.screenshot({ path: `${out}/rq-${tag}.png`, fullPage: true });
    const tables = await page.evaluate(() => Array.from(document.querySelectorAll('table'))
      .filter((t) => t.getClientRects().length > 0)
      .map((t, i) => `TABLE ${i}: ${Array.from(t.querySelectorAll('thead th')).map((h) => (h.textContent ?? '').trim()).join(' | ')}\n    `
        + Array.from(t.querySelectorAll('tbody tr')).filter((r) => r.getClientRects().length > 0).slice(0, 6)
          .map((r) => Array.from(r.querySelectorAll('td')).map((c) => `${c.getAttribute('data-header') ?? ''}=${(c.textContent ?? '').replace(/\s+/g, ' ').trim()}`).join(' ; '))
          .join('\n    ')));
    const inputs = await page.evaluate(() => Array.from(document.querySelectorAll('input, select, button'))
      .filter((e) => e.getClientRects().length > 0 && !/Checkbox/.test(e.id))
      .map((e) => `${e.tagName} #${e.id} ph="${e.getAttribute('placeholder') ?? ''}" "${(e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)}" ${e.tagName === 'SELECT' ? Array.from((e as HTMLSelectElement).options).map((o) => o.text.trim()).join(' / ') : ''}`));
    console.log(`\n===== ${tag} URL ${page.url()}\n` + tables.join('\n') + '\nCONTROLS\n  ' + [...new Set(inputs)].slice(0, 80).join('\n  '));
  };
  await dump('tab');
  // Open the search panel ("بحث(n)") to see its filters.
  const toggle = page.getByText(/^\s*بحث\(\d+\)/).filter({ visible: true }).first();
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click();
    await page.waitForTimeout(5_000);
    await dump('search');
  }
});

import { test } from '@fixtures/test';
import * as fs from 'fs';
process.env.TEST_ENV = 'test';
test.use({ employeeUser: 'employee1' });
// Read-only probe (UC-002): Request Management → tab "متابعة رخص منتهية" → "تصفية(n)". Labels + flatpickr limits of the
// date fields, then searches: empty, no match, by request number, by status "قيد التنفيذ", by "تجاوز المهلة" = نعم; row action menu.
test('expired-search', async ({ employee }) => {
  test.setTimeout(20 * 60_000);
  const page = employee.page;
  const out = 'test-results-probe/expired-search';
  fs.mkdirSync(out, { recursive: true });
  await page.goto(new URL('/Licenses/RequestsManagement', page.url()).toString());
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.getByRole('tab', { name: 'متابعة رخص منتهية' }).filter({ visible: true }).first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(15_000);
  const panel = page.getByRole('tabpanel').filter({ visible: true }).filter({ has: page.locator('[id^="b3-b13-"]') }).first();
  const filter = panel.getByText(/تصفية\s*\(\d+\)/).first();
  const searchBtn = page.getByRole('button', { name: 'البحث', exact: true }).filter({ visible: true }).first();
  const reset = page.getByRole('button', { name: 'إعادة تهيئة', exact: true }).filter({ visible: true }).first();
  const openFilter = async () => { if (!(await searchBtn.isVisible().catch(() => false))) { await filter.click(); await page.waitForTimeout(3_000); } };
  const result = async (tag: string) => {
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(8_000);
    await page.screenshot({ path: `${out}/${tag}.png`, fullPage: true });
    fs.writeFileSync(`${out}/${tag}.txt`, await page.locator('body').innerText());
    const rows = await panel.locator('table tbody tr').filter({ visible: true }).allInnerTexts();
    const pager = (await panel.locator('[class*="pagination"]').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    console.log(`\n===== ${tag}  filterLabel="${await filter.innerText().catch(() => '')}" PAGER ${pager} ROWS ${rows.length}`);
    rows.slice(0, 5).forEach((r) => console.log('   ' + r.replace(/\s+/g, ' | ')));
    const empty = await panel.locator('[class*="empty"], [class*="no-data"], [class*="NoData"]').filter({ visible: true }).allInnerTexts().catch(() => []);
    if (!rows.length || empty.length) console.log('   EMPTY TEXT:', empty.join(' / '), '| PANEL:', (await panel.innerText()).replace(/\s+/g, ' ').slice(0, 300));
  };
  await openFilter();
  // Date fields: label + flatpickr config.
  const dates = await page.evaluate(() => Array.from(document.querySelectorAll('[id^="b3-b13-b2"] input')).filter((e) => e.getClientRects().length > 0)
    .map((e) => {
      let lbl = ''; let p: Element | null = e.parentElement;
      for (let k = 0; k < 6 && p && !lbl; k++, p = p.parentElement) lbl = p.querySelector('label, .label, span[class*="label"]')?.textContent?.trim() ?? '';
      const fp = (e as unknown as { _flatpickr?: { config: { maxDate?: Date; minDate?: Date; dateFormat: string } } })._flatpickr
        ?? (e.previousElementSibling as unknown as { _flatpickr?: { config: { maxDate?: Date; minDate?: Date; dateFormat: string } } })?._flatpickr;
      return `${e.id || '(no id)'} type=${(e as HTMLInputElement).type} label="${lbl}" ph="${e.getAttribute('placeholder') ?? ''}" fp=${fp ? `max=${fp.config.maxDate} min=${fp.config.minDate} fmt=${fp.config.dateFormat}` : 'none'}`;
    }));
  console.log('FILTER INPUTS\n  ' + dates.join('\n  '));
  const labels = await page.locator('[id^="b3-b13-b2"] label, [id^="b3-b13-b2"] .form-label').filter({ visible: true }).allInnerTexts().catch(() => []);
  console.log('FILTER LABELS', labels.map((l) => l.trim()).join(' / '));
  // 1. Empty search (ALT-001).
  await searchBtn.click(); await result('a-empty');
  // 2. No match (ALT-002).
  await openFilter();
  await page.locator('#b3-b13-b2-Input_RequestNumber').fill('999999999');
  await searchBtn.click(); await result('b-no-match');
  // 3. By request number (one that exists).
  await openFilter(); await reset.click().catch(() => {}); await page.waitForTimeout(4_000); await openFilter();
  await page.locator('#b3-b13-b2-Input_RequestNumber').fill('77248');
  await searchBtn.click(); await result('c-request-77248');
  // 4. Status "قيد التنفيذ".
  await openFilter(); await reset.click().catch(() => {}); await page.waitForTimeout(4_000); await openFilter();
  await page.locator('.vscomp-toggle-button').filter({ visible: true }).filter({ hasText: 'حاله الطلب' }).first().click();
  await page.locator('.vscomp-option').filter({ visible: true }).filter({ hasText: /^\s*قيد التنفيذ\s*$/ }).first().click();
  await page.keyboard.press('Escape');
  await searchBtn.click(); await result('d-status-in-progress');
  // 5. "تجاوز المهلة النظامية؟" = نعم.
  await openFilter(); await reset.click().catch(() => {}); await page.waitForTimeout(4_000); await openFilter();
  await page.locator('#b3-b13-b2-regulatoryExceed_ddl').selectOption({ label: 'نعم' });
  await searchBtn.click(); await result('e-exceeded-yes');
  // Row action menu of the first row (not clicked).
  await openFilter(); await reset.click().catch(() => {}); await page.waitForTimeout(6_000);
  if (await searchBtn.isVisible().catch(() => false)) { await searchBtn.click(); await page.waitForTimeout(6_000); }
  const action = panel.locator('table tbody tr').filter({ visible: true }).first().locator('td').last();
  console.log('ACTION CELL', (await action.innerHTML()).replace(/\s+/g, ' ').slice(0, 600));
  await action.locator('a, button').first().click().catch(() => {});
  await page.waitForTimeout(2_000);
  console.log('ACTION MENU', (await page.locator('[class*="balloon"], [role="menu"], [class*="popover"]').filter({ visible: true }).allInnerTexts()).join(' / '));
});

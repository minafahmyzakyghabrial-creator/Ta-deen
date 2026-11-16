import { test } from '@fixtures/test';
import * as fs from 'fs';
import { TaskManagementPage } from '@pages/employee/TaskManagementPage';
process.env.TEST_ENV = 'test';
test.use({ employeeUser: 'employee1' });
// Read-only probe (UC-003): Task Management → tab "متابعة رخص منتهية". Filter panel (labels, dropdown options), empty and
// no-match searches, export, and the ⋮ menu items of the first rows (menu opened, NOTHING clicked inside it).
test('expired-tasks', async ({ employee }) => {
  test.setTimeout(20 * 60_000);
  const page = employee.page;
  const out = 'test-results-probe/expired-tasks';
  fs.mkdirSync(out, { recursive: true });
  await new TaskManagementPage(page).open();
  await page.waitForTimeout(10_000);
  await page.locator('[role="tab"], button').filter({ visible: true }).filter({ hasText: /^\s*متابعة رخص منتهية\s*$/ }).first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(12_000);
  const panel = page.getByRole('tabpanel').filter({ visible: true }).filter({ has: page.locator('[id^="b23-b6"]') }).first();
  const snap = async (tag: string) => {
    await page.screenshot({ path: `${out}/${tag}.png`, fullPage: true });
    fs.writeFileSync(`${out}/${tag}.txt`, await panel.innerText().catch(() => ''));
    const rows = await panel.locator('table tbody tr').filter({ visible: true }).allInnerTexts();
    const pager = (await panel.locator('[class*="pagination"]').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    console.log(`\n===== ${tag} ROWS ${rows.length} PAGER ${pager}`);
    rows.slice(0, 4).forEach((r) => console.log('   ' + r.replace(/\s+/g, ' | ')));
    if (!rows.length) console.log('   PANEL', (await panel.innerText()).replace(/\s+/g, ' ').slice(0, 300));
  };
  console.log('HEADERS', (await panel.locator('table thead th').allInnerTexts()).map((h) => h.trim()).join(' | '));
  await snap('0-tab');
  const toggle = panel.getByText(/(تصفية|البحث|بحث)\s*\(\d+\)/).first();
  console.log('TOGGLE', await toggle.innerText().catch(() => 'none'));
  await toggle.click();
  await page.waitForTimeout(4_000);
  const filter = await page.evaluate(() => {
    const vis = (e: Element) => e.getClientRects().length > 0;
    return Array.from(document.querySelectorAll('input, select, .vscomp-toggle-button, button')).filter(vis).filter((e) => !/Checkbox/.test(e.id))
      .map((e) => {
        let lbl = ''; let p: Element | null = e.parentElement;
        for (let k = 0; k < 5 && p && !lbl; k++, p = p.parentElement) lbl = p.querySelector('label')?.textContent?.trim() ?? '';
        const opts = e.tagName === 'SELECT' ? ' OPTIONS: ' + Array.from((e as HTMLSelectElement).options).map((o) => o.text.trim()).join(' / ') : '';
        return `${e.tagName} #${e.id} ph="${e.getAttribute('placeholder') ?? ''}" label="${lbl}" "${(e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)}"${opts}`;
      });
  });
  console.log('FILTER CONTROLS\n  ' + filter.join('\n  '));
  const allOpts = await page.evaluate(() => Array.from(document.querySelectorAll('.vscomp-ele')).filter((e) => e.getClientRects().length > 0)
    .map((e) => ((e as unknown as { virtualSelect?: { options: { label: string }[] } }).virtualSelect?.options ?? []).map((o) => o.label).join(' / ')));
  console.log('ALL VSCOMP OPTIONS | ' + allOpts.join(' || '));
  const combos = page.locator('.vscomp-toggle-button').filter({ visible: true });
  for (let i = 0; i < (await combos.count()); i++) {
    const label = (await combos.nth(i).innerText()).trim();
    await combos.nth(i).click().catch(() => {});
    await page.waitForTimeout(1_500);
    console.log(`COMBO "${label}": ${(await page.locator('.vscomp-option').filter({ visible: true }).allInnerTexts()).map((o) => o.trim()).join(' / ')}`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  }
  const search = page.getByRole('button', { name: /^\s*(البحث|بحث)\s*$/ }).filter({ visible: true }).first();
  await search.click(); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(8_000);
  await snap('1-empty-search');
  const req = page.getByPlaceholder(/رقم الطلب/).filter({ visible: true }).first();
  if (!(await req.isVisible().catch(() => false))) { await toggle.click(); await page.waitForTimeout(3_000); }
  await req.fill('999999999');
  await search.click(); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(8_000);
  await snap('2-no-match');
  await req.fill('');
  await search.click(); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(8_000);
  // Export
  const exp = panel.getByRole('button', { name: /تصدير/ }).filter({ visible: true }).first();
  if (await exp.isVisible().catch(() => false)) {
    const dl = page.waitForEvent('download', { timeout: 120_000 }).catch(() => null);
    await exp.click();
    const d = await dl;
    if (d) { await d.saveAs(`${out}/export-${d.suggestedFilename()}`); console.log('DOWNLOAD', d.suggestedFilename()); } else console.log('NO DOWNLOAD');
  } else console.log('NO EXPORT');
  // ⋮ menus of the first 3 rows — read only.
  const rows = panel.locator('table tbody tr').filter({ visible: true });
  for (let i = 0; i < Math.min(3, await rows.count()); i++) {
    await rows.nth(i).locator('td').last().locator('.osui-tooltip__content, i, button, a').first().click().catch(() => {});
    await page.waitForTimeout(1_500);
    const items = await page.locator('[id$="TooltipBallonWrapper"], [class*="balloon"]').filter({ visible: true }).locator('a, button').allInnerTexts();
    console.log(`ROW ${i} (${(await rows.nth(i).innerText()).replace(/\s+/g, ' ').slice(0, 60)}) MENU: ${items.map((t) => t.trim()).filter(Boolean).join(' / ')}`);
    await page.keyboard.press('Escape'); await page.mouse.click(5, 5); await page.waitForTimeout(800);
  }
});

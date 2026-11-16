import { test } from '@fixtures/test';
import * as fs from 'fs';
process.env.TEST_ENV = 'test';
test.use({ employeeUser: 'employee1' });
// Read-only probe (UC-002.1): Request Management → tab "متابعة رخص منتهية" → filter PROBE_REQUEST → row ⋮ → عرض.
// Dumps title, breadcrumb, every tab's text, enabled form controls and the history timeline. Nothing is submitted.
test('expired-view', async ({ employee }) => {
  test.setTimeout(20 * 60_000);
  const rn = process.env.PROBE_REQUEST ?? '77248';
  const page = employee.page;
  const out = `test-results-probe/expired-view/${rn}`;
  fs.mkdirSync(out, { recursive: true });
  await page.goto(new URL('/Licenses/RequestsManagement', page.url()).toString());
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.getByRole('tab', { name: 'متابعة رخص منتهية' }).filter({ visible: true }).first().click();
  await page.waitForTimeout(12_000);
  const panel = page.getByRole('tabpanel').filter({ visible: true }).filter({ has: page.locator('[id^="b3-b13-"]') }).first();
  await panel.getByText(/تصفية\s*\(\d+\)/).first().click();
  await page.locator('#b3-b13-b2-Input_RequestNumber').fill(rn);
  await page.getByRole('button', { name: 'البحث', exact: true }).filter({ visible: true }).first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(8_000);
  const row = panel.locator('table tbody tr').filter({ visible: true }).first();
  console.log('ROW', (await row.innerText()).replace(/\s+/g, ' | '));
  await row.locator('td').last().locator('.osui-tooltip__content, i').first().click();
  await page.waitForTimeout(2_000);
  const items = page.locator('[id$="TooltipBallonWrapper"]').filter({ visible: true }).locator('a, button');
  console.log('MENU ITEMS', (await items.allInnerTexts()).map((t) => t.trim()).join(' / '));
  const popup = page.context().waitForEvent('page', { timeout: 20_000 }).catch(() => null);
  await items.filter({ hasText: /عرض|استعراض/ }).first().click();
  const newTab = await popup;
  const view = newTab ?? page;
  await view.waitForLoadState('networkidle').catch(() => {});
  await view.waitForTimeout(20_000);
  console.log('NEW TAB?', !!newTab, 'URL', view.url());
  const dumpTab = async (tag: string) => {
    fs.writeFileSync(`${out}/${tag}.txt`, await view.locator('body').innerText());
    fs.writeFileSync(`${out}/${tag}.html`, await view.content());
    await view.screenshot({ path: `${out}/${tag}.png`, fullPage: true });
    const enabled = await view.evaluate(() => Array.from(document.querySelectorAll('input, select, textarea, button'))
      .filter((e) => e.getClientRects().length > 0 && !(e as HTMLInputElement).disabled && !(e as HTMLInputElement).readOnly)
      .map((e) => `${e.tagName} type=${(e as HTMLInputElement).type} #${e.id} "${(e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)}"`));
    const main = await view.locator('main, .main-content, .content').first().innerText().catch(async () => view.locator('body').innerText());
    console.log(`\n===== ${tag}\n${main.replace(/\n{2,}/g, '\n').slice(0, 2500)}\nENABLED CONTROLS: ${enabled.join(' ; ')}`);
  };
  console.log('TITLE', await view.title(), '| H1', (await view.locator('h1, h2, .page-title, [class*="title"]').filter({ visible: true }).allInnerTexts()).slice(0, 6).join(' / '));
  console.log('BREADCRUMB', (await view.locator('[class*="breadcrumb"]').filter({ visible: true }).allInnerTexts()).join(' / '));
  const names = ['ملف الشركة', 'تفاصيل الطلب', 'المهام المرتبطة', 'سجل الطلب'];
  await dumpTab('0-default');
  for (let i = 0; i < names.length; i++) {
    await view.locator('button', { hasText: names[i] }).filter({ visible: true }).first().click();
    await view.waitForLoadState('networkidle').catch(() => {});
    await view.waitForTimeout(8_000);
    await dumpTab(`${i + 1}-${names[i].replace(/[^\p{L}\p{N}]+/gu, '_')}`);
  }
});

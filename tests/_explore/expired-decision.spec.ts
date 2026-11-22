import fs from 'fs';
import { test } from '@fixtures/test';
import { Page } from '@playwright/test';
import { UserKey } from '@config/index';
import { ExpiredFollowUpTasksPage } from '@pages/employee/expired-license/ExpiredFollowUpTasksPage';
process.env.TEST_ENV = 'test';

// Read-only probe (NO submit): dumps the respond panel of the CURRENT task of REQUEST as USER (assigns it when unassigned
// only if ASSIGN=1). Prints every visible control with its options, the panel text and a screenshot.
const RN = process.env.REQUEST ?? '77433';
const USER = (process.env.USER_KEY ?? 'employee2') as UserKey;
const OUT = `test-results-probe/decision/${RN}`;

async function controls(p: Page): Promise<string[]> {
  return p.evaluate(() => Array.from(document.querySelectorAll('input, select, textarea, button, .vscomp-ele, label'))
    .filter((e) => e.getClientRects().length > 0)
    .map((e) => {
      const vs = (e as unknown as { virtualSelect?: { options: { label: string }[] } }).virtualSelect;
      const opts = e.tagName === 'SELECT' ? Array.from((e as HTMLSelectElement).options).map((o) => o.text.trim()).join(' / ') : vs ? vs.options.map((o) => o.label).join(' / ') : '';
      const i = e as HTMLInputElement;
      return `${e.tagName}${i.type ? ` type=${i.type}` : ''} #${e.id} "${(e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)}"${i.disabled ? ' DISABLED' : ''}${i.checked ? ' CHECKED' : ''}${opts ? ` OPTIONS: ${opts}` : ''}`;
    }));
}

test(`decision probe (${RN} as ${USER}, no submit)`, async ({ sessions }) => {
  test.setTimeout(15 * 60_000);
  fs.mkdirSync(OUT, { recursive: true });
  const { page } = await sessions.as(USER);
  const tasks = new ExpiredFollowUpTasksPage(page);
  await tasks.open();
  const rows = await tasks.search({ request: RN });
  console.log('ROWS', JSON.stringify(rows));
  if (!rows.length) return;
  const menu = await tasks.menu(RN).actions();
  console.log('MENU', menu);
  await page.keyboard.press('Escape');
  if (menu.includes('إسناد إلى') && process.env.ASSIGN === '1') await tasks.assignToMe(RN);
  const action = (await tasks.menu(RN).actions()).find((a) => a === 'الرد على الطلب') ?? 'الرد على الطلب (للقراءة فقط)';
  await page.keyboard.press('Escape');
  console.log('OPENING', action);
  const popup = page.context().waitForEvent('page', { timeout: 120_000 });
  await tasks.menu(RN).click(action);
  const p = await popup;
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.waitForTimeout(15_000);
  const respond = p.locator('button', { hasText: /الرد عل[ىي] الطلب/ }).filter({ visible: true }).first();
  if (await respond.isVisible().catch(() => false)) { await respond.click(); await p.waitForTimeout(6_000); }
  console.log('TITLE', await p.title(), 'URL', p.url());
  console.log('CONTROLS\n  ' + (await controls(p)).join('\n  '));
  // Open every virtual-select so its options render, then read them again.
  for (const t of await p.locator('.vscomp-toggle-button').filter({ visible: true }).all()) {
    await t.click().catch(() => {});
    await p.waitForTimeout(1_000);
    console.log('DROPDOWN OPTIONS', (await p.locator('.vscomp-option').filter({ visible: true }).allInnerTexts()).map((s) => s.trim()).join(' / '));
    await p.keyboard.press('Escape');
  }
  const text = (await p.locator('body').innerText()).replace(/\n{2,}/g, '\n');
  console.log('PANEL TEXT\n' + text.slice(text.lastIndexOf('الرد عل') > 0 ? text.lastIndexOf('الرد عل') : 0).slice(0, 4000));
  fs.writeFileSync(`${OUT}/${USER}.html`, await p.content());
  await p.screenshot({ path: `${OUT}/${USER}.png`, fullPage: true });
});

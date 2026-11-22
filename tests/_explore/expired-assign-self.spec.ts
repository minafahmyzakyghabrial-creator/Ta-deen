import fs from 'fs';
import { test } from '@fixtures/test';
import { UserKey } from '@config/index';
import { ExpiredFollowUpTasksPage } from '@pages/employee/expired-license/ExpiredFollowUpTasksPage';
process.env.TEST_ENV = 'test';

// Assigns the current task of REQUEST to USER_KEY itself ("إلغاء الإسناد" first when it is held, then "إسناد إلى"),
// then reads the menu and opens "الرد على الطلب" when offered. NO submit.
const RN = process.env.REQUEST ?? '77497';
const USER = (process.env.USER_KEY ?? 'employee3') as UserKey;
const OUT = `test-results-probe/assign-self/${RN}`;

test(`assign ${RN} to ${USER} (no submit)`, async ({ sessions }) => {
  test.setTimeout(10 * 60_000);
  fs.mkdirSync(OUT, { recursive: true });
  const { page } = await sessions.as(USER);
  const t = new ExpiredFollowUpTasksPage(page);
  await t.open();
  await t.search({ request: RN });
  const menu = async () => { const m = await t.menu(RN).actions(); await page.keyboard.press('Escape'); return m; };
  let m = await menu();
  console.log('MENU BEFORE', m);
  if (m.includes('إلغاء الإسناد') && !m.includes('الرد على الطلب')) {
    await t.menu(RN).click('إلغاء الإسناد');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(6_000);
    await t.search({ request: RN });
    m = await menu();
    console.log('MENU AFTER UNASSIGN', m);
  }
  if (m.includes('إسناد إلى')) {
    await t.menu(RN).click('إسناد إلى');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(6_000);
    const msgs = await page.locator('[class*="feedback-message"], [role="alert"]').filter({ visible: true }).allInnerTexts().catch(() => []);
    console.log('ASSIGN MESSAGES', msgs);
    await t.search({ request: RN });
    m = await menu();
    console.log('MENU AFTER ASSIGN TO SELF', m);
  }
  await page.screenshot({ path: `${OUT}/${USER}-menu.png` });
  if (m.includes('الرد على الطلب')) {
    const popup = page.context().waitForEvent('page', { timeout: 120_000 });
    await t.menu(RN).click('الرد على الطلب');
    const p = await popup;
    await p.waitForLoadState('networkidle').catch(() => {});
    await p.waitForTimeout(12_000);
    console.log('RESPOND PAGE', await p.title(), p.url());
    await p.screenshot({ path: `${OUT}/${USER}-respond.png` });
  }
});
